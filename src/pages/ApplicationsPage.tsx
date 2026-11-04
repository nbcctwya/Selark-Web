import type { Snapshot } from '../api/types';
import { label, money, number } from '../components/format';

export function ApplicationsPage({ snapshot }: { snapshot: Snapshot }) {
  return <><p className="muted">应用权限与 UTC 今日配额，独立于历史用量筛选。</p><div className="cards">
    {snapshot.applications.map(app => <article className="panel" key={app.id}>
      <div className="section-heading"><h2>{app.name}</h2><span className="badge">{app.active ? '有效' : '已撤销'}</span></div>
      <dl>{Object.entries({ '连接权限': app.policy.allowed_connections == null ? '未限定列表' : app.policy.allowed_connections.join('、') || '禁止全部', '模型权限': app.policy.allowed_models == null ? '未限定列表' : app.policy.allowed_models.join('、') || '禁止全部', '并发上限': app.policy.max_concurrent_requests ?? '未单独限制', '每分钟请求上限': app.policy.requests_per_minute ?? '未单独限制', '配额状态': label(app.quota.token_quota_state), '今日实际或预留 Token': number(app.quota.charged_or_reserved_tokens), '剩余 Token': app.quota.token_quota_state === 'unlimited' ? '未设上限' : number(app.quota.remaining_tokens), '未知用量请求': number(app.quota.unknown_token_requests), '费用或预留': money(app.quota.estimated_cost_or_reservation) }).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
      <details><summary>实际获权资源</summary>{app.effective_resources.map(resource => <p key={resource.id}>{resource.name}：{resource.models.join('、')}</p>)}{!app.effective_resources.length && <p>暂无获权资源。</p>}</details>
    </article>)}
  </div>{!snapshot.applications.length && <section className="panel empty">尚无应用。</section>}</>;
}
