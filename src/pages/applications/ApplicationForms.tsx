import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApplicationPolicy, ManagedApplication, Policy, Snapshot } from '../../api/types';
import { ApiError } from '../../api/http';
import { useManage } from '../../app/manage';
import { Field, FormSection, LimitInput, limitText, Notice, parseLimit, TextInput, ToggleRow } from '../../components/form';
import { Icon } from '../../components/Icon';
import { ConfirmDialog } from '../../components/Overlay';
import { Button, Empty, Segmented, Skeleton, Tag } from '../../components/ui';
import type { Outcome } from '../../hooks/useDashboard';
import { dateTime, label, number } from '../../lib/format';

type PolicyPatch = ApplicationPolicy['policy'];
type ListMode = 'any' | 'list' | 'none';
type LimitKey = 'requests_per_minute' | 'max_concurrent_requests' | 'max_output_tokens' | 'max_estimated_input_tokens' | 'daily_token_limit';
const limits: { key: LimitKey; label: string; min: number; max: number; unit: string; hint?: string }[] = [
  { key: 'daily_token_limit', label: '日 Token 上限', min: 1, max: 1e12, unit: 'Token', hint: 'UTC 日计算，含实际用量与保守预留；用量未知时暂停新调用。' },
  { key: 'max_concurrent_requests', label: '并发上限', min: 1, max: 256, unit: '个' },
  { key: 'requests_per_minute', label: '每分钟请求', min: 1, max: 100000, unit: '次/分' },
  { key: 'max_output_tokens', label: '单次输出上限', min: 1, max: 131072, unit: 'Token' },
  { key: 'max_estimated_input_tokens', label: '估算输入上限', min: 1, max: 2000000, unit: 'Token' },
];
const DEFAULT_POLICY: Policy = {
  allow_token_plans: false, allowed_connections: null, allowed_models: null,
  requests_per_minute: null, max_concurrent_requests: null, max_output_tokens: null, max_estimated_input_tokens: null,
  daily_token_limit: null, daily_budget: null, budget_currency: 'USD',
};

interface Draft {
  connMode: ListMode; connections: string[]; modelMode: ListMode; models: string[];
  allow_token_plans: boolean;
  limits: Record<LimitKey, string>; daily_budget: string; budget_currency: string;
}
const mode = (value: string[] | null): ListMode => (value == null ? 'any' : value.length ? 'list' : 'none');
function toDraft(p: Policy): Draft {
  return {
    connMode: mode(p.allowed_connections ?? null), connections: p.allowed_connections ?? [],
    modelMode: mode(p.allowed_models ?? null), models: p.allowed_models ?? [],
    allow_token_plans: Boolean(p.allow_token_plans),
    limits: Object.fromEntries(limits.map(l => [l.key, limitText(p[l.key])])) as Record<LimitKey, string>,
    daily_budget: p.daily_budget ?? '', budget_currency: p.budget_currency ?? 'USD',
  };
}
function toPolicy(d: Draft): Policy {
  const list = (m: ListMode, items: string[]) => (m === 'any' ? null : m === 'none' ? [] : [...items].sort());
  return {
    allow_token_plans: d.allow_token_plans,
    allowed_connections: list(d.connMode, d.connections), allowed_models: list(d.modelMode, d.models),
    ...Object.fromEntries(limits.map(l => [l.key, parseLimit(d.limits[l.key])])),
    daily_budget: d.daily_budget.trim() || null, budget_currency: d.budget_currency,
  } as Policy;
}
const normalize = (v: unknown) => (Array.isArray(v) ? JSON.stringify([...v].sort()) : JSON.stringify(v ?? null));
/** Only changed fields go out: the backend treats `policy` as a non-empty patch. */
export function diffPolicy(original: Policy, next: Policy): PolicyPatch {
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => normalize(original[key as keyof Policy]) !== normalize(value))) as PolicyPatch;
}
function draftErrors(d: Draft) {
  const errors: Record<string, string | null> = {};
  for (const l of limits) {
    const v = d.limits[l.key];
    errors[l.key] = v !== '' && (!/^\d+$/.test(v) || Number(v) < l.min || Number(v) > l.max) ? `请输入 ${number(l.min)}–${number(l.max)} 的整数，或留空表示不限。` : null;
  }
  errors.daily_budget = d.daily_budget && (!/^\d{1,10}(?:\.\d{1,9})?$/.test(d.daily_budget) || Number(d.daily_budget) > 1e9) ? '非负十进制金额，最多 9 位小数。' : null;
  errors.budget_currency = !/^[A-Z]{3}$/.test(d.budget_currency) ? '三位大写币种代码，例如 USD。' : null;
  errors.connections = d.connMode === 'list' && !d.connections.length ? '请选择至少一个连接，或改为「全部拒绝」。' : null;
  errors.models = d.modelMode === 'list' && !d.models.length ? '请选择至少一个模型，或改为「全部拒绝」。' : null;
  return errors;
}

