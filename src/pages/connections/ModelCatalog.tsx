import { useDeferredValue, useState } from 'react';
import type { BatchModelApproval, CatalogModel, Connection } from '../../api/types';
import { useManage } from '../../app/manage';
import { Notice } from '../../components/form';
import { Icon } from '../../components/Icon';
import { ConfirmDialog } from '../../components/Overlay';
import { Button, Empty, Segmented, Switch, Tag } from '../../components/ui';
import type { Outcome } from '../../hooks/useDashboard';
import { discoveryText } from '../../lib/domain';
import { dateTime, label, relative } from '../../lib/format';
import { presetFor, reasoningLabel } from '../../lib/agent-config';

const DISCOVERY_TIMEOUT = 50000; // backend allows up to 45 s; give it room before declaring "unconfirmed"

type Pending = { models: string[]; enabled: false; reason: 'single' | 'bulk' | 'all' };

export function ModelCatalog({ c }: { c: Connection }) {
  const { api, run, saving, can, why } = useManage();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [limit, setLimit] = useState(80);
  const [scope, setScope] = useState<'all' | 'approved' | 'disabled'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending | null>(null);
  const [status, setStatus] = useState<Outcome | null>(null);
  const editable = can.model_approval;
  const revision = c.model_catalog.approval_revision;
  const all = c.model_catalog.models;
  const models = all.filter(m => m.id.toLowerCase().includes(deferredSearch) && (scope === 'all' || m.approved === (scope === 'approved')));
  const enabledOnly = c.models.filter(m => !all.some(item => item.id === m));
  const discovering = saving === `discover:${c.id}`;
  const busy = Boolean(saving);
  const discoveryOk = c.discovery.state === 'success' && c.discovery.current;
  const unapprovedListed = all.filter(m => !m.approved && m.discovery === 'listed').length;

  async function approve(ids: string[], enabled: boolean, opts: { clearDefault?: boolean; allModels?: boolean } = {}) {
    if (!editable || busy) return;
    const touchesDefault = !enabled && (opts.allModels ? c.default_model !== null : ids.includes(c.default_model ?? '\u0000'));
    if (touchesDefault && !opts.clearDefault) {
      setPending({ models: ids, enabled: false, reason: opts.allModels ? 'all' : ids.length > 1 ? 'bulk' : 'single' });
      return;
    }
    setStatus(null);
    const body: BatchModelApproval = opts.allModels
      ? { revision, enabled, all_models: true as const, clear_default: Boolean(opts.clearDefault) }
      : { revision, enabled, models: ids, clear_default: Boolean(opts.clearDefault) };
    const key = ids.length === 1 && !opts.allModels ? `${c.id}::${ids[0]}` : `approve:${c.id}`;
    const result = await run(signal => api.approveModels(c.id, body, signal), { key });
    if (!result) return;
    if (result.ok) {
      setSelected(new Set());
      const what = opts.allModels ? (enabled ? '目录中的全部模型' : '全部已启用模型') : ids.length === 1 ? ids[0] : `${ids.length} 个模型`;
      setStatus(result.refreshed
        ? { tone: 'good', text: `${what} 已${enabled ? '启用' : '禁用'}。应用授权保持不变${opts.clearDefault ? '，默认模型已清除' : ''}${enabled ? '；启用不会自动设为默认' : ''}。` }
        : { tone: 'warn', text: `${what} 已${enabled ? '启用' : '禁用'}，但快照未能刷新；请刷新核对。` });
      return;
    }
    if (result.code === 'default_model_confirmation') { setPending({ models: ids, enabled: false, reason: opts.allModels ? 'all' : 'bulk' }); return; }
    setStatus(result.outcome);
  }

  async function setDefault(model: string | null) {
    if (!editable || busy) return;
    setStatus(null);
    const result = await run(signal => api.setDefaultModel(c.id, { revision, model }, signal), { key: `default:${c.id}` });
    if (!result) return;
    setStatus(result.ok ? { tone: 'good', text: model ? `${model} 已设为默认模型。` : '默认模型已清除；应用需显式指定模型。' } : result.outcome);
  }

  async function discover() {
    if (!can.model_discovery || busy) return;
    setStatus(null);
    const result = await run(signal => api.discoverModels(c.id, signal), { key: `discover:${c.id}`, timeout: DISCOVERY_TIMEOUT });
    if (!result) return;
    if (!result.ok) {
      setStatus(result.code === 'discovery_busy' ? { tone: 'warn', text: '另一个模型发现任务正在进行，请稍后再试。' } : result.outcome);
      return;
    }
    const d = result.value.discovery;
    if (d.state === 'success') {
      const fresh = result.value.models.filter(m => !m.approved && m.discovery === 'listed').length;
      setStatus({ tone: 'good', text: `发现完成：目录中 ${d.count} 个模型${fresh ? `，其中 ${fresh} 个尚未启用` : ''}。新模型不会自动启用。` });
    } else {
      setStatus({ tone: 'bad', text: `发现失败${d.error_code ? `（${d.error_code}）` : ''}：已保留上次目录${d.discovered_at ? `（${relative(d.discovered_at)}获取）` : ''}，已有启用状态与默认模型不变。` });
    }
  }

  function toggleSelect(id: string) {
    setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  const selectedModels = all.filter(m => selected.has(m.id));
  const allVisibleSelected = models.length > 0 && models.every(m => selected.has(m.id));

  return <>
    <section className="discovery" aria-label="模型目录发现">
      <div className="discovery-main">
        <span className={`discovery-dot tone-${c.discovery.state === 'success' ? (c.discovery.current ? 'good' : 'warn') : c.discovery.state === 'failure' ? 'bad' : c.discovery.state === 'stale' ? 'warn' : 'unknown'}`} aria-hidden="true" />
        <div>
          <p className="discovery-title">{discoveryText[c.discovery.state] ?? label(c.discovery.state)}{c.discovery.state === 'success' && !c.discovery.current ? ' · 来源已变化' : ''}</p>
          <p className="discovery-sub">{c.discovery.checked_at ? `最近检查 ${relative(c.discovery.checked_at)} · ${dateTime(c.discovery.checked_at)}` : '尚未从供应商读取目录'}{c.discovery.discovered_at ? ` · 目录 ${c.discovery.count} 个` : ''}</p>
        </div>
      </div>
      <Button icon="refresh" className={discovering ? 'spinning' : ''} disabled={!can.model_discovery || busy} title={can.model_discovery ? '读取供应商的模型目录（不会启用任何模型）' : why.model_discovery} onClick={() => void discover()}>
        {discovering ? '正在发现…' : c.discovery.state === 'never' ? '发现模型' : '重新发现'}
      </Button>
    </section>
    {discovering && <Notice tone="info">正在读取供应商模型目录，最长约 45 秒。发现只更新目录，不会启用模型或修改默认值；期间其他查询不受影响。</Notice>}
    {!can.model_discovery && <p className="note"><Icon name="info" size={14} />{why.model_discovery}</p>}

    <div className={`mode-note${editable ? '' : ' readonly'}`}>
      <Icon name={editable ? 'info' : 'lock'} size={16} />
      <p>{editable
        ? '启用只改变本机资源池，应用策略继续独立生效；启用不会自动设为默认。禁用后不再接收该模型的新调用，已派发请求继续结算。'
        : `${why.model_approval} 模型启用状态只能查看。`}</p>
    </div>

    <div className="toolbar toolbar-tight">
      <label className="search-field"><Icon name="search" size={16} /><span className="sr-only">查找模型</span>
        <input type="search" value={search} onChange={e => { setSearch(e.target.value); setLimit(80); }} placeholder="查找模型" autoComplete="off" /></label>
      <Segmented label="启用状态" size="sm" value={scope} onChange={value => { setScope(value); setLimit(80); }} options={[{ value: 'all', label: '全部' }, { value: 'approved', label: '已启用' }, { value: 'disabled', label: '未启用' }]} />
      <span className="toolbar-count">{models.length} 个模型</span>
    </div>

    {editable && all.length > 0 && <div className={`bulkbar${selected.size ? ' on' : ''}`} role="group" aria-label="批量操作">
      <label className="check">
        <input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(models.map(m => m.id)))} />
        <span>{selected.size ? `已选 ${selected.size} 个` : '全选当前列表'}</span>
      </label>
      {selected.size > 0 ? <>
        <Button size="sm" disabled={busy || selectedModels.every(m => m.approved)} onClick={() => void approve(selectedModels.filter(m => !m.approved).map(m => m.id), true)}>启用所选</Button>
        <Button size="sm" disabled={busy || selectedModels.every(m => !m.approved)} onClick={() => void approve(selectedModels.filter(m => m.approved).map(m => m.id), false)}>禁用所选</Button>
        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>取消选择</Button>
      </> : <>
        <Button size="sm" variant="ghost" disabled={busy || !discoveryOk || !unapprovedListed} title={discoveryOk ? '启用当前成功发现目录中的全部模型' : '需要先成功发现当前目录'} onClick={() => void approve([], true, { allModels: true })}>启用目录全部</Button>
        <Button size="sm" variant="ghost" disabled={busy || !c.models.length} onClick={() => void approve(c.models, false, { allModels: true })}>禁用全部</Button>
      </>}
    </div>}

    {status && <Notice tone={status.tone}>{status.text}</Notice>}

    {!all.length ? <Empty icon="layers" title="目录中还没有模型">{c.discovery.state === 'never' ? '尚未执行模型发现。' : '最近一次发现没有返回模型。'}{can.model_discovery ? '点击「发现模型」读取供应商目录；发现不会启用任何模型。' : why.model_discovery}</Empty>
      : !models.length ? <Empty icon="search" title="没有匹配的模型">调整搜索词或启用状态筛选。</Empty>
      : <ul className="model-list">{models.slice(0, limit).map(m => <ModelRow key={m.id} c={c} m={m} editable={editable} busy={busy} saving={saving}
        selected={selected.has(m.id)} onSelect={() => toggleSelect(m.id)} onToggle={() => void approve([m.id], !m.approved)}
        onDefault={() => void setDefault(m.default ? null : m.id)} />)}</ul>}
    {models.length > limit && <Button onClick={() => setLimit(value => value + 80)}>显示更多模型（已显示 {limit} / {models.length}）</Button>}
    {enabledOnly.length > 0 && <p className="note"><Icon name="alert" size={14} />已启用但不在当前目录中：{enabledOnly.join('、')}</p>}

    <ConfirmDialog open={Boolean(pending)} danger title="禁用默认模型？" confirmLabel="禁用并清除默认"
      onCancel={() => setPending(null)}
      onConfirm={() => { const p = pending; setPending(null); if (p) void approve(p.models, false, { clearDefault: true, allModels: p.reason === 'all' }); }}>
      <p><b className="mono">{c.default_model}</b> 是 {c.name} 的当前默认模型{pending && pending.models.length > 1 ? `，本次将禁用 ${pending.reason === 'all' ? '全部已启用' : pending.models.length + ' 个'}模型` : ''}。</p>
      <p>禁用会同时<strong>清除默认值</strong>；之后应用需显式指定模型，或重新设置默认模型。重新启用不会自动恢复默认。</p>
    </ConfirmDialog>
  </>;
}

