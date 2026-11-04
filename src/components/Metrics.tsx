import type { ReactNode } from 'react';
import type { Usage } from '../api/types';
import { compact, duration, moneyEntries, number, percent } from '../lib/format';
import { Sparkline } from './charts';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Empty, Panel } from './ui';

function Tile({ icon, name, value, note, spark, accent, unknown }: { icon: IconName; name: string; value: ReactNode; note: ReactNode; spark?: ReactNode; accent?: boolean; unknown?: boolean }) {
  return <article className={`metric${accent ? ' metric-accent' : ''}`}>
    <div className="metric-top"><span className="metric-name"><Icon name={icon} size={15} />{name}</span>{spark}</div>
    <div className={`metric-value${unknown ? ' is-unknown' : ''}`}>{value}</div>
    <p className="metric-note">{note}</p>
  </article>;
}

export function MetricTiles({ usage }: { usage: Usage | null }) {
  if (!usage) return <Panel className="metrics-missing"><Empty icon="database" tone="error" title="用量账本暂不可读">连接与应用仍可查看。Dashboard 不会自动迁移或修复账本，请在终端检查。</Empty></Panel>;
  const s = usage.summary;
  const costs = moneyEntries(s.estimated_cost_by_currency);
  const trend = usage.trend;
  return <section className="metrics" aria-label="所选范围的用量汇总">
    <Tile accent icon="token" name="已报告 Token" unknown={s.known_tokens.total_tokens == null}
      value={<span title={number(s.known_tokens.total_tokens)}>{compact(s.known_tokens.total_tokens)}</span>}
      note={<>{number(s.known_usage_requests)} 次完整用量 · <b>{number(s.unknown_consumption_requests)}</b> 次消耗未知</>}
      spark={<Sparkline label="每日已报告 Token 走势" values={trend.map(p => p.known_tokens.total_tokens)} />} />
    <Tile icon="calls" name="调用次数" value={number(s.requests)}
      note={<>{number(s.upstream_attempts)} 次上游尝试 · {number(s.local_rejected_requests)} 次本地拒绝</>}
      spark={<Sparkline label="每日调用次数走势" values={trend.map(p => p.requests)} />} />
    <Tile icon="coins" name="费用估算" unknown={!costs.length}
      value={costs.length ? <span className="money-stack">{costs.map(([c, v]) => <span key={c}><small>{c}</small>{v}</span>)}</span> : '未知 / 未定价'}
      note={<>{number(s.unknown_cost_requests)} 次费用未知 · 历史价格估算，非账单</>} />
    <Tile icon="check" name="完成成功率" unknown={s.success_rate == null} value={percent(s.success_rate)}
      note={<>{number(s.completed_requests)} 次已知完成 · 进行中与未知不计入</>}
      spark={<Sparkline label="每日成功率走势" values={trend.map(p => p.success_rate)} />} />
    <Tile icon="clock" name="平均耗时" unknown={s.average_latency_ms == null} value={duration(s.average_latency_ms)}
      note={<>{number(s.latency_samples)} 条有效样本 · 含排队与传输</>}
      spark={<Sparkline label="每日平均耗时走势" values={trend.map(p => p.average_latency_ms)} />} />
  </section>;
}
