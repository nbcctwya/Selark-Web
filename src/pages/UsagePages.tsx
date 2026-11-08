import type { ReactNode } from 'react';
import type { Snapshot, Usage } from '../api/types';
import { StatusDonut, TrendChart } from '../components/charts';
import { Icon } from '../components/Icon';
import { MetricTiles } from '../components/Metrics';
import { Avatar, Bar, Empty, Panel, Pill, Tag, Unknown } from '../components/ui';
import { connectionHeadline, quotaHeadline } from '../lib/domain';
import { compact, duration, label, money, number, percent } from '../lib/format';
import { GatewayPill } from './MonitorPage';

export type Go = (page: 'overview' | 'connections' | 'usage' | 'applications' | 'monitor', id?: string) => void;

function ModelRanking({ usage, snapshot, detailed = false }: { usage: Usage; snapshot: Snapshot; detailed?: boolean }) {
  const models = usage.models;
  const max = Math.max(1, ...models.map(m => m.requests));
  const name = (id: string | null) => (id ? snapshot.connections.find(c => c.id === id)?.name ?? id : '未知连接');
  if (!models.length) return <Empty icon="layers" title="暂无模型用量">所选范围内没有调用；分布会随真实记录更新。</Empty>;
  if (!detailed) return <ol className="ranking">{models.map((m, i) => <li key={`${m.connection_id}::${m.model}`}>
    <span className="rank">{i + 1}</span>
    <div className="ranking-body">
      <p><span className="mono strong" title={m.model ?? undefined}>{m.model || '未知模型'}</span><span className="ranking-value">{number(m.requests)} 次</span></p>
      <Bar value={m.requests} max={max} label={`${m.model ?? '未知模型'} ${m.requests} 次调用`} />
      <small>{name(m.connection_id)} · {compact(m.known_tokens.total_tokens)} 已报告 Token</small>
    </div>
  </li>)}</ol>;
  return <div className="table-wrap"><table className="table">
    <caption className="sr-only">按调用次数排序的前 10 个连接 / 模型组合</caption>
    <thead><tr><th scope="col">模型 / 连接</th><th scope="col">调用占比</th><th scope="col" className="num">调用</th><th scope="col" className="num">已报告 Token</th><th scope="col" className="num">费用估算</th><th scope="col" className="num">成功率</th><th scope="col" className="num">平均耗时</th></tr></thead>
    <tbody>{models.map(m => <tr key={`${m.connection_id}::${m.model}`}>
      <td data-label="模型"><span className="mono strong">{m.model || '未知模型'}</span><span className="cell-sub">{name(m.connection_id)}</span></td>
      <td data-label="占比" className="bar-cell"><Bar value={m.requests} max={usage.summary.requests || 1} label={`占全部调用 ${percent(m.requests / (usage.summary.requests || 1))}`} /></td>
      <td data-label="调用" className="num">{number(m.requests)}</td>
      <td data-label="Token" className="num">{m.known_tokens.total_tokens == null ? <Unknown /> : number(m.known_tokens.total_tokens)}{m.unknown_consumption_requests > 0 && <span className="cell-sub">{m.unknown_consumption_requests} 次未知</span>}</td>
      <td data-label="费用" className="num">{Object.keys(m.estimated_cost_by_currency).length ? money(m.estimated_cost_by_currency) : <Unknown>未知 / 未定价</Unknown>}</td>
      <td data-label="成功率" className="num">{m.success_rate == null ? <Unknown /> : percent(m.success_rate)}</td>
      <td data-label="耗时" className="num">{duration(m.average_latency_ms)}</td>
    </tr>)}</tbody>
  </table></div>;
}

