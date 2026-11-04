import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/http';
import type { Backups, DashboardApi, Filters, Logs, ModelApproval, RecordsPage, Snapshot } from '../api/types';

interface Data { snapshot: Snapshot | null; records: RecordsPage | null; logs: Logs | null; backups: Backups | null }
const empty: Data = { snapshot: null, records: null, logs: null, backups: null };

export function useDashboard(api: DashboardApi, bootstrap: string | null, filters: Filters, offset: number, errorsOnly: boolean) {
  const [data, setData] = useState<Data>(empty);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  const current = useRef<AbortController | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const locked = useRef(false);

  const expire = useCallback((text: string) => {
    api.clearSession(); setData(empty); setAuthRequired(true); setMessage(text);
  }, [api]);

  const refresh = useCallback(async () => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    const version = ++generation.current;
    const timeout = setTimeout(() => controller.abort(new DOMException('读取超时，请重试。', 'TimeoutError')), 20000);
    setLoading(true);
    try {
      await api.initialize(bootstrap);
      controller.signal.throwIfAborted();
      const snapshot = await api.snapshot(filters, controller.signal);
      // Pin the table to the exact same window as the summary.
      const recordsFilters: Filters = snapshot.usage ? { ...filters, period: 'custom', since: snapshot.usage.filters.since, until: snapshot.usage.filters.until } : filters;
      const [records, logs, backups] = await Promise.allSettled([
        api.records({ ...recordsFilters, offset, errors: errorsOnly }, controller.signal),
        api.logs(controller.signal), api.backups(controller.signal),
      ]);
      controller.signal.throwIfAborted();
      if (version !== generation.current) return false;
      const expired = [records, logs, backups].find(r => r.status === 'rejected' && r.reason instanceof ApiError && r.reason.status === 401);
      if (expired?.status === 'rejected') throw expired.reason;
      setData({ snapshot, records: records.status === 'fulfilled' ? records.value : null, logs: logs.status === 'fulfilled' ? logs.value : null, backups: backups.status === 'fulfilled' ? backups.value : null });
      setAuthRequired(false);
      setMessage([...snapshot.issues, ...([records, logs, backups].some(r => r.status === 'rejected') ? ['部分数据读取失败，可刷新重试。'] : [])].join(' '));
      return true;
    } catch (error) {
      if (version !== generation.current || (error instanceof DOMException && error.name === 'AbortError')) return false;
      if (error instanceof ApiError && error.status === 401) expire(error.message);
      else setMessage(`${error instanceof Error ? error.message : '读取失败。'} 已加载的数据为上次成功读取的快照。`);
      return false;
    } finally {
      clearTimeout(timeout);
      if (version === generation.current) setLoading(false);
    }
  }, [api, bootstrap, filters, offset, errorsOnly, expire]);

  useEffect(() => {
    void refresh();
    return () => { generation.current++; current.current?.abort(); };
  }, [refresh]);
  useEffect(() => () => mutation.current?.abort(), [api]);

  async function setModelApproval(change: ModelApproval) {
    if (locked.current) return;
    locked.current = true; setSaving(true);
    const controller = new AbortController(); mutation.current = controller;
    const timeout = setTimeout(() => controller.abort(new DOMException('保存超时，请刷新确认结果。', 'TimeoutError')), 20000);
    try {
      await api.setModelApproval(change, controller.signal);
      const loaded = await refresh();
      if (loaded) setMessage('模型设置已保存。');
      else setMessage('模型设置已保存，快照未能刷新；请刷新确认状态。');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) expire(error.message);
      else {
        if (error instanceof ApiError && error.status === 409) await refresh();
        setMessage(`${error instanceof Error ? error.message : '保存结果未确认，请刷新查看。'} 操作不会自动重试。`);
      }
    } finally { clearTimeout(timeout); locked.current = false; setSaving(false); }
  }

  return { ...data, loading, authRequired, message, saving, refresh, setModelApproval };
}
