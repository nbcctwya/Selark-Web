import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/http';
import type { Backups, Capabilities, DashboardApi, Filters, Logs, RecordsPage, Snapshot } from '../api/types';

export interface RecordQueryState { offset: number; errors: boolean }
export interface Outcome { tone: 'good' | 'warn' | 'bad'; text: string }
/** Result of one explicit write. `code` mirrors the backend's machine code for 4xx responses. */
export type WriteResult<T> = { ok: true; value: T; refreshed: boolean } | { ok: false; status: number | null; code?: string; outcome: Outcome };
export interface WriteOptions { key: string; timeout?: number; refreshOn409?: boolean }
type Part = 'records' | 'logs' | 'backups' | 'capabilities';

export interface DashboardState {
  snapshot: Snapshot | null;
  records: RecordsPage | null;
  logs: Logs | null;
  backups: Backups | null;
  /** Operation switches from GET /api/capabilities; null when unreadable (all management entries stay closed). */
  capabilities: Capabilities | null;
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
const noFailures: Record<Part, string | null> = { records: null, logs: null, backups: null, capabilities: null };
const initial: DashboardState = {
  snapshot: null, records: null, logs: null, backups: null, capabilities: null, failures: noFailures,
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
  const sessionGeneration = useRef(0);
  const locked = useRef(false);
  const refreshing = useRef(false);
  const snapshotRef = useRef<Snapshot | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  const expire = useCallback((message: string) => {
    api.clearSession();
    current.current?.abort();
    recordsController.current?.abort();
    mutation.current?.abort();
    sessionGeneration.current++;
    snapshotRef.current = null;
    generation.current++;
    // Drop every resource value; the view also closes any open detail when it sees authRequired.
    setState({ ...initial, loading: false, authRequired: true, authMessage: message || '管理会话已失效。' });
  }, [api]);

  // Detail reads share the same expiry handling and deadline as the main dashboard.
  const read = useCallback(async <T,>(operation: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> => {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(READ_TIMEOUT)]);
    try {
      const value = await operation(bounded);
      bounded.throwIfAborted();
      return value;
    } catch (error) {
      if (isExpired(error)) expire(error.message);
      throw error;
    }
  }, [expire]);

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
      const part = <T,>(result: Promise<T>) => result.catch(error => {
        // Expire immediately; another section may wait until the shared deadline.
        if (version === generation.current && isExpired(error)) expire(error.message);
        throw error;
      });
      const [records, logs, backups, capabilities] = await Promise.allSettled([
        part(api.records({ ...pinned(filters, snapshot), offset: used.offset, errors: used.errors }, controller.signal)),
        part(api.logs(controller.signal)),
        part(api.backups(controller.signal)),
        part(api.getCapabilities(controller.signal)),
      ]);
      controller.signal.throwIfAborted();
      if (version !== generation.current) return false;
      const fail = (result: PromiseSettledResult<unknown>, fallback: string) => result.status === 'rejected' ? reason(result.reason, fallback) : null;
      snapshotRef.current = snapshot;
      setState({
        snapshot,
        records: records.status === 'fulfilled' ? records.value : null,
        logs: logs.status === 'fulfilled' ? logs.value : null,
        backups: backups.status === 'fulfilled' ? backups.value : null,
        capabilities: capabilities.status === 'fulfilled' ? capabilities.value : null,
        failures: { records: fail(records, '调用记录暂不可读。'), logs: fail(logs, '日志暂不可读。'), backups: fail(backups, '备份目录暂不可读。'), capabilities: fail(capabilities, '操作开关暂不可读，管理入口已关闭。') },
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

  /**
   * One explicit write. Never retried: a timeout or lost response does not prove the change did not happen.
   * Success refreshes the snapshot. 409 refreshes too (unless the caller handles the code itself) and asks
   * the user to act again; a 401 clears everything on screen.
   */
  const run = useCallback(async <T,>(operation: (signal: AbortSignal) => Promise<T>, options: WriteOptions): Promise<WriteResult<T> | null> => {
    if (locked.current) return null;
    locked.current = true;
    const sessionVersion = sessionGeneration.current;
    setSaving(options.key);
    const controller = new AbortController();
    mutation.current = controller;
    const timer = setTimeout(() => controller.abort(new DOMException('保存超时', 'TimeoutError')), options.timeout ?? READ_TIMEOUT);
    try {
      const value = await operation(controller.signal);
      clearTimeout(timer);
      if (sessionVersion !== sessionGeneration.current) return null;
      const refreshed = await refresh();
      if (sessionVersion !== sessionGeneration.current) return null;
      return { ok: true, value, refreshed };
    } catch (error) {
      if (sessionVersion !== sessionGeneration.current) return null;
      if (isExpired(error)) { expire(error.message); return null; }
      if (error instanceof ApiError) {
        if (error.status === 409 && error.code !== 'default_model_confirmation' && options.refreshOn409 !== false) {
          await refresh();
          return { ok: false, status: 409, code: error.code, outcome: { tone: 'warn', text: `${error.message} 已刷新最新状态，请核对后再次操作；操作不会自动重试。` } };
        }
        return { ok: false, status: error.status, code: error.code, outcome: { tone: error.status >= 500 ? 'bad' : 'warn', text: `${error.message}${error.status === 405 ? ' 当前启动模式不允许此操作。' : ''}` } };
      }
      if (controller.signal.aborted || isAbort(error)) {
        return { ok: false, status: null, outcome: { tone: 'warn', text: '请求超时，结果尚未确认。请刷新核对；操作不会自动重试。' } };
      }
      return { ok: false, status: null, outcome: { tone: 'bad', text: `${reason(error, '连接中断。')} 结果尚未确认，请刷新核对；操作不会自动重试。` } };
    } finally {
      clearTimeout(timer);
      locked.current = false;
      setSaving(null);
    }
  }, [refresh, expire]);

  return { ...state, saving, refresh, read, run, api };
}

export type Dashboard = ReturnType<typeof useDashboard>;