/** Same rule the gateway applies: Token Plans need the flag plus an explicit connection entry. */
function preview(snapshot: Snapshot, p: Policy) {
  let connections = 0, models = 0;
  for (const c of snapshot.connections) {
    if (!c.enabled) continue;
    if (c.resource_type !== 'api') {
      if (!p.allowed_connections?.includes(c.id)) continue;
      if (!p.allow_token_plans) continue;
    } else if (p.allowed_connections != null && !p.allowed_connections.includes(c.id)) continue;
    const ok = c.model_catalog.models.filter(m => m.approved && (p.allowed_models == null || p.allowed_models.includes(`${c.id}::${m.id}`)));
    if (ok.length) { connections++; models += ok.length; }
  }
  return { connections, models };
}

export function PolicyEditor({ draft, onChange, snapshot, errors, disabled }: { draft: Draft; onChange: (d: Draft) => void; snapshot: Snapshot; errors: Record<string, string | null>; disabled?: boolean }) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  const known = new Set(snapshot.connections.map(c => c.id));
  const connIds = [...new Set([...snapshot.connections.map(c => c.id), ...draft.connections])];
  const modelIds = [...new Set([...snapshot.connections.flatMap(c => c.model_catalog.models.map(m => `${c.id}::${m.id}`)), ...draft.models])];
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const modes = [{ value: 'any' as const, label: '不限' }, { value: 'list' as const, label: '指定' }, { value: 'none' as const, label: '全部拒绝' }];
  const p = preview(snapshot, toPolicy(draft));
  return <>
    <FormSection title="资源权限" description="「不限」是通配；「全部拒绝」是空列表。Token Plan 还需打开对应开关，并在允许连接中明确列出。">
      <div className="field field-wide">
        <div className="field-row"><span className="field-label">允许连接</span><Segmented label="允许连接" size="sm" value={draft.connMode} onChange={v => set('connMode', v)} options={modes} /></div>
        {draft.connMode === 'list' && <div className="check-grid">{connIds.map(id => {
          const c = snapshot.connections.find(x => x.id === id);
          return <label key={id} className="check-card"><input type="checkbox" disabled={disabled} checked={draft.connections.includes(id)} onChange={() => set('connections', toggle(draft.connections, id))} />
            <span><strong>{c?.name ?? id}</strong><small>{c ? `${label(c.resource_type)} · ${id}` : `${id} · 已不存在`}</small></span></label>;
        })}</div>}
        {errors.connections && <p className="field-error" role="alert"><Icon name="alert" size={13} />{errors.connections}</p>}
      </div>
      <div className="field field-wide">
        <div className="field-row"><span className="field-label">允许模型</span><Segmented label="允许模型" size="sm" value={draft.modelMode} onChange={v => set('modelMode', v)} options={modes} /></div>
        {draft.modelMode === 'list' && <div className="check-grid">{modelIds.map(key => {
          const [cid, mid] = key.split('::');
          return <label key={key} className="check-card"><input type="checkbox" disabled={disabled} checked={draft.models.includes(key)} onChange={() => set('models', toggle(draft.models, key))} />
            <span><strong className="mono">{mid}</strong><small>{snapshot.connections.find(c => c.id === cid)?.name ?? cid}{known.has(cid) ? '' : ' · 已不存在'}</small></span></label>;
        })}</div>}
        {errors.models && <p className="field-error" role="alert"><Icon name="alert" size={13} />{errors.models}</p>}
      </div>
      <div className="field field-wide"><ToggleRow label="允许 Token Plan" disabled={disabled} checked={draft.allow_token_plans} onChange={v => set('allow_token_plans', v)} description="套餐资源仅限个人交互式使用。" /></div>
      <p className="preview field-wide"><Icon name="eye" size={14} />按此策略，当前可用 <b>{p.connections}</b> 个连接 · <b>{p.models}</b> 个已启用模型（还受连接启停与模型启用影响）。</p>
    </FormSection>
    <FormSection title="限额" description="留空表示不单独限制，不等于 0。">
      {limits.map(l => <Field key={l.key} label={l.label} hint={l.hint} error={errors[l.key]}>{(id, d) =>
        <LimitInput id={id} value={draft.limits[l.key]} min={l.min} max={l.max} unit={l.unit} describedBy={d} onChange={v => set('limits', { ...draft.limits, [l.key]: v })} />}</Field>)}
      <Field label="日预算" hint="按调用时价格快照估算，不是供应商账单；留空表示不设预算。" error={errors.daily_budget}>{(id, d) =>
        <div className="limit-input"><TextInput id={id} inputMode="decimal" value={draft.daily_budget} placeholder="不设" aria-describedby={d} disabled={disabled} onChange={e => set('daily_budget', e.target.value.trim())} /></div>}</Field>
      <Field label="预算币种" error={errors.budget_currency}>{(id, d) =>
        <TextInput id={id} value={draft.budget_currency} maxLength={3} aria-describedby={d} disabled={disabled} onChange={e => set('budget_currency', e.target.value.toUpperCase())} />}</Field>
    </FormSection>
  </>;
}

