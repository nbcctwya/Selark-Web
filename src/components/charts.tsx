import { useId, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { TrendPoint, UsageSummary } from '../api/types';
import { compact, decimalString, duration, label, number, percent, utcDay } from '../lib/format';
import { Button, Empty, Segmented, useWidth } from './ui';

export type Metric = 'tokens' | 'requests' | 'cost' | 'success' | 'latency';
const metricNames: Record<Metric, string> = { tokens: 'Token', requests: '调用', cost: '费用估算', success: '成功率', latency: '平均耗时' };

function valueOf(point: TrendPoint, metric: Metric, currency: string): number | null {
  switch (metric) {
    case 'tokens': return point.known_tokens.total_tokens;
    case 'requests': return point.requests;
    case 'cost': { const v = point.estimated_cost_by_currency[currency]; return v == null ? null : Number(v); }
    case 'success': return point.success_rate == null ? null : point.success_rate * 100;
    case 'latency': return point.average_latency_ms;
  }
}

function display(point: TrendPoint, metric: Metric, currency: string): string {
  const value = valueOf(point, metric, currency);
  if (value == null) return point.requests ? '未知' : '无调用';
  if (metric === 'cost') return `${currency} ${decimalString(point.estimated_cost_by_currency[currency])}`;
  if (metric === 'success') return `${value.toFixed(1)}%`;
  if (metric === 'latency') return duration(value);
  return number(value);
}

function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(s => s * power >= value) ?? 10;
  return step * power;
}

