import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Connection, ResourceType, Snapshot } from '../api/types';
import { useManage } from '../app/manage';
import { Icon } from '../components/Icon';
import { Sheet, useToast } from '../components/Overlay';
import { Avatar, Bar, Button, DefinitionList, Empty, Panel, Pill, Segmented, Tabs, Tag, Unknown } from '../components/ui';
import { ConnectionSettings, CreateConnection } from './connections/ConnectionForms';
import { ModelCatalog } from './connections/ModelCatalog';
import { authorizationText, availabilityText, connectionHeadline, discoveryText } from '../lib/domain';
import { blockerLabels, dateTime, label, number, percent, relative } from '../lib/format';

type TypeFilter = 'all' | ResourceType;

function Layers({ c, size = 'md' }: { c: Connection; size?: 'sm' | 'md' }) {
  const n = c.model_catalog.counts;
  const layers: [string, string, number | null, string][] = [
    ['01', '发现目录', c.discovery.discovered_at ? n.discovered : null, discoveryText[c.discovery.state] ?? label(c.discovery.state)],
    ['02', '明确启用', n.approved, '本机允许列表'],
    ['03', '应用获权', n.application_authorized, '至少一个有效应用'],
    ['04', '历史能力', n.historically_verified, '当前配置 · 历史证据'],
  ];
  return <dl className={`layers layers-${size}`} aria-label="模型四层状态（各层独立统计）">
    {layers.map(([index, name, value, note]) => <div key={index}>
      <dt><span className="layer-index">{index}</span>{name}</dt>
      <dd>{value == null ? <Unknown>—</Unknown> : number(value)}</dd>
      {size === 'md' && <dd className="layer-note">{note}</dd>}
    </div>)}
  </dl>;
}

export function ConnectionsPage({ snapshot, openId, onOpen, creating, onCreating }: { snapshot: Snapshot; openId: string | null; onOpen: (id: string | null) => void; creating: boolean; onCreating: (open: boolean) => void }) {
  const { can, why, saving } = useManage();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const term = search.trim().toLowerCase();
  const connections = snapshot.connections;
  const totals = useMemo(() => connections.reduce((acc, c) => {
    const n = c.model_catalog.counts;
    return { discovered: acc.discovered + n.discovered, approved: acc.approved + n.approved, authorized: acc.authorized + n.application_authorized, verified: acc.verified + n.historically_verified };
  }, { discovered: 0, approved: 0, authorized: 0, verified: 0 }), [connections]);
  const visible = connections.filter(c => (type === 'all' || c.resource_type === type)
    && (!term || [c.name, c.id, c.provider, ...c.model_catalog.models.map(m => m.id)].some(v => v.toLowerCase().includes(term))));
  const types = [...new Set(connections.map(c => c.resource_type))];
  const editable = can.model_approval;
  const createButton = <Button variant="primary" icon="sparkle" disabled={!can.connection_management} title={can.connection_management ? undefined : why.connection_management} onClick={() => onCreating(true)}>新建连接</Button>;
  const createSheet = <Sheet open={creating} busy={Boolean(saving)} onClose={() => onCreating(false)} labelId="create-connection-title" eyebrow="连接" title="新建连接" subtitle="添加 API 或 Key 型 Token Plan；Key 只保存在本机。">
    {creating && <CreateConnection snapshot={snapshot} onCreated={id => { onCreating(false); onOpen(id); toast({ tone: 'good', text: `连接 ${id} 已创建。尚未发现或启用任何模型。` }); }} />}
  </Sheet>;

  if (!connections.length) return <>
    <Panel><Empty icon="connections" title="还没有连接">{can.connection_management ? '添加第一个 API 或 Token Plan 连接；ChatGPT 订阅需先在终端完成 OAuth 授权。' : '在终端使用 Selark CLI 添加连接后，它们会显示在这里。'}<p>{createButton}</p></Empty></Panel>
    {createSheet}
  </>;

  return <>
    <section className="layer-summary" aria-label="全部连接的模型四层状态">
      {[['发现目录', totals.discovered, '供应商目录中出现的模型', 'search'], ['明确启用', totals.approved, '进入本机资源池的模型', 'check'], ['应用获权', totals.authorized, '对至少一个有效应用生效', 'apps'], ['历史能力', totals.verified, '当前配置下有历史成功证据', 'shield']].map(([name, value, note, icon], index) =>
        <article key={name as string} className="layer-card">
          <span className="layer-card-index">0{index + 1}</span>
          <Icon name={icon as 'search'} size={16} />
          <strong>{number(value as number)}</strong>
          <span className="layer-card-name">{name}</span>
          <small>{note}</small>
        </article>)}
      <p className="layer-summary-note"><Icon name="info" size={14} />四层彼此独立：发现不等于启用，启用不等于应用获权，历史成功也不代表当前可用。</p>
    </section>

    <div className="toolbar">
      <label className="search-field"><Icon name="search" size={16} /><span className="sr-only">搜索连接或模型</span>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索连接、供应商或模型" autoComplete="off" /></label>
      {types.length > 1 && <Segmented label="资源类型" size="sm" value={type} onChange={setType}
        options={[{ value: 'all' as TypeFilter, label: '全部' }, ...types.map(t => ({ value: t as TypeFilter, label: label(t) }))]} />}
      <span className="toolbar-count">{visible.length} / {connections.length} 个连接</span>
      <Pill tone={editable ? 'info' : 'neutral'}>{editable ? '可管理模型' : '模型只读'}</Pill>
      {createButton}
    </div>

    {!visible.length ? <Panel><Empty icon="search" title="没有匹配的连接">换个关键词或资源类型试试。</Empty></Panel>
      : <div className="card-grid">{visible.map(c => {
        const head = connectionHeadline(c), auth = authorizationText(c);
        const matches = term ? c.model_catalog.models.filter(m => m.id.toLowerCase().includes(term)).map(m => m.id) : [];
        return <article key={c.id} className={`entity-card${c.enabled ? '' : ' is-off'}`}>
          <header className="entity-head">
            <Avatar id={c.provider} text={c.provider} />
            <div className="entity-titles">
              <h3><button type="button" className="stretch" onClick={() => onOpen(c.id)}>{c.name}</button></h3>
              <p><Tag>{label(c.resource_type)}</Tag><span className="mono">{c.id}</span></p>
            </div>
            <Pill tone={head.tone}>{head.text}</Pill>
          </header>
          <Layers c={c} size="sm" />
          <dl className="facts">
            <div><dt>本地授权</dt><dd><Pill tone={auth.tone} dot={false}>{auth.text}</Pill></dd></div>
            <div><dt>默认模型</dt><dd>{c.default_model ? <span className="mono">{c.default_model}</span> : <Unknown>未设置</Unknown>}</dd></div>
            <div><dt>历史验证</dt><dd>{c.verification.verified_at ? relative(c.verification.verified_at) : '尚无记录'}</dd></div>
          </dl>
          {(c.availability.blockers.length > 0 || matches.length > 0) && <div className="entity-chips">
            {c.availability.blockers.map(b => <Tag key={b} tone="muted"><Icon name="alert" size={12} />{blockerLabels[b] ?? b}</Tag>)}
            {matches.slice(0, 3).map(m => <Tag key={m} mono tone="accent">{m}</Tag>)}
          </div>}
          <footer className="entity-foot"><span>{c.models.length} 个已启用 · {c.model_catalog.models.length} 个目录模型</span><span className="entity-go">{editable || can.connection_management ? '管理' : '查看详情'}<Icon name="arrowRight" size={14} /></span></footer>
        </article>;
      })}</div>}

    <ConnectionSheet snapshot={snapshot} id={openId} onClose={() => onOpen(null)} />
    {createSheet}
  </>;
}

