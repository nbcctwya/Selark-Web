import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/http';
import type { Backups, DashboardApi, Filters, Logs, ModelApproval, RecordsPage, Snapshot } from '../api/types';

export interface RecordQueryState { offset: number; errors: boolean }
export interface Outcome { tone: 'good' | 'warn' | 'bad'; text: string }
type Part = 'records' | 'logs' | 'backups';

export interface DashboardState {
  snapshot: Snapshot | null;
  records: RecordsPage | null;
  logs: Logs | null;
  backups: Backups | null;
  /** Per-section read failures. A missing section is never rendered as "empty". */
  failures: Record<Part, string | null>;
  loading: boolean;
  recordsLoading: boolean;
  /** Last full read failed while an older snapshot is still on screen. */
  stale: boolean;
  error: string | null;
  authRequired: boolean;
  authMessage: string;
  loadedAt: number | null;
}

const READ_TIMEOUT = 20000;
const noFailures: Record<Part, string | null> = { records: null, logs: null, backups: null };
const initial: DashboardState = {
  snapshot: null, records: null, logs: null, backups: null, failures: noFailures,
  loading: true, recordsLoading: false, stale: false, error: null, authRequired: false, authMessage: '', loadedAt: null,
};

const reason = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;
const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';
const isExpired = (error: unknown): error is ApiError => error instanceof ApiError && error.status === 401;

/** Records always use the exact window the summary used, so a rolling period cannot drift between calls. */
function pinned(filters: Filters, snapshot: Snapshot | null): Filters {
  return snapshot?.usage ? { ...filters, period: 'custom', since: snapshot.usage.filters.since, until: snapshot.usage.filters.until } : filters;
}

function withTimeout(controller: AbortController, message: string) {
  return setTimeout(() => controller.abort(new DOMException(message, 'TimeoutError')), READ_TIMEOUT);
}