function tick(value: number, metric: Metric) {
  if (metric === 'success') return `${Math.round(value)}%`;
  if (metric === 'latency') return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}s` : `${Math.round(value)}ms`;
  if (metric === 'cost') return value === 0 ? '0' : value < 0.01 ? value.toExponential(0) : value < 10 ? value.toFixed(2) : compact(value);
  return compact(value);
}

/** Bar with rounded data-end, anchored square to the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function TrendChart({ trend, summary, initialMetric = 'tokens', height = 232 }: { trend: TrendPoint[]; summary: UsageSummary; initialMetric?: Metric; height?: number }) {
  const [metric, setMetric] = useState<Metric>(initialMetric);
  const currencies = useMemo(() => [...new Set([...Object.keys(summary.estimated_cost_by_currency), ...trend.flatMap(p => Object.keys(p.estimated_cost_by_currency))])].sort(), [summary, trend]);
  const [currencyChoice, setCurrency] = useState('');
  const currency = currencies.includes(currencyChoice) ? currencyChoice : currencies[0] ?? '';
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const [wrap, width] = useWidth<HTMLDivElement>();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const left = 46, right = 10, top = 18, bottom = 28;
  const plotW = Math.max(120, width - left - right), plotH = height - top - bottom;
  const values = trend.map(p => valueOf(p, metric, currency));
  const known = values.filter((v): v is number => v != null && Number.isFinite(v));
  const max = metric === 'success' ? 100 : niceMax(Math.max(...known, 0) * 1.08);
  const step = plotW / Math.max(1, trend.length);
  const x = (i: number) => left + step * (i + 0.5);
  const y = (v: number) => top + plotH * (1 - v / max);
  const bars = metric === 'tokens' || metric === 'requests' || metric === 'cost';
  const barW = Math.max(2, Math.min(26, step * 0.62));
  const labelEvery = Math.max(1, Math.ceil(trend.length / Math.max(2, Math.floor(plotW / 58))));

  let line = '', area = '', open = false, lastX = 0, firstX = 0;
  if (!bars) values.forEach((v, i) => {
    if (v == null) {
      if (open) area += `L${lastX},${top + plotH}L${firstX},${top + plotH}Z`;
      open = false; return;
    }
    const px = x(i), py = y(v);
    if (!open) { firstX = px; line += `M${px},${py}`; area += `M${px},${top + plotH}L${px},${py}`; }
    else { line += `L${px},${py}`; area += `L${px},${py}`; }
    open = true; lastX = px;
  });
  if (!bars && open) area += `L${lastX},${top + plotH}L${firstX},${top + plotH}Z`;

  const point = active == null ? null : trend[active];
  function onKey(event: KeyboardEvent) {
    if (!trend.length) return;
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (event.key === 'Home') { event.preventDefault(); setActive(0); return; }
    if (event.key === 'End') { event.preventDefault(); setActive(trend.length - 1); return; }
    if (!delta) return;
    event.preventDefault();
    setActive(current => Math.max(0, Math.min(trend.length - 1, (current ?? trend.length - 1) + (current == null ? 0 : delta))));
  }

  const aggregate = (() => {
    switch (metric) {
      case 'tokens': return { value: compact(summary.known_tokens.total_tokens), note: `区间已报告 · ${number(summary.unknown_consumption_requests)} 次消耗未知` };
      case 'requests': return { value: number(summary.requests), note: `区间调用 · ${number(summary.upstream_attempts)} 次上游尝试` };
      case 'cost': return { value: currency ? `${currency} ${decimalString(summary.estimated_cost_by_currency[currency] ?? '0')}` : '未知', note: `区间估算 · ${number(summary.unknown_cost_requests)} 次费用未知 · 非账单` };
      case 'success': return { value: percent(summary.success_rate), note: `区间完成成功率 · ${number(summary.completed_requests)} 次已知完成` };
      case 'latency': return { value: duration(summary.average_latency_ms), note: `区间平均 · ${number(summary.latency_samples)} 条有效样本` };
    }
  })();

  const noData = !known.length;
  return <div className="trend">
    <div className="trend-head">
      <Segmented label="图表指标" size="sm" value={metric} onChange={value => { setMetric(value); setActive(null); }}
        options={(Object.keys(metricNames) as Metric[]).map(key => ({ value: key, label: metricNames[key] }))} />
      <div className="trend-tools">
        {metric === 'cost' && currencies.length > 1 && <label className="mini-select"><span className="sr-only">费用币种</span>
          <select value={currency} onChange={e => setCurrency(e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</select></label>}
        <Button size="sm" variant="ghost" aria-pressed={table} onClick={() => setTable(!table)}>{table ? '图表' : '数据表'}</Button>
      </div>
    </div>
    <div className="readout" aria-live="polite">
      <strong className="readout-value">{point ? display(point, metric, currency) : aggregate.value}</strong>
      <span className="readout-note">{point
        ? <>{point.day} UTC · {number(point.requests)} 次调用{point.unknown_consumption_requests ? ` · ${point.unknown_consumption_requests} 次消耗未知` : ''}</>
        : aggregate.note}</span>
    </div>
    {table ? <TrendTable trend={trend} /> : <div className="trend-plot" ref={wrap}>
      {noData ? <Empty icon="usage" title={trend.some(p => p.requests) ? '此指标暂无已知数据' : '这个时段还没有调用记录'}>
        {trend.some(p => p.requests) ? '所选范围内没有可绘制的值；未知不会按零绘制。' : '调用发生后，趋势会按 UTC 日汇总在这里。'}
      </Empty>
        : <svg className={`chart${bars ? ' chart-bars' : ' chart-line'}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} tabIndex={0}
          role="img" aria-label={`${metricNames[metric]}每日趋势，按 UTC 日分组，共 ${trend.length} 天。使用左右方向键逐日查看数值。`}
          onKeyDown={onKey} onFocus={() => setActive(a => a ?? trend.length - 1)} onBlur={() => setActive(null)} onPointerLeave={() => setActive(null)}>
          <defs>
            <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="grad-a" /><stop offset="1" className="grad-b" />
            </linearGradient>
            <pattern id={`hatch-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" className="hatch-bg" /><line x1="0" y1="0" x2="0" y2="6" className="hatch-line" strokeWidth="2" />
            </pattern>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map(f => <g key={f}>
            <line className={f === 0 ? 'axis' : 'grid'} x1={left} x2={width - right} y1={y(max * f)} y2={y(max * f)} />
            <text className="tick" x={left - 8} y={y(max * f) + 3.5} textAnchor="end">{tick(max * f, metric)}</text>
          </g>)}
          {trend.map((p, i) => (i % labelEvery === 0 || i === trend.length - 1) && (i === trend.length - 1 || trend.length - 1 - i >= labelEvery * 0.6)
            ? <text key={p.day} className="tick" x={x(i)} y={height - 9} textAnchor="middle">{utcDay(p.day)}</text> : null)}
          {active != null && <line className="crosshair" x1={x(active)} x2={x(active)} y1={top} y2={top + plotH} />}
          {bars && values.map((v, i) => {
            if (v == null) return trend[i].requests ? <rect key={i} className="unknown-col" x={x(i) - barW / 2} y={top} width={barW} height={plotH} rx="3" fill={`url(#hatch-${uid})`} /> : null;
            const h = Math.max(v > 0 ? 2 : 0, plotH * (v / max));
            return h ? <path key={i} className={`mark${active === i ? ' on' : ''}${active != null && active !== i ? ' dim' : ''}`} d={barPath(x(i) - barW / 2, top + plotH - h, barW, h)} fill={`url(#fill-${uid})`} /> : null;
          })}
          {!bars && <>
            {values.map((v, i) => v == null && trend[i].requests ? <rect key={`u${i}`} className="unknown-col" x={x(i) - 3} y={top} width="6" height={plotH} rx="3" fill={`url(#hatch-${uid})`} /> : null)}
            <path className="area" d={area} fill={`url(#fill-${uid})`} />
            <path className="line" d={line} fill="none" />
            {values.map((v, i) => v == null ? null : <circle key={i} className={`dot${active === i ? ' on' : ''}`} cx={x(i)} cy={y(v)} r={active === i ? 5 : 3.2} />)}
          </>}
          {trend.map((p, i) => <rect key={`hit${p.day}`} className="hit" x={left + step * i} y={top} width={step} height={plotH + bottom - 6} onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} />)}
        </svg>}
      <p className="trend-foot"><span className="legend-swatch swatch-fill" />已知值<span className="legend-swatch swatch-hatch" />有调用但数值未知<span className="trend-foot-sep">按 UTC 日分组 · 首尾可能为不完整日</span></p>
    </div>}
  </div>;
}