function ConnectionSheet({ snapshot, id, onClose }: { snapshot: Snapshot; id: string | null; onClose: () => void }) {
  const c = id ? snapshot.connections.find(item => item.id === id) ?? null : null;
  const [tab, setTab] = useState<'models' | 'auth' | 'quota' | 'settings'>('models');
  const [lastId, setLastId] = useState(id);
  if (lastId !== id) { setLastId(id); setTab('models'); }
  return <Sheet open={Boolean(c)} onClose={onClose} labelId="connection-title" eyebrow={c ? `${label(c.resource_type)} · ${c.provider}` : ''}
    title={c?.name ?? ''} subtitle={c && <span className="mono">{c.id}{!c.enabled && ' · 已停用'}</span>}>
    {c && <>
      <Tabs label="连接详情" value={tab} onChange={setTab} tabs={[['models', `模型目录 · ${c.model_catalog.models.length}`], ['auth', '授权与验证'], ['quota', '官方套餐窗口'], ['settings', '设置']]} />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="tabpanel">
        {tab === 'models' && <ModelCatalog key={c.id} c={c} />}
        {tab === 'auth' && <ConnectionFacts c={c} />}
        {tab === 'quota' && <ProviderQuota c={c} />}
        {tab === 'settings' && <ConnectionSettings key={c.id} id={c.id} />}
      </div>
    </>}
  </Sheet>;
}