export function useDashboard(api: DashboardApi, bootstrap: string | null, filters: Filters, query: RecordQueryState) {
  const [state, setState] = useState<DashboardState>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const generation = useRef(0);
  const current = useRef<AbortController | null>(null);
  const recordsController = useRef<AbortController | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const refreshing = useRef(false);
  const snapshotRef = useRef<Snapshot | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  const expire = useCallback((message: string) => {
    api.clearSession();
    current.current?.abort();
    recordsController.current?.abort();
    snapshotRef.current = null;
    generation.current++;
    // Drop every resource value; the view also closes any open detail when it sees authRequired.
    setState({ ...initial, loading: false, authRequired: true, authMessage: message || '管理会话已失效。' });
  }, [api]);

  const loadRecords = useCallback(async () => {
    const snapshot = snapshotRef.current;
    if (!snapshot) return;
    recordsController.current?.abort();
    const controller = new AbortController();
    recordsController.current = controller;
    const timer = withTimeout(controller, '读取调用记录超时。');
    const { offset, errors } = queryRef.current;
    setState(s => ({ ...s, recordsLoading: true }));
    try {
      const records = await api.records({ ...pinned(filters, snapshot), offset, errors }, controller.signal);
      if (recordsController.current !== controller) return;
      setState(s => ({ ...s, records, recordsLoading: false, failures: { ...s.failures, records: null } }));
    } catch (error) {
      if (recordsController.current !== controller || isAbort(error)) return;
      if (isExpired(error)) { expire(error.message); return; }
      setState(s => ({ ...s, records: null, recordsLoading: false, failures: { ...s.failures, records: reason(error, '调用记录暂不可读。') } }));
    } finally { clearTimeout(timer); }
  }, [api, filters, expire]);

  const refresh = useCallback(async (): Promise<boolean> => {
    current.current?.abort();
    recordsController.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    const version = ++generation.current;
    const timer = withTimeout(controller, '读取超时，请重试。');
    refreshing.current = true;
    setState(s => ({ ...s, loading: true }));
    const used = queryRef.current;
    try {
      await api.initialize(bootstrap);
      controller.signal.throwIfAborted();
      const snapshot = await api.snapshot(filters, controller.signal);
      const [records, logs, backups] = await Promise.allSettled([
        api.records({ ...pinned(filters, snapshot), offset: used.offset, errors: used.errors }, controller.signal),
        api.logs(controller.signal),
        api.backups(controller.signal),
      ]);
      controller.signal.throwIfAborted();
      if (version !== generation.current) return false;
      const expired = [records, logs, backups].find(r => r.status === 'rejected' && isExpired(r.reason));
      if (expired?.status === 'rejected') throw expired.reason;
      const fail = (result: PromiseSettledResult<unknown>, fallback: string) => result.status === 'rejected' ? reason(result.reason, fallback) : null;
      snapshotRef.current = snapshot;
      setState({
        snapshot,
        records: records.status === 'fulfilled' ? records.value : null,
        logs: logs.status === 'fulfilled' ? logs.value : null,
        backups: backups.status === 'fulfilled' ? backups.value : null,
        failures: { records: fail(records, '调用记录暂不可读。'), logs: fail(logs, '日志暂不可读。'), backups: fail(backups, '备份目录暂不可读。') },
        loading: false, recordsLoading: false, stale: false, error: null, authRequired: false, authMessage: '', loadedAt: Date.now(),
      });
      return true;
    } catch (error) {
      if (version !== generation.current) return false;
      if (isExpired(error)) { expire(error.message); return false; }
      const timedOut = controller.signal.reason instanceof DOMException && controller.signal.reason.name === 'TimeoutError';
      if (isAbort(error) && !timedOut) return false;
      const message = timedOut ? '读取超时，请重试。' : reason(error, '本地数据暂时不可读。');
      setState(s => ({ ...s, loading: false, stale: Boolean(s.snapshot), error: message }));
      return false;
    } finally {
      clearTimeout(timer);
      if (version === generation.current) {
        refreshing.current = false;
        // The record query changed while this read was in flight: follow up with the newer page.
        if (queryRef.current.offset !== used.offset || queryRef.current.errors !== used.errors) void loadRecords();
      }
    }
  }, [api, bootstrap, filters, expire, loadRecords]);

  useEffect(() => {
    void refresh();
    return () => { generation.current++; current.current?.abort(); recordsController.current?.abort(); refreshing.current = false; };
  }, [refresh]);

  // Paging and the error toggle only reload the record list, keeping the summary in place.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!refreshing.current) void loadRecords();
  }, [query.offset, query.errors]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => mutation.current?.abort(), [api]);

  /** One explicit write. Never retried automatically: a timeout does not prove the change did not happen. */
  const setModelApproval = useCallback(async (change: ModelApproval): Promise<Outcome | null> => {
    if (locked.current) return null;
    locked.current = true;
    setSaving(`${change.connection_id}::${change.model}`);
    const controller = new AbortController();
    mutation.current = controller;
    const timer = setTimeout(() => controller.abort(new DOMException('保存超时', 'TimeoutError')), READ_TIMEOUT);
    try {
      const result = await api.setModelApproval(change, controller.signal);
      const loaded = await refresh();
      const verb = result.enabled ? '已启用' : '已禁用';
      return loaded
        ? { tone: 'good', text: `${result.model} ${verb}。应用授权保持不变${result.default_model === null && change.clear_default ? '，默认模型已清除' : ''}。` }
        : { tone: 'warn', text: `${result.model} ${verb}，但快照未能刷新；请刷新核对当前状态。` };
    } catch (error) {
      if (isExpired(error)) { expire(error.message); return null; }
      if (error instanceof ApiError && error.status === 409) {
        await refresh();
        return { tone: 'warn', text: `${error.message} 已刷新最新状态，请核对后再次操作；操作不会自动重试。` };
      }
      if (controller.signal.aborted || isAbort(error)) {
        return { tone: 'warn', text: '保存超时，结果尚未确认。请刷新核对；操作不会自动重试。' };
      }
      return { tone: 'bad', text: `${reason(error, '保存结果未确认，请刷新查看。')} 操作不会自动重试。` };
    } finally {
      clearTimeout(timer);
      locked.current = false;
      setSaving(null);
    }
  }, [api, refresh, expire]);

  return { ...state, saving, refresh, setModelApproval };
}

export type Dashboard = ReturnType<typeof useDashboard>;