/* ---------------------------------------------------------------- create */

export function CreateApplication({ snapshot, onDone }: { snapshot: Snapshot; onDone: () => void }) {
  const { api, run, saving } = useManage();
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<Draft>(() => toDraft(DEFAULT_POLICY));
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<Outcome | null>(null);
  // The one-time token lives only in this component's memory and disappears when the sheet closes.
  const [created, setCreated] = useState<{ id: string; name: string; token: string } | null>(null);
  const errors = { ...draftErrors(draft), name: !name.trim() ? '请输入应用名称。' : !/^[^\x00-\x1f\x7f]{1,80}$/.test(name) ? '名称最多 80 个可打印字符。' : null };
  const busy = saving === 'create-application';

  async function submit() {
    setTouched(true); setStatus(null);
    if (Object.values(errors).some(Boolean)) return;
    const patch = diffPolicy(DEFAULT_POLICY, toPolicy(draft));
    const body = Object.keys(patch).length ? { name: name.trim(), policy: patch as Policy } : { name: name.trim() };
    const result = await run(signal => api.createApplication(body, signal), { key: 'create-application' });
    if (!result) return;
    if (result.ok) { setCreated({ id: result.value.id, name: result.value.name, token: result.value.token }); return; }
    setStatus(result.status === null || (result.status ?? 0) >= 500
      ? { tone: 'warn', text: `${result.outcome.text} 请先刷新应用列表确认是否已创建；令牌无法再次查询，不要直接重复提交。` } : result.outcome);
  }

  if (created) return <TokenReveal app={created} onDone={() => { setCreated(null); onDone(); }} />;
  return <form className="form" noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
    <FormSection title="应用">
      <Field label="应用名称" wide error={touched ? errors.name : null} hint="用于在 Dashboard 中识别调用方，例如编辑器或脚本名。">{(id, d) =>
        <TextInput id={id} value={name} maxLength={80} aria-describedby={d} placeholder="我的编辑器" autoFocus onChange={e => setName(e.target.value)} />}</Field>
    </FormSection>
    <PolicyEditor draft={draft} onChange={setDraft} snapshot={snapshot} errors={touched ? errors : {}} />
    <Notice tone="info">创建后会生成一个<strong>只显示一次</strong>的调用令牌。请准备好在下一步复制保存。</Notice>
    {status && <Notice tone={status.tone}>{status.text}</Notice>}
    <div className="form-actions"><Button type="submit" variant="primary" icon="key" disabled={busy || Boolean(saving)}>{busy ? '正在创建…' : '创建并生成令牌'}</Button></div>
  </form>;
}

function TokenReveal({ app, onDone }: { app: { id: string; name: string; token: string }; onDone: () => void }) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'manual'>('idle');
  const field = useRef<HTMLInputElement>(null);
  async function copy() {
    try { await navigator.clipboard.writeText(app.token); setCopied('done'); }
    catch { field.current?.select(); setCopied('manual'); }
  }
  return <div className="token-reveal" aria-labelledby="token-title">
    <span className="token-icon"><Icon name="key" size={22} /></span>
    <h3 id="token-title">{app.name} 已创建</h3>
    <p className="token-sub mono">{app.id}</p>
    <div className="token-box">
      <label htmlFor="one-time-token" className="sr-only">一次性调用令牌</label>
      <input id="one-time-token" ref={field} className="token-value" readOnly value={app.token} spellCheck={false} autoComplete="off" onFocus={e => e.currentTarget.select()} />
      <Button variant="primary" icon={copied === 'done' ? 'check' : undefined} onClick={() => void copy()}>{copied === 'done' ? '已复制' : '复制令牌'}</Button>
    </div>
    {copied === 'manual' && <p className="note">浏览器不允许自动复制，令牌已选中，请按 Ctrl+C / ⌘C。</p>}
    <Notice tone="warn"><strong>这是唯一一次显示此令牌。</strong>关闭后页面会清除它，之后无法再查询；遗失时只能撤销此应用并重新创建。不要把令牌粘贴到日志或聊天中。</Notice>
    <div className="form-actions"><Button variant="primary" onClick={onDone}>我已保存，关闭</Button></div>
  </div>;
}