function ModelRow({ c, m, editable, busy, saving, selected, onSelect, onToggle, onDefault }: { c: Connection; m: CatalogModel; editable: boolean; busy: boolean; saving: string | null; selected: boolean; onSelect: () => void; onToggle: () => void; onDefault: () => void }) {
  const self = saving === `${c.id}::${m.id}`;
  const lastVerified = m.verification.find(v => v.verified_at)?.verified_at;
  const reasoning = presetFor(c, m.id);
  return <li className={`model-row${m.approved ? ' on' : ''}${selected ? ' selected' : ''}`}>
    {editable && <input type="checkbox" className="model-check" checked={selected} onChange={onSelect} aria-label={`选择 ${m.id}`} />}
    <div className="model-main">
      <p className="model-name"><span className="mono">{m.id}</span>
        {m.default && <Tag tone="accent"><Icon name="star" size={11} />默认模型</Tag>}
        {m.discovery !== 'listed' && <Tag tone="muted">{label(m.discovery)}</Tag>}
      </p>
      <p className="model-meta model-reasoning" title="根据供应商与具体模型的规格匹配；模型权限和历史调用验证仍单独显示。"><span>{reasoningLabel(reasoning)}{reasoning.efforts && Object.keys(reasoning.efforts).length ? ` · ${Object.keys(reasoning.efforts).join(' / ')}` : ''}</span></p>
      <p className="model-meta">
        <span title="应用策略匹配数 / 考虑连接与启用后的实际生效数">应用授权 <b>{m.authorized_applications.length}</b> 匹配 · <b>{m.effective_applications.length}</b> 生效</span>
        <span>{m.verified_capabilities.length ? m.verified_capabilities.map(cap => label(cap)).join(' / ') : '尚无模型级证据'}{lastVerified ? ` · ${relative(lastVerified)}` : ''}</span>
        <span className="unknown-text">实时可用性{label(m.live_availability)}</span>
      </p>
    </div>
    <div className="model-control">
      {editable && m.approved && <Button size="sm" variant="ghost" disabled={busy} onClick={onDefault} aria-label={m.default ? `清除默认模型 ${m.id}` : `将 ${m.id} 设为默认模型`}>
        {m.default ? '清除默认' : '设为默认'}</Button>}
      <span className={`model-state${m.approved ? ' on' : ''}`}>{self ? '保存中…' : m.approved ? '已启用' : '未启用'}</span>
      {editable ? <Switch checked={m.approved} label={`启用 ${m.id}`} disabled={busy} busy={self} onChange={onToggle} />
        : <Icon name="lock" size={15} title="只读" />}
    </div>
  </li>;
}