export function TrendTable({ trend }: { trend: TrendPoint[] }) {
  return <div className="table-wrap"><table className="table compact">
    <caption className="sr-only">每日用量数据</caption>
    <thead><tr><th scope="col">日期 (UTC)</th><th scope="col" className="num">调用</th><th scope="col" className="num">已报告 Token</th><th scope="col" className="num">费用估算</th><th scope="col" className="num">成功率</th><th scope="col" className="num">平均耗时</th><th scope="col" className="num">消耗未知</th></tr></thead>
    <tbody>{trend.map(p => <tr key={p.day}>
      <td className="mono">{p.day}</td><td className="num">{number(p.requests)}</td>
      <td className="num">{p.known_tokens.total_tokens == null ? <span className="unknown">{p.requests ? '未知' : '—'}</span> : number(p.known_tokens.total_tokens)}</td>
      <td className="num">{Object.keys(p.estimated_cost_by_currency).length ? Object.entries(p.estimated_cost_by_currency).map(([c, v]) => <div key={c}>{c} {decimalString(v)}</div>) : <span className="unknown">{p.requests ? '未知' : '—'}</span>}</td>
      <td className="num">{p.success_rate == null ? <span className="unknown">{p.requests ? '未知' : '—'}</span> : percent(p.success_rate)}</td>
      <td className="num">{p.average_latency_ms == null ? <span className="unknown">{p.requests ? '未知' : '—'}</span> : duration(p.average_latency_ms)}</td>
      <td className="num">{number(p.unknown_consumption_requests)}</td>
    </tr>)}</tbody>
  </table></div>;
}

export function Sparkline({ values, label: name }: { values: (number | null)[]; label: string }) {
  const w = 120, h = 34;
  const known = values.filter((v): v is number => v != null);
  if (known.length < 2) return <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><line className="spark-base" x1="0" x2={w} y1={h - 2} y2={h - 2} /></svg>;
  const max = Math.max(...known), min = Math.min(...known, 0);
  const range = max - min || 1;
  const px = (i: number) => (values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 4) + 2);
  const py = (v: number) => h - 3 - ((v - min) / range) * (h - 8);
  let d = '', open = false;
  values.forEach((v, i) => { if (v == null) { open = false; return; } d += `${open ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`; open = true; });
  const lastIndex = values.map((v, i) => (v == null ? -1 : i)).filter(i => i >= 0).pop() ?? 0;
  return <svg className="spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={name}>
    <path className="spark-line" d={d} fill="none" />
    <circle className="spark-dot" cx={px(lastIndex)} cy={py(values[lastIndex] ?? 0)} r="2.6" />
  </svg>;
}

const statusOrder = ['success', 'failed', 'cancelled', 'interrupted', 'running', 'unknown'];
export function StatusDonut({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0).sort(([a], [b]) => (statusOrder.indexOf(a) + 1 || 99) - (statusOrder.indexOf(b) + 1 || 99));
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  const r = 42, c = 2 * Math.PI * r, gap = entries.length > 1 ? 2.5 : 0;
  let offset = 0;
  if (!total) return <Empty icon="usage" title="暂无调用状态">所选范围内没有调用记录。</Empty>;
  return <div className="donut">
    <svg viewBox="0 0 110 110" width="132" height="132" role="img" aria-label={`调用最终状态：${entries.map(([s, n]) => `${label(s)} ${n} 次`).join('，')}`}>
      <circle cx="55" cy="55" r={r} className="donut-track" fill="none" strokeWidth="12" />
      {entries.map(([status, n]) => {
        const len = (n / total) * c;
        const seg = <circle key={status} cx="55" cy="55" r={r} fill="none" strokeWidth="12" className={`donut-seg status-${status}`}
          strokeDasharray={`${Math.max(0.5, len - gap)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 55 55)" />;
        offset += len;
        return seg;
      })}
      <text x="55" y="53" textAnchor="middle" className="donut-total">{number(total)}</text>
      <text x="55" y="68" textAnchor="middle" className="donut-caption">次调用</text>
    </svg>
    <ul className="legend">
      {entries.map(([status, n]) => <li key={status}><span className={`legend-key status-${status}`} /><span>{label(status)}</span><strong>{number(n)}</strong><em>{percent(n / total, 0)}</em></li>)}
    </ul>
  </div>;
}