/* ------------------------------------------------------- policy & revoke */

export function ApplicationSettings({ id, snapshot }: { id: string; snapshot: Snapshot }) {
  const { api, read, run, saving, can, why } = useManage();
  const [managed, setManaged] = useState<ManagedApplication | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [status, setStatus] = useState<Outcome | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    read(signal => api.getApplication(id, signal), controller.signal).then(item => { setManaged(item); setDraft(toDraft(item.policy)); }).catch(error => {
      if (!controller.signal.aborted) setLoadError(error instanceof ApiError ? error.message : '应用策略暂不可读。');
    });
    return () => controller.abort();
  }, [api, read, id, reload]);
  const patch = useMemo(() => (managed && draft ? diffPolicy(managed.policy, toPolicy(draft)) : {}), [managed, draft]);

  if (loadError) return <Empty icon="alert" tone="error" title="无法读取应用策略">{loadError}<p><Button size="sm" icon="refresh" onClick={() => setReload(r => r + 1)}>重试</Button></p></Empty>;
  if (!managed || !draft) return <div className="form"><Skeleton className="sk-chart" /></div>;
  const editable = can.application_management && managed.active;
  const errors = draftErrors(draft);
  const changed = Object.keys(patch);
  const invalid = Object.values(errors).some(Boolean);
  const busy = saving === `policy:${id}`;

  async function save() {
    if (!managed || !changed.length || invalid) return;
    setStatus(null);
    const result = await run(signal => api.updateApplicationPolicy(id, { revision: managed.revision, policy: patch }, signal), { key: `policy:${id}` });
    if (!result) return;
    if (result.ok) { setManaged(result.value); setDraft(toDraft(result.value.policy)); setStatus({ tone: 'good', text: `策略已保存（${changed.length} 项）。网关在派发前复查权限，无需重启。` }); return; }
    if (result.status === 409) { setReload(r => r + 1); setStatus({ tone: 'warn', text: `${result.outcome.text} 表单已重置为最新策略。` }); return; }
    setStatus(result.outcome);
  }
  async function revoke() {
    if (!managed) return;
    setStatus(null);
    const result = await run(signal => api.revokeApplication(id, { revision: managed.revision }, signal), { key: `revoke:${id}` });
    if (!result) return;
    if (result.ok) { setManaged(result.value); setDraft(toDraft(result.value.policy)); setStatus({ tone: 'good', text: '令牌已撤销：新请求立即被拒绝，已接纳的请求继续完成。此操作无法恢复。' }); return; }
    if (result.status === 409) setReload(r => r + 1);
    setStatus(result.outcome);
  }

  return <><form className="form" noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
    {!managed.active ? <Notice tone="info">此应用已于 {dateTime(managed.revoked_at, '未知时间')} 撤销，策略仅供查看。</Notice>
      : !can.application_management && <Notice tone="info">{why.application_management} 策略仅供查看。</Notice>}
    <fieldset className="plain-fieldset" disabled={!editable}>
      <PolicyEditor draft={draft} onChange={setDraft} snapshot={snapshot} errors={errors} disabled={!editable} />
    </fieldset>
    {status && <Notice tone={status.tone}>{status.text}</Notice>}
    {editable && <div className="form-actions">
      <span className="form-dirty">{changed.length ? `${changed.length} 项未保存的修改` : '没有未保存的修改'}</span>
      <Button disabled={!changed.length || busy} onClick={() => setDraft(toDraft(managed.policy))}>还原</Button>
      <Button type="submit" variant="primary" disabled={!changed.length || invalid || busy || Boolean(saving)}>{busy ? '正在保存…' : '保存策略'}</Button>
    </div>}
    {editable && <section className="danger-zone" aria-labelledby="danger-title">
      <div><h3 id="danger-title">撤销调用令牌</h3><p>新请求立即被拒绝，已接纳的请求继续完成。撤销无法恢复，只能重新创建应用。</p></div>
      <Button variant="danger" disabled={Boolean(saving)} onClick={() => setRevoking(true)}>{saving === `revoke:${id}` ? '正在撤销…' : '撤销令牌'}</Button>
    </section>}
    <p className="form-meta"><Tag mono>rev {managed.revision.slice(0, 8)}</Tag>创建于 {dateTime(managed.created_at)}</p>
  </form>
    <ConfirmDialog open={revoking} danger title={`撤销「${managed.name}」？`} confirmLabel="永久撤销"
      onCancel={() => setRevoking(false)} onConfirm={() => { setRevoking(false); void revoke(); }}>
      <p>使用此令牌的应用将无法再发起新调用；已接纳的请求会继续完成。</p>
      <p><strong>没有恢复接口。</strong>历史记录与用量保留。</p>
    </ConfirmDialog>
  </>;
}
