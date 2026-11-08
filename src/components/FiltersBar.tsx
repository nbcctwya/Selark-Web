import { useEffect, useState } from 'react';
import type { Filters, Period, Snapshot } from '../api/types';
import { shortTime } from '../lib/format';
import { Icon } from './Icon';
import { Button, Segmented } from './ui';

const periods: { value: Period; label: string; title: string }[] = [
  { value: '24h', label: '24 小时', title: '最近 24 小时' },
  { value: '7d', label: '7 天', title: '最近 7 天' },
  { value: '30d', label: '30 天', title: '最近 30 天' },
  { value: '90d', label: '90 天', title: '最近 90 天' },
  { value: 'custom', label: '自定义', title: '自定义时间范围' },
];

function toLocalInput(iso: string | undefined) {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export const isFiltered = (filters: Filters) => Boolean(filters.caller_id || filters.connection_id || filters.model || (filters.period && filters.period !== '7d'));

export function FiltersBar({ filters, snapshot, onChange }: { filters: Filters; snapshot: Snapshot; onChange: (value: Filters) => void }) {
  const [period, setPeriod] = useState<Period>(filters.period ?? '7d');
  const [since, setSince] = useState(toLocalInput(filters.since));
  const [until, setUntil] = useState(toLocalInput(filters.until));
  const [error, setError] = useState('');
  useEffect(() => { setPeriod(filters.period ?? '7d'); setSince(toLocalInput(filters.since)); setUntil(toLocalInput(filters.until)); }, [filters]);

  const models = [...new Set([...snapshot.options.models, ...snapshot.connections.flatMap(c => c.models)])].sort();
  const connections = [...new Set([...snapshot.options.connections, ...snapshot.connections.map(c => c.id)])].sort();
  const connectionName = (id: string) => snapshot.connections.find(c => c.id === id)?.name ?? `${id}（历史）`;

  function pick(next: Period) {
    setPeriod(next); setError('');
    if (next !== 'custom') onChange({ ...filters, period: next, since: undefined, until: undefined });
  }
  function applyRange() {
    const start = Date.parse(since), end = Date.parse(until);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 366 * 86400000) {
      setError('请选择有效时间：结束晚于开始，范围不超过 366 天。'); return;
    }
    setError('');
    onChange({ ...filters, period: 'custom', since: new Date(start).toISOString(), until: new Date(end).toISOString() });
  }
  const set = (key: 'caller_id' | 'connection_id' | 'model', value: string) => onChange({ ...filters, [key]: value || undefined });
  const window = snapshot.usage?.filters;

  return <section className="filters" aria-label="用量与调用记录筛选">
    <div className="filters-row">
      <Segmented label="时间范围" value={period} onChange={pick} options={periods} />
      <div className="filter-selects">
        <label className={`chip-select${filters.caller_id ? ' set' : ''}`}><span>应用</span>
          <select aria-label="应用" value={filters.caller_id ?? ''} onChange={e => set('caller_id', e.target.value)}>
            <option value="">全部</option>{snapshot.applications.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select><Icon name="chevronDown" size={14} /></label>
        <label className={`chip-select${filters.connection_id ? ' set' : ''}`}><span>连接</span>
          <select aria-label="连接" value={filters.connection_id ?? ''} onChange={e => set('connection_id', e.target.value)}>
            <option value="">全部</option>{connections.map(id => <option key={id} value={id}>{connectionName(id)}</option>)}
          </select><Icon name="chevronDown" size={14} /></label>
        <label className={`chip-select${filters.model ? ' set' : ''}`}><span>模型</span>
          <select aria-label="模型" value={filters.model ?? ''} onChange={e => set('model', e.target.value)}>
            <option value="">全部</option>{models.map(id => <option key={id} value={id}>{id}</option>)}
          </select><Icon name="chevronDown" size={14} /></label>
        {isFiltered(filters) && <Button size="sm" variant="ghost" onClick={() => { setError(''); onChange({ period: '7d' }); }}>重置筛选</Button>}
      </div>
      {window && <p className="filters-window" title="开始包含、结束不包含；趋势按 UTC 日分组">
        <Icon name="calendar" size={14} />{shortTime(window.since)} → {shortTime(window.until)}
      </p>}
    </div>
    {period === 'custom' && <div className="filters-custom">
      <label>开始时间<input type="datetime-local" value={since} onChange={e => setSince(e.target.value)} /></label>
      <label>结束时间<input type="datetime-local" value={until} onChange={e => setUntil(e.target.value)} /></label>
      <Button variant="primary" size="sm" onClick={applyRange}>应用时间</Button>
      <small>按浏览器本地时区输入；结束时间不包含，最长 366 天。</small>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>}
  </section>;
}
