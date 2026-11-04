import { useEffect, useState } from 'react';
import type { Filters, Period, Snapshot } from '../api/types';

export function FiltersBar({ filters, snapshot, onChange }: { filters: Filters; snapshot: Snapshot; onChange: (value: Filters) => void }) {
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState('');
  useEffect(() => setDraft(filters), [filters]);
  function apply() {
    if (draft.period === 'custom') {
      const start = Date.parse(draft.since ?? ''), end = Date.parse(draft.until ?? '');
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 366 * 86400000) {
        setError('请选择有效时间，范围须大于零且不超过 366 天。'); return;
      }
    }
    setError(''); onChange({ ...draft });
  }
  const models = [...new Set([...snapshot.options.models, ...snapshot.connections.flatMap(c => c.models)])].sort();
  const connections = [...new Set([...snapshot.options.connections, ...snapshot.connections.map(c => c.id)])].sort();
  return <section className="filters" aria-label="用量和记录筛选">
    <label>时间范围<select aria-label="时间范围" value={draft.period ?? '7d'} onChange={e => setDraft({ ...draft, period: e.target.value as Period })}>
      <option value="24h">最近 24 小时</option><option value="7d">最近 7 天</option><option value="30d">最近 30 天</option><option value="90d">最近 90 天</option><option value="custom">自定义</option>
    </select></label>
    <label>应用<select aria-label="应用" value={draft.caller_id ?? ''} onChange={e => setDraft({ ...draft, caller_id: e.target.value })}><option value="">全部应用</option>{snapshot.applications.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <label>连接<select aria-label="连接" value={draft.connection_id ?? ''} onChange={e => setDraft({ ...draft, connection_id: e.target.value })}><option value="">全部连接</option>{connections.map(id => <option key={id} value={id}>{snapshot.connections.find(c => c.id === id)?.name ?? id}</option>)}</select></label>
    <label>模型<select aria-label="模型" value={draft.model ?? ''} onChange={e => setDraft({ ...draft, model: e.target.value })}><option value="">全部模型</option>{models.map(id => <option key={id}>{id}</option>)}</select></label>
    {draft.period === 'custom' && <>
      <label>开始时间<input type="datetime-local" onChange={e => setDraft({ ...draft, since: e.target.value ? new Date(e.target.value).toISOString() : '' })} /></label>
      <label>结束时间<input type="datetime-local" onChange={e => setDraft({ ...draft, until: e.target.value ? new Date(e.target.value).toISOString() : '' })} /></label>
    </>}
    <button onClick={apply}>应用筛选</button><button className="secondary" onClick={() => { setError(''); onChange({ period: '7d' }); }}>重置</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