function StatusBand({ snapshot, go }: { snapshot: Snapshot; go: Go }) {
  const conns = snapshot.connections, apps = snapshot.applications;
  const ready = conns.filter(c => c.enabled && c.availability.state !== 'blocked_locally').length;
  const activeApps = apps.filter(a => a.active).length;
  const approved = conns.reduce((n, c) => n + c.model_catalog.counts.approved, 0);
  const discovered = conns.reduce((n, c) => n + c.model_catalog.counts.discovered, 0);
  const paused = apps.filter(a => a.active && a.quota.token_quota_state === 'blocked_unknown_usage').length;
  const items: { key: string; icon: 'server' | 'connections' | 'layers' | 'apps'; title: string; value: ReactNode; note: ReactNode; to: Parameters<Go>[0] }[] = [
    { key: 'gateway', icon: 'server', title: '本机网关', value: <GatewayPill snapshot={snapshot} />, note: snapshot.service.reachable ? `执行 ${number(snapshot.service.capacity?.active)} · 排队 ${number(snapshot.service.capacity?.queued)}` : '实时队列状态未知', to: 'monitor' },
    { key: 'connections', icon: 'connections', title: '连接', value: <><b>{ready}</b><span>/ {conns.length}</span></>, note: '启用且无本地阻碍', to: 'connections' },
    { key: 'models', icon: 'layers', title: '模型', value: <><b>{approved}</b><span>/ {discovered}</span></>, note: '已启用 / 已发现', to: 'connections' },
    { key: 'apps', icon: 'apps', title: '应用', value: <><b>{activeApps}</b><span>/ {apps.length}</span></>, note: paused ? <span className="warn-text">{paused} 个因未知用量暂停</span> : '令牌有效', to: 'applications' },
  ];
  return <section className="band" aria-label="工作空间状态">
    {items.map(item => <button key={item.key} type="button" className="band-item" onClick={() => go(item.to)}>
      <span className="band-icon"><Icon name={item.icon} size={17} /></span>
      <span className="band-title">{item.title}</span>
      <span className="band-value">{item.value}</span>
      <span className="band-note">{item.note}</span>
    </button>)}
  </section>;
}

export function OverviewPage({ snapshot, go, records }: { snapshot: Snapshot; go: Go; records: ReactNode }) {
  const usage = snapshot.usage;
  return <>
    <StatusBand snapshot={snapshot} go={go} />
    <MetricTiles usage={usage} />
    <div className="grid-main">
      <Panel title="使用趋势" icon="usage" subtitle="每一次调用都有迹可循 · 按 UTC 日汇总" className="span-2">
        {usage ? <TrendChart trend={usage.trend} summary={usage.summary} /> : <Empty icon="database" tone="error" title="用量账本暂不可读">资源与应用仍可查看。</Empty>}
      </Panel>
      <Panel title={<>资源池<span className="count">{snapshot.connections.length}</span></>} icon="connections" subtitle="全部连接 · 与用量筛选无关"
        actions={snapshot.connections.length > 0 && <button type="button" className="link" onClick={() => go('connections')}>全部<Icon name="arrowRight" size={14} /></button>}>
        {snapshot.connections.length ? <ul className="pool">{snapshot.connections.map(c => {
          const head = connectionHeadline(c);
          return <li key={c.id}><button type="button" onClick={() => go('connections', c.id)}>
            <Avatar id={c.provider} text={c.provider} size="sm" />
            <span className="pool-main"><strong>{c.name}</strong><small>{label(c.resource_type)} · {c.models.length} 个已启用</small></span>
            <Pill tone={head.tone}>{head.text}</Pill>
          </button></li>;
        })}</ul> : <Empty icon="connections" title="还没有连接">通过 Selark CLI 添加连接后会显示在这里。</Empty>}
      </Panel>
    </div>
    <div className="grid-2">
      <Panel title="模型使用分布" icon="layers" subtitle="按调用次数 · 前 10 个连接 / 模型组合"
        actions={usage && usage.models.length > 0 && <button type="button" className="link" onClick={() => go('usage')}>详细分析<Icon name="arrowRight" size={14} /></button>}>
        {usage ? <ModelRanking usage={usage} snapshot={snapshot} /> : <Empty icon="database" tone="error" title="用量账本暂不可读" />}
      </Panel>
      <Panel title="今日应用配额" icon="apps" subtitle="UTC 今日 · 已扣除或预留，不受筛选影响"
        actions={snapshot.applications.length > 0 && <button type="button" className="link" onClick={() => go('applications')}>全部<Icon name="arrowRight" size={14} /></button>}>
        {snapshot.applications.some(a => a.active) ? <ul className="app-quotas">{snapshot.applications.filter(a => a.active).map(a => {
          const head = quotaHeadline(a), limit = a.policy.daily_token_limit;
          return <li key={a.id}><button type="button" onClick={() => go('applications', a.id)}>
            <Avatar id={a.id} text={a.name} kind="round" size="sm" />
            <span className="app-quota-main">
              <span className="app-quota-line"><strong>{a.name}</strong><span className="mono-num">{compact(a.quota.charged_or_reserved_tokens)}{limit != null && <em> / {compact(limit)}</em>}</span></span>
              {limit != null ? <Bar value={a.quota.token_quota_state === 'blocked_unknown_usage' ? null : a.quota.charged_or_reserved_tokens} max={limit} tone={a.quota.token_quota_state === 'exhausted' ? 'bad' : 'accent'} />
                : <Bar value={0} max={1} tone="muted" />}
              <small><Pill tone={head.tone} dot={false}>{head.text}</Pill>{a.quota.requests} 次调用</small>
            </span>
          </button></li>;
        })}</ul> : <Empty icon="apps" title="没有有效应用">为调用方创建应用令牌后，今日配额会显示在这里。</Empty>}
      </Panel>
    </div>
    {records}
  </>;
}

