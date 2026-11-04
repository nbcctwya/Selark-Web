import type { Usage } from '../api/types';
import { money, number } from './format';

export function UsageSummary({ usage }: { usage: Usage | null }) {
  if (!usage) return <section className="panel empty">用量账本暂不可读。</section>;
  const s = usage.summary;
  const metrics = [['调用次数', number(s.requests)], ['已知 Token', number(s.known_tokens.total_tokens)], ['费用估算', money(s.estimated_cost_by_currency)], ['成功率', s.success_rate == null ? '未知' : `${(s.success_rate * 100).toFixed(1)}%`]];
  const max = Math.max(1, ...usage.trend.map(point => point.known_tokens.total_tokens ?? 0));
  const step = 600 / Math.max(1, usage.trend.length);
  return <>
    <div className="metrics">{metrics.map(([name, value]) => <article className="panel" key={name}><p>{name}</p><strong>{value}</strong></article>)}</div>
    <section className="panel"><div className="section-heading"><h2>Token 使用趋势</h2><span className="muted">按 UTC 日分组</span></div>
      <svg className="trend" viewBox="0 0 620 170" role="img" aria-label="每日已知 Token 使用趋势">
        <line x1="10" y1="150" x2="610" y2="150" stroke="currentColor" opacity="0.2" />
        {usage.trend.map((point, index) => point.known_tokens.total_tokens == null ? null : <rect key={point.day} x={10 + index * step} y={150 - point.known_tokens.total_tokens / max * 130} width={Math.max(1, step - 4)} height={Math.max(1, point.known_tokens.total_tokens / max * 130)} rx="3"><title>{point.day}：{point.known_tokens.total_tokens} Token</title></rect>)}
      </svg>
      <p className="muted">未知消耗 {s.unknown_consumption_requests} 次 · 未知费用 {s.unknown_cost_requests} 次。费用按历史价格估算。</p>
      <details><summary>查看每日数值</summary><div className="table-scroll"><table><thead><tr><th>日期 UTC</th><th>调用</th><th>已知 Token</th><th>费用估算</th></tr></thead><tbody>{usage.trend.map(p => <tr key={p.day}><td>{p.day}</td><td>{p.requests}</td><td>{number(p.known_tokens.total_tokens)}</td><td>{money(p.estimated_cost_by_currency)}</td></tr>)}</tbody></table></div></details>
    </section>
  </>;
}
