import { useState } from 'react';
import type { Application, Snapshot } from '../api/types';
import { useManage } from '../app/manage';
import { Icon } from '../components/Icon';
import { Sheet, useToast } from '../components/Overlay';
import { Avatar, Bar, Button, DefinitionList, Empty, Panel, Pill, Segmented, Tabs, Tag, Unknown } from '../components/ui';
import { ApplicationSettings, CreateApplication } from './applications/ApplicationForms';
import { allowList, quotaHeadline } from '../lib/domain';
import { compact, dateTime, decimalString, label, money, number, relative } from '../lib/format';

function QuotaBlock({ app }: { app: Application }) {
  const q = app.quota, limit = app.policy.daily_token_limit;
  const used = q.charged_or_reserved_tokens;
  const head = quotaHeadline(app);
  const remaining = q.token_quota_state === 'unlimited' ? `今日 ${number(q.requests)} 次准入`
    : q.remaining_tokens == null ? '未知 · 已暂停新调用' : `剩余 ${number(q.remaining_tokens)}`;
  return <div className="quota">
    <div className="quota-head">
      <span className="quota-label">今日已扣除或预留 Token</span>
      <Pill tone={head.tone}>{head.text}</Pill>
    </div>
    <div className="quota-figure"><strong>{compact(used)}</strong>{limit != null && <span>/ {compact(limit)}</span>}</div>
    {limit != null && <Bar value={q.remaining_tokens == null && q.token_quota_state === 'blocked_unknown_usage' ? null : used} max={limit}
      tone={q.token_quota_state === 'exhausted' ? 'bad' : used / limit > 0.85 ? 'warn' : 'accent'} label={`今日配额占用 ${number(used)} / ${number(limit)}`} />}
    <p className="quota-sub">{remaining}{q.unknown_token_requests ? ` · ${q.unknown_token_requests} 次用量未知` : ''}{q.estimated_reserved_tokens ? ` · 含保守预留 ${compact(q.estimated_reserved_tokens)}` : ''}</p>
  </div>;
}

export function ApplicationsPage({ snapshot, openId, onOpen, creating, onCreating }: { snapshot: Snapshot; openId: string | null; onOpen: (id: string | null) => void; creating: boolean; onCreating: (open: boolean) => void }) {
  const { can, why, saving } = useManage();
  const toast = useToast();
  const createButton = <Button variant="primary" icon="sparkle" disabled={!can.application_management} title={can.application_management ? undefined : why.application_management} onClick={() => onCreating(true)}>新建应用</Button>;
  const createSheet = <Sheet open={creating} busy={Boolean(saving)} onClose={() => onCreating(false)} labelId="create-application-title" eyebrow="应用" title="新建应用" subtitle="为一个调用方生成独立令牌，并设置它能使用的资源与限额。">
    {creating && <CreateApplication snapshot={snapshot} onDone={() => { onCreating(false); toast({ tone: 'good', text: '应用已创建，令牌已从页面清除。' }); }} />}
  </Sheet>;
  const [scope, setScope] = useState<'active' | 'all'>('all');
  const apps = snapshot.applications;
  const active = apps.filter(a => a.active).length;
  const visible = scope === 'active' ? apps.filter(a => a.active) : apps;
  const day = apps[0]?.quota.day;
  if (!apps.length) return <>
    <Panel><Empty icon="apps" title="尚无可显示的应用">为调用方创建应用后，它们的身份、权限与今日配额会显示在这里。页面不会显示令牌明文或摘要。<p>{createButton}</p></Empty></Panel>
    {createSheet}
  </>;
  return <>
    <div className="toolbar">
      <div className="summary-chips">
        <span><b>{active}</b> 个有效</span><span><b>{apps.length - active}</b> 个已撤销</span>
        {day && <span><Icon name="calendar" size={14} />配额日 {day} UTC</span>}
      </div>
      <Segmented label="应用范围" size="sm" value={scope} onChange={setScope} options={[{ value: 'all', label: '全部' }, { value: 'active', label: '仅有效' }]} />
      {createButton}
    </div>
    <p className="page-note"><Icon name="info" size={14} />配额按 UTC 今日计算，包含实际用量与保守预留，不受用量筛选影响；历史用量请在「用量分析」查看。编辑策略或撤销令牌请打开应用详情。</p>
    <div className="card-grid">{visible.map(app => {
      const p = app.policy;
      const models = app.effective_resources.reduce((n, r) => n + r.models.length, 0);
      return <article key={app.id} className={`entity-card${app.active ? '' : ' is-off'}`}>
        <header className="entity-head">
          <Avatar id={app.id} text={app.name} kind="round" />
          <div className="entity-titles">
            <h3><button type="button" className="stretch" onClick={() => onOpen(app.id)}>{app.name}</button></h3>
            <p><span className="mono">{app.id}</span></p>
          </div>
          <Pill tone={app.active ? 'good' : 'neutral'}>{app.active ? '令牌有效' : '已撤销'}</Pill>
        </header>
        {app.active ? <QuotaBlock app={app} /> : <p className="revoked">撤销于 {dateTime(app.revoked_at, '未知')}，不再接受新调用。</p>}
        <dl className="facts facts-3">
          <div><dt>今日调用</dt><dd>{number(app.quota.requests)}</dd></div>
          <div><dt>费用或预留</dt><dd>{money(app.quota.estimated_cost_or_reservation, '—')}</dd></div>
          <div><dt>并发上限</dt><dd>{p.max_concurrent_requests ?? <Unknown>未单独限制</Unknown>}</dd></div>
        </dl>
        <div className="entity-chips">
          {app.effective_resources.slice(0, 4).map(r => <Tag key={r.id}>{r.name}<span className="tag-count">{r.models.length}</span></Tag>)}
          {app.effective_resources.length > 4 && <Tag tone="muted">+{app.effective_resources.length - 4}</Tag>}
          {!app.effective_resources.length && <Tag tone="muted">暂无获权资源</Tag>}
        </div>
        <footer className="entity-foot"><span>{app.effective_resources.length} 个连接 · {models} 个获准模型</span><span className="entity-go">{can.application_management && app.active ? '管理' : '权限详情'}<Icon name="arrowRight" size={14} /></span></footer>
      </article>;
    })}</div>
    <ApplicationSheet app={openId ? apps.find(a => a.id === openId) ?? null : null} snapshot={snapshot} onClose={() => onOpen(null)} />
    {createSheet}
  </>;
}