export function UsagePage({ snapshot, records }: { snapshot: Snapshot; records: ReactNode }) {
  const usage = snapshot.usage;
  return <>
    <MetricTiles usage={usage} />
    {usage && <>
      <Panel title="趋势" icon="usage" subtitle={`${usage.timezone} 日分组 · 筛选窗口内全部调用`}>
        <TrendChart trend={usage.trend} summary={usage.summary} height={280} />
        {usage.unknown_time_excluded > 0 && <p className="panel-foot">{usage.unknown_time_excluded} 条无时间戳的旧记录未计入时间范围。</p>}
      </Panel>
      <div className="grid-2">
        <Panel title="调用最终状态" icon="check" subtitle="成功率 = 成功 /（成功 + 失败 + 取消 + 中断）">
          <StatusDonut counts={usage.summary.status_counts} />
        </Panel>
        <Panel title="用量口径" icon="database" subtitle="三种口径分开呈现，不互相换算">
          <dl className="accounting">
            <div><dt>已报告 Token（历史用量）</dt><dd>{number(usage.summary.known_tokens.total_tokens)}</dd>
              <dd className="acc-split">输入 {number(usage.summary.known_tokens.prompt_tokens)} · 输出 {number(usage.summary.known_tokens.completion_tokens)}</dd></div>
            <div><dt>配额核算 Token（{usage.summary.resource_accounting.scope}）</dt>
              <dd>{Object.keys(usage.summary.resource_accounting.tokens_by_basis).length ? Object.entries(usage.summary.resource_accounting.tokens_by_basis).map(([basis, n]) => <span key={basis} className="acc-row"><Tag tone="muted">{label(basis)}</Tag>{number(n)}</span>) : <Unknown>无准入记录</Unknown>}</dd>
              <dd className="acc-split">{number(usage.summary.resource_accounting.requests)} 次准入 · 含保守预留，用于应用配额</dd></div>
            <div><dt>费用估算（按币种）</dt><dd>{money(usage.summary.estimated_cost_by_currency)}</dd><dd className="acc-split">{usage.summary.unknown_cost_requests} 次费用未知 · 非供应商账单</dd></div>
            <div><dt>用量不完整</dt><dd>{number(usage.summary.missing_usage_requests)} 次</dd>
              <dd className="acc-split">{Object.entries(usage.summary.missing_field_requests).map(([f, n]) => `${f.replace('_tokens', '')} 缺失 ${n}`).join(' · ') || '无字段缺失'}</dd></div>
          </dl>
        </Panel>
      </div>
      <Panel title="模型明细" icon="layers" subtitle="前 10 个连接 / 模型组合 · 费用按币种分别展示">
        <ModelRanking usage={usage} snapshot={snapshot} detailed />
      </Panel>
    </>}
    {records}
  </>;
}