function ConnectionFacts({ c }: { c: Connection }) {
  const a = c.authorization, v = c.verification, auth = authorizationText(c), avail = availabilityText(c);
  return <>
    <section className="detail-section"><h3>授权与可用性</h3><DefinitionList items={[
      ['凭据方式', label(a.kind)],
      ['本地授权', <Pill key="a" tone={auth.tone}>{auth.text}</Pill>],
      ['远端凭据有效性', a.remote_validity && a.remote_validity !== 'unknown' ? label(a.remote_validity) : <Unknown key="r">未知 · 未向供应商验证</Unknown>],
      ['当前可用性', <Pill key="v" tone={avail.tone}>{avail.text}</Pill>],
      ['本地阻碍', c.availability.blockers.length ? c.availability.blockers.map(b => blockerLabels[b] ?? b).join('；') : '未发现已知本地阻碍'],
      ...(a.kind === 'oauth' ? [
        ['OAuth 访问到期', a.expires_at ? dateTime(a.expires_at) : <Unknown key="e">不适用 / 未知</Unknown>],
        ['刷新凭据', a.refresh_available == null ? <Unknown key="f" /> : a.refresh_available ? '本地存在' : '未提供'],
        ['套餐权限', a.plan_permission == null ? <Unknown key="p" /> : a.plan_permission ? '历史已确认' : '未确认'],
      ] as [string, ReactNode][] : []),
    ]} /></section>
    <section className="detail-section"><h3>历史验证</h3><DefinitionList items={[
      ['连接级验证', <Pill key="s" tone={connectionHeadline(c).tone}>{label(v.state)}</Pill>],
      ['验证时间', v.verified_at ? `${dateTime(v.verified_at)}（${relative(v.verified_at)}）` : '尚无记录'],
      ['验证模型', v.model ? <span className="mono">{v.model}</span> : null],
      ['默认模型', c.default_model ? <span className="mono">{c.default_model}</span> : <Unknown key="d">未设置</Unknown>],
    ]} /><p className="note">历史成功只证明当时的配置与模型；API Key 已配置或 OAuth 本地就绪不代表远端有效。</p></section>
    <section className="detail-section"><h3>模型目录</h3><DefinitionList items={[
      ['发现状态', discoveryText[c.discovery.state] ?? label(c.discovery.state)],
      ['最近检查', dateTime(c.discovery.checked_at, '尚未查询')],
      ['目录获取时间', dateTime(c.discovery.discovered_at, '尚未获取')],
      ['目录与当前配置一致', c.discovery.current ? '是' : '否 · 来源已变化'],
      ['协议', c.model_catalog.protocol ? label(c.model_catalog.protocol) : null],
      ['审批版本', <span key="r" className="mono">r{c.model_catalog.approval_revision}</span>],
    ]} /></section>
    <p className="sheet-hint"><Icon name="terminal" size={15} />OAuth 登录与退出在终端通过 Selark CLI 完成；Dashboard 不刷新 OAuth、不查询套餐、不调用模型。只有「发现模型」会读取供应商目录。</p>
  </>;
}

function ProviderQuota({ c }: { c: Connection }) {
  const q = c.provider_quota;
  const listOrFlag = (v: unknown) => Array.isArray(v) ? (v.length ? v.join('、') : '无') : v === true ? '存在' : v === false ? '无' : null;
  return <>
    <div className="mode-note"><Icon name="info" size={16} /><p>这是供应商历史报告的套餐窗口快照，保留供应商原单位，不换算为 Token；它不同于 Selark 本地应用配额，也不同于用量分析中的历史调用。</p></div>
    <section className="detail-section"><h3>快照</h3><DefinitionList items={[
      ['快照状态', label(q.state)],
      ['报告剩余 Token', q.remaining_tokens == null ? <Unknown key="r" /> : number(q.remaining_tokens)],
      ['当前剩余 Token', q.current_remaining_tokens == null ? <Unknown key="c" /> : number(q.current_remaining_tokens)],
      ['历史快照', q.historical_snapshot == null ? null : q.historical_snapshot ? '是 · 不代表当前余额' : '否'],
      ['报告时间', q.checked_at ? `${dateTime(q.checked_at)}（${relative(q.checked_at)}）` : '尚无记录'],
      ['会员状态', q.membership_status ? label(q.membership_status) : null],
      ['额外用量', q.extra_usage ? label(q.extra_usage) : null],
      ['字段冲突', listOrFlag(q.conflicting_fields)],
      ['字段无效', listOrFlag(q.invalid_fields)],
    ]} /></section>
    {q.windows.length > 0 && <section className="detail-section"><h3>历史窗口</h3><ul className="quota-windows">{q.windows.map(w =>
      <li key={w.name}><div><strong>{w.name}</strong><span>{w.used_ratio == null ? '已用比例未知' : `已用 ${percent(w.used_ratio)}`}</span></div>
        <Bar value={w.used_ratio} max={1} tone={w.used_ratio != null && w.used_ratio > 0.85 ? 'warn' : 'accent'} label={`${w.name} 已用比例 ${percent(w.used_ratio)}`} />
        <small>重置：{dateTime(w.reset_at, '未知')}</small></li>)}</ul></section>}
    {q.reported_counters.length > 0 && <section className="detail-section"><h3>报告计数</h3><div className="table-wrap"><table className="table compact">
      <thead><tr><th scope="col">窗口</th><th scope="col">单位</th><th scope="col" className="num">上限</th><th scope="col" className="num">已用</th><th scope="col" className="num">剩余</th><th scope="col">重置</th></tr></thead>
      <tbody>{q.reported_counters.map((w, i) => <tr key={`${w.window}-${i}`}><td>{w.window}</td><td>{w.unit}</td><td className="num">{number(w.limit)}</td><td className="num">{number(w.used)}</td><td className="num">{number(w.remaining)}</td><td>{dateTime(w.reset_at, '未知')}</td></tr>)}</tbody>
    </table></div></section>}
    {!q.windows.length && !q.reported_counters.length && <Empty icon="gauge" title="没有历史套餐窗口">{c.resource_type === 'api' ? '按量 API 通常没有套餐窗口。' : '尚无供应商报告的套餐窗口。'}</Empty>}
  </>;
}