function ApplicationSheet({ app, snapshot, onClose }: { app: Application | null; snapshot: Snapshot; onClose: () => void }) {
  const p = app?.policy, q = app?.quota;
  const [tab, setTab] = useState<'overview' | 'policy'>('overview');
  const [lastId, setLastId] = useState(app?.id);
  if (lastId !== app?.id) { setLastId(app?.id); setTab('overview'); }
  return <Sheet open={Boolean(app)} onClose={onClose} labelId="application-title" eyebrow={app ? (app.active ? '应用 · 令牌有效' : '应用 · 已撤销') : ''}
    title={app?.name ?? ''} subtitle={app && <span className="mono">{app.id}</span>}>
    {app && p && q && <>
      <Tabs label="应用详情" value={tab} onChange={setTab} tabs={[['overview', '概览与配额'], ['policy', app.active ? '策略与撤销' : '策略']]} />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="tabpanel">
      {tab === 'policy' ? <ApplicationSettings key={app.id} id={app.id} snapshot={snapshot} /> : <>
      <section className="detail-section"><h3>当前实际获准的资源</h3>
        {app.effective_resources.length ? <ul className="resource-tree">{app.effective_resources.map(r => <li key={r.id}>
          <p><strong>{r.name}</strong><Tag>{label(r.resource_type)}</Tag></p>
          <div className="entity-chips">{r.models.map(m => <Tag key={m} mono>{m}</Tag>)}</div>
        </li>)}</ul> : <Empty icon="lock" title="无获准模型">策略、连接启停与模型启用的交集为空。</Empty>}
        <p className="note">这里是连接开启、模型启用与应用策略的交集，不代表供应商当前可用或额度充足。</p>
      </section>
      <section className="detail-section"><h3>本地配额 · {q.day} {q.timezone}</h3><DefinitionList items={[
        ['日 Token 上限', p.daily_token_limit == null ? '未设上限' : number(p.daily_token_limit)],
        ['配额状态', <Pill key="s" tone={quotaHeadline(app).tone}>{label(q.token_quota_state)}</Pill>],
        ['已扣除或预留 Token', number(q.charged_or_reserved_tokens)],
        ['其中保守预留', number(q.estimated_reserved_tokens)],
        ['剩余 Token', q.token_quota_state === 'unlimited' ? '未设上限' : q.remaining_tokens == null ? <Unknown key="r">未知 · 已暂停</Unknown> : number(q.remaining_tokens)],
        ['今日调用 / 账本在途', `${number(q.requests)} / ${number(q.in_flight_requests)}`],
        ['结果不确定', number(q.uncertain_requests)],
        ['用量未知 / 费用未知', `${number(q.unknown_token_requests)} / ${number(q.unknown_cost_requests)}`],
        ['费用估算或预留', money(q.estimated_cost_or_reservation, '无 / 未定价')],
        ['日预算', p.daily_budget == null ? '未设置' : `${p.budget_currency} ${decimalString(p.daily_budget)}`],
        ['未纳入准入配额的旧记录', number(q.historical_requests_excluded)],
      ]} /><p className="note">账本在途数不是实时并发。未知用量会暂停有限额应用的新调用，直到用量确认；无上限、零剩余与未知是三种不同状态。</p></section>
      <section className="detail-section"><h3>策略</h3><DefinitionList items={[
        ['允许连接', allowList(p.allowed_connections, '未限定列表（仍受资源类型授权约束）')],
        ['允许模型', allowList(p.allowed_models, '未限定列表')],
        ['Token Plan', p.allow_token_plans ? '明确允许' : '未授权'],
        ['并发上限', p.max_concurrent_requests ?? '未单独限制'],
        ['每分钟请求', p.requests_per_minute ?? '未单独限制'],
        ['单次输出上限', p.max_output_tokens == null ? '未单独限制' : number(p.max_output_tokens)],
        ['估算输入上限', p.max_estimated_input_tokens == null ? '未单独限制' : number(p.max_estimated_input_tokens)],
      ]} /></section>
      <section className="detail-section"><h3>身份</h3><DefinitionList items={[
        ['创建时间', `${dateTime(app.created_at)}（${relative(app.created_at)}）`],
        ['撤销时间', app.revoked_at ? dateTime(app.revoked_at) : '未撤销'],
      ]} /></section>
      <p className="sheet-hint"><Icon name="shield" size={15} />页面不显示令牌明文或摘要；令牌只在创建时显示一次。</p>
      </>}
      </div>
    </>}
  </Sheet>;
}
