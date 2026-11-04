import { useEffect, useMemo, useState } from 'react';
import type { ConnectionCreate, ConnectionPatch, ManagedConnection, Provider, Snapshot } from '../../api/types';
import { ApiError } from '../../api/http';
import { useManage } from '../../app/manage';
import { Field, FormSection, Notice, TextInput, ToggleRow } from '../../components/form';
import { Icon } from '../../components/Icon';
import { ConfirmDialog } from '../../components/Overlay';
import { Avatar, Button, Empty, Pill, Skeleton, Tag } from '../../components/ui';
import type { Outcome } from '../../hooks/useDashboard';
import { dateTime, label } from '../../lib/format';

type Plan = NonNullable<ConnectionCreate['plan']>;
type TokenParameter = ConnectionCreate['token_parameter'];
type AnthropicVersion = ConnectionCreate['anthropic_version'];
const ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const WORKSPACE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const NAME_PATTERN = /^[^\x00-\x1f\x7f]{1,80}$/;
const KEY_PATTERN = /^[\x21-\x7e]{1,8192}$/;

function urlProblem(value: string): string | null {
  try {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password) return '地址不能包含用户名或密码。';
    if (url.search || url.hash) return '地址不能包含查询串或片段。';
    if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) return '非本机地址必须使用 HTTPS。';
    return value.length > 2048 ? '地址过长。' : null;
  } catch { return '请输入完整地址，例如 https://relay.example/v1'; }
}

/** Shared state for the advanced settings of both forms. */
interface Advanced { timeout: string; stream_usage: boolean; token_parameter: TokenParameter; workspace_id: string; anthropic_version: AnthropicVersion; plan: Plan }
const defaultPlan: Plan = { tier: null, use: 'personal_interactive_coding', reasoning_effort: 'low', extra_usage_policy: 'forbid' };

function advancedErrors(a: Advanced) {
  const timeout = Number(a.timeout);
  return {
    timeout: !a.timeout || !Number.isFinite(timeout) || timeout < 1 || timeout > 600 ? '超时须在 1–600 秒之间。' : null,
    workspace_id: a.workspace_id && !WORKSPACE_PATTERN.test(a.workspace_id) ? '1–128 位字母、数字、下划线或短横线。' : null,
    tier: a.plan.tier != null && a.plan.tier !== '' && !NAME_PATTERN.test(a.plan.tier) ? '套餐档位最多 80 个可打印字符。' : null,
  };
}

function AdvancedFields({ value, onChange, fields, provider, errors }: { value: Advanced; onChange: (value: Advanced) => void; fields: Set<string>; provider: string; errors: ReturnType<typeof advancedErrors> }) {
  const set = <K extends keyof Advanced>(key: K, v: Advanced[K]) => onChange({ ...value, [key]: v });
  return <>
    {fields.has('timeout_seconds') && <Field label="请求超时" error={errors.timeout} hint="1–600 秒">{(id, d) =>
      <div className="limit-input"><TextInput id={id} inputMode="decimal" value={value.timeout} aria-describedby={d} onChange={e => set('timeout', e.target.value)} /><span className="limit-unit">秒</span></div>}</Field>}
    {fields.has('token_parameter') && <Field label="输出上限参数" hint="上游接受的输出 Token 字段名">{(id, d) =>
      <select id={id} className="input" aria-describedby={d} value={value.token_parameter} onChange={e => set('token_parameter', e.target.value as TokenParameter)}>
        <option value="max_tokens">max_tokens</option><option value="max_completion_tokens">max_completion_tokens</option></select>}</Field>}
    {fields.has('workspace_id') && <Field label="工作区 ID" optional error={errors.workspace_id}>{(id, d) =>
      <TextInput id={id} value={value.workspace_id} aria-describedby={d} placeholder="留空表示不使用" onChange={e => set('workspace_id', e.target.value)} />}</Field>}
    {fields.has('anthropic_version') && provider === 'anthropic' && <Field label="Anthropic API 版本">{(id, d) =>
      <select id={id} className="input" aria-describedby={d} value={value.anthropic_version} onChange={e => set('anthropic_version', e.target.value as AnthropicVersion)}>
        <option value="2026-10-21">2026-10-21</option><option value="2023-06-01">2023-06-01</option></select>}</Field>}
    {fields.has('stream_usage') && <div className="field field-wide"><ToggleRow label="流式响应返回用量" description="请求上游在流式结束时附带 Token 用量；关闭后流式调用的用量可能未知。" checked={value.stream_usage} onChange={v => set('stream_usage', v)} /></div>}
    {fields.has('plan') && <>
      <Field label="套餐档位" optional error={errors.tier}>{(id, d) =>
        <TextInput id={id} value={value.plan.tier ?? ''} aria-describedby={d} placeholder="例如 Pro" onChange={e => set('plan', { ...value.plan, tier: e.target.value || null })} />}</Field>
      <Field label="使用方式">{(id, d) =>
        <select id={id} className="input" aria-describedby={d} value={value.plan.use} onChange={e => set('plan', { ...value.plan, use: e.target.value as Plan['use'] })}>
          <option value="personal_interactive_coding">个人交互式编程</option><option value="personal_interactive">个人交互式使用</option></select>}</Field>
      <Field label="推理强度">{(id, d) =>
        <select id={id} className="input" aria-describedby={d} value={value.plan.reasoning_effort} onChange={e => set('plan', { ...value.plan, reasoning_effort: e.target.value as Plan['reasoning_effort'] })}>
          <option value="low">low</option><option value="high">high</option><option value="max">max</option></select>}</Field>
      <Field label="额外用量" hint="Selark 固定禁止超出套餐的额外计费用量。">{(id) => <TextInput id={id} value="禁止（forbid）" readOnly />}</Field>
    </>}
  </>;
}

/* ------------------------------------------------------------------ create */

export function CreateConnection({ snapshot, onCreated }: { snapshot: Snapshot; onCreated: (id: string) => void }) {
  const { api, read, run, saving } = useManage();
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState('');
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [advanced, setAdvanced] = useState<Advanced>({ timeout: '60', stream_usage: true, token_parameter: 'max_tokens', workspace_id: '', anthropic_version: '2026-10-21', plan: defaultPlan });
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<Outcome | null>(null);
  const [idTaken, setIdTaken] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    read(signal => api.getProviders(signal), controller.signal).then(r => setProviders(r.items)).catch(error => {
      if (!controller.signal.aborted) setLoadError(error instanceof ApiError ? error.message : '供应商列表暂不可读。');
    });
    return () => controller.abort();
  }, [api, read]);

  const provider = providers?.find(p => p.id === providerId) ?? null;
  const fields = useMemo(() => new Set(['timeout_seconds', 'stream_usage', 'token_parameter', 'workspace_id', 'anthropic_version', ...(provider?.resource_type === 'token_plan' ? ['plan'] : [])]), [provider]);
  const adv = advancedErrors(advanced);
  const errors = {
    provider: !provider ? '请选择供应商。' : null,
    id: !ID_PATTERN.test(id) ? '以小写字母开头，仅含小写字母、数字、下划线或短横线，最多 64 位。'
      : id === 'mimo-default' || snapshot.connections.some(c => c.id === id) ? '该连接 ID 已存在。' : idTaken === id ? '该连接 ID 已存在。' : null,
    name: name && !NAME_PATTERN.test(name) ? '名称最多 80 个可打印字符。' : null,
    base_url: provider && !provider.base_url && !baseUrl ? '此供应商需要填写接口地址。' : baseUrl ? urlProblem(baseUrl) : null,
    api_key: !apiKey ? '请输入 API Key。' : !KEY_PATTERN.test(apiKey) ? 'Key 不能包含空白或非 ASCII 字符。' : null,
    ...adv,
  };
  const invalid = Object.values(errors).some(Boolean);
  const busy = saving === 'create-connection';

  async function submit() {
    setTouched(true); setStatus(null);
    if (invalid || !provider) return;
    const body: ConnectionCreate = {
      id, provider: provider.id as ConnectionCreate['provider'], api_key: apiKey,
      name: name || null, base_url: baseUrl || null,
      timeout_seconds: Number(advanced.timeout), stream_usage: advanced.stream_usage, token_parameter: advanced.token_parameter,
      workspace_id: advanced.workspace_id || null,
      ...(provider.id === 'anthropic' ? { anthropic_version: advanced.anthropic_version } : {}),
      ...(provider.resource_type === 'token_plan' ? { plan: { ...advanced.plan, tier: advanced.plan.tier || null } } : {}),
    };
    const result = await run(signal => api.createConnection(body, signal), { key: 'create-connection' });
    if (!result) return;
    if (result.ok) { setApiKey(''); onCreated(result.value.id); return; }
    if (result.code === 'connection_exists') setIdTaken(id);
    setStatus(result.status === null
      ? { tone: 'warn', text: `${result.outcome.text} 先在列表中确认连接是否已创建，再决定是否重新提交。` } : result.outcome);
  }

  if (loadError) return <Empty icon="alert" tone="error" title="无法读取供应商列表">{loadError}</Empty>;
  if (!providers) return <div className="provider-grid">{[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="sk-provider" />)}</div>;
  const show = (key: keyof typeof errors) => (touched ? errors[key] : null);

  return <form className="form" noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
    <FormSection title="选择供应商" description="订阅类资源需要先在终端完成 OAuth 授权，这里无法创建。">
      <div className="provider-grid field-wide" role="radiogroup" aria-label="供应商">
        {providers.map(p => <button key={p.id} type="button" role="radio" aria-checked={providerId === p.id} disabled={!p.can_create}
          className={`provider-option${providerId === p.id ? ' on' : ''}`}
          onClick={() => { setProviderId(p.id); setBaseUrl(''); }}>
          <Avatar id={p.id} text={p.name} size="sm" />
          <span className="provider-text"><strong>{p.name}</strong><small>{label(p.resource_type)} · {p.can_create ? (p.base_url ? '预设地址' : '需填写地址') : '需通过 CLI 授权'}</small></span>
          {providerId === p.id && <Icon name="check" size={16} className="provider-check" />}
        </button>)}
      </div>
      {show('provider') && <p className="field-error field-wide" role="alert"><Icon name="alert" size={13} />{errors.provider}</p>}
    </FormSection>

    {provider && <>
      <FormSection title="基本信息">
        <Field label="连接 ID" error={show('id')} hint="创建后不可修改，用于应用权限与记录。">{(fid, d) =>
          <TextInput id={fid} value={id} aria-describedby={d} placeholder="my-relay" maxLength={64} onChange={e => setId(e.target.value.trim())} required />}</Field>
        <Field label="显示名称" optional error={show('name')}>{(fid, d) =>
          <TextInput id={fid} value={name} aria-describedby={d} placeholder={provider.name} maxLength={80} onChange={e => setName(e.target.value)} />}</Field>
        <Field label="接口地址" optional={Boolean(provider.base_url)} wide error={show('base_url')} hint={provider.base_url ? `留空使用预设：${provider.base_url}` : '非本机地址必须使用 HTTPS，不含查询串。'}>{(fid, d) =>
          <TextInput id={fid} type="url" value={baseUrl} aria-describedby={d} placeholder={provider.base_url ?? 'https://relay.example/v1'} onChange={e => setBaseUrl(e.target.value.trim())} />}</Field>
        <Field label="API Key" wide error={show('api_key')} hint="只发送到本机 Selark 保存；页面与日志都不会回显。">{(fid, d) =>
          <TextInput id={fid} type="password" value={apiKey} aria-describedby={d} autoComplete="new-password" placeholder="粘贴供应商 API Key" onChange={e => setApiKey(e.target.value)} />}</Field>
      </FormSection>
      <details className="form-advanced"><summary>高级设置</summary>
        <div className="form-grid"><AdvancedFields value={advanced} onChange={setAdvanced} fields={fields} provider={provider.id} errors={touched ? adv : { timeout: null, workspace_id: null, tier: null }} /></div>
      </details>
      <Notice tone="info">创建后连接即启用，但<strong>不会自动发现或启用模型</strong>。下一步请在连接详情中手动发现并选择要启用的模型。</Notice>
    </>}
    {status && <Notice tone={status.tone}>{status.text}</Notice>}
    <div className="form-actions">
      <Button type="submit" variant="primary" icon={busy ? 'refresh' : 'check'} className={busy ? 'spinning' : ''} disabled={busy || Boolean(saving)}>{busy ? '正在创建…' : '创建连接'}</Button>
    </div>
  </form>;
}

/* -------------------------------------------------------------------- edit */

const fieldLabels: Record<string, string> = {
  name: '显示名称', enabled: '启用连接', base_url: '接口地址', api_key: 'API Key', timeout_seconds: '请求超时',
  stream_usage: '流式返回用量', token_parameter: '输出上限参数', workspace_id: '工作区 ID', anthropic_version: 'Anthropic 版本', plan: '套餐设置',
};

export function ConnectionSettings({ id }: { id: string }) {
  const { api, read, run, saving, can, why } = useManage();
  const [managed, setManaged] = useState<ManagedConnection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [baseUrl, setBaseUrl] = useState('');
  const [rotate, setRotate] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [advanced, setAdvanced] = useState<Advanced>({ timeout: '60', stream_usage: true, token_parameter: 'max_tokens', workspace_id: '', anthropic_version: '2026-10-21', plan: defaultPlan });
  const [status, setStatus] = useState<Outcome | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  function reset(item: ManagedConnection) {
    setManaged(item); setName(item.name); setEnabled(item.enabled); setBaseUrl(item.base_url);
    setRotate(false); setApiKey('');
    setAdvanced({ timeout: String(item.timeout_seconds), stream_usage: item.stream_usage, token_parameter: item.token_parameter,
      workspace_id: item.workspace_id ?? '', anthropic_version: item.anthropic_version, plan: item.plan ? { ...item.plan } : defaultPlan });
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    read(signal => api.getConnection(id, signal), controller.signal).then(reset).catch(error => {
      if (!controller.signal.aborted) setLoadError(error instanceof ApiError ? error.message : '连接配置暂不可读。');
    });
    return () => controller.abort();
  }, [api, read, id, reload]);

  if (loadError) return <Empty icon="alert" tone="error" title="无法读取连接配置">{loadError}<p><Button size="sm" icon="refresh" onClick={() => setReload(r => r + 1)}>重试</Button></p></Empty>;
  if (!managed) return <div className="form"><Skeleton className="sk-chart" /></div>;

  const editable = new Set(can.connection_management ? managed.editable_fields : []);
  const adv = advancedErrors(advanced);
  const errors = {
    name: editable.has('name') && !NAME_PATTERN.test(name) ? '名称为 1–80 个可打印字符。' : null,
    base_url: editable.has('base_url') && baseUrl !== managed.base_url ? urlProblem(baseUrl) : null,
    api_key: !rotate ? null : !apiKey ? '请输入新的 API Key，或取消更换。' : !KEY_PATTERN.test(apiKey) ? 'Key 不能包含空白或非 ASCII 字符。' : null,
    ...adv,
  };
  const patch: Omit<ConnectionPatch, 'revision'> = {};
  if (editable.has('name') && name !== managed.name) patch.name = name;
  if (editable.has('enabled') && enabled !== managed.enabled) patch.enabled = enabled;
  if (editable.has('base_url') && baseUrl !== managed.base_url) patch.base_url = baseUrl;
  if (editable.has('api_key') && rotate && apiKey) patch.api_key = apiKey;
  if (editable.has('timeout_seconds') && Number(advanced.timeout) !== managed.timeout_seconds) patch.timeout_seconds = Number(advanced.timeout);
  if (editable.has('stream_usage') && advanced.stream_usage !== managed.stream_usage) patch.stream_usage = advanced.stream_usage;
  if (editable.has('token_parameter') && advanced.token_parameter !== managed.token_parameter) patch.token_parameter = advanced.token_parameter;
  if (editable.has('workspace_id') && (advanced.workspace_id || null) !== managed.workspace_id) patch.workspace_id = advanced.workspace_id || null;
  if (editable.has('anthropic_version') && managed.provider === 'anthropic' && advanced.anthropic_version !== managed.anthropic_version) patch.anthropic_version = advanced.anthropic_version;
  const plan = { ...advanced.plan, tier: advanced.plan.tier || null };
  if (editable.has('plan') && JSON.stringify(plan) !== JSON.stringify(managed.plan ?? defaultPlan)) patch.plan = plan;
  const changed = Object.keys(patch);
  const invalid = Object.values(errors).some(Boolean);
  const busy = saving === `connection:${id}`;
  const resetsEvidence = changed.some(key => !['name', 'enabled'].includes(key));

  async function save() {
    setStatus(null);
    if (invalid || !changed.length || !managed) return;
    const result = await run(signal => api.updateConnection(id, { revision: managed.revision, ...patch }, signal), { key: `connection:${id}` });
    if (!result) return;
    if (result.ok) {
      reset(result.value);
      setStatus({ tone: 'good', text: `已保存：${changed.map(k => fieldLabels[k] ?? k).join('、')}。${resetsEvidence ? '配置变化后，历史验证不再对应当前配置；如更换了地址或 Key，模型目录已标记为过期，可重新发现。' : ''}` });
      return;
    }
    if (result.status === 409) { setReload(r => r + 1); setStatus({ tone: 'warn', text: `${result.outcome.text} 表单已重置为最新配置。` }); return; }
    setStatus(result.outcome);
  }

  const fields = new Set([...editable].filter(f => !['name', 'enabled', 'base_url', 'api_key'].includes(f)));
  const readOnly = !editable.size;
  return <><form className="form" noValidate onSubmit={event => {
    event.preventDefault();
    if (patch.enabled === false) setConfirmDisable(true); else void save();
  }}>
    {readOnly && <Notice tone="info">{can.connection_management ? '此连接没有可在页面修改的字段。' : why.connection_management} 以下为当前配置。</Notice>}
    <FormSection title="基本信息">
      <Field label="显示名称" error={errors.name}>{(fid, d) => <TextInput id={fid} value={name} aria-describedby={d} disabled={!editable.has('name')} maxLength={80} onChange={e => setName(e.target.value)} />}</Field>
      <Field label="供应商 / 类型">{(fid) => <TextInput id={fid} value={`${managed.provider} · ${label(managed.resource_type)}`} readOnly />}</Field>
      <div className="field field-wide"><ToggleRow label="启用连接" disabled={!editable.has('enabled')} checked={enabled} onChange={setEnabled}
        description="停用后不再接收新调用，历史记录、模型设置与应用权限保留。没有删除接口。" /></div>
      <Field label="接口地址" wide error={errors.base_url} hint={editable.has('base_url') ? '修改地址会使模型目录标记为过期。' : undefined}>{(fid, d) =>
        <TextInput id={fid} type="url" value={baseUrl} aria-describedby={d} disabled={!editable.has('base_url')} onChange={e => setBaseUrl(e.target.value.trim())} />}</Field>
    </FormSection>

    {(editable.has('api_key') || managed.resource_type !== 'chatgpt_subscription') && <FormSection title="凭据">
      <div className="field field-wide key-row">
        <div><p className="toggle-label">API Key</p><p className="toggle-desc">{managed.api_key_configured ? '已在本机配置。出于安全考虑不会显示，也不会以掩码回传。' : '尚未配置 Key。'}</p></div>
        <Pill tone={managed.api_key_configured ? 'good' : 'warn'}>{managed.api_key_configured ? '已配置' : '未配置'}</Pill>
        {editable.has('api_key') && !rotate && <Button size="sm" icon="key" onClick={() => setRotate(true)}>更换 Key</Button>}
      </div>
      {rotate && <Field label="新的 API Key" wide error={errors.api_key} hint="保存后立即替换旧 Key；模型目录会标记为过期。">{(fid, d) =>
        <div className="key-input"><TextInput id={fid} type="password" value={apiKey} autoComplete="new-password" aria-describedby={d} autoFocus onChange={e => setApiKey(e.target.value)} />
          <Button size="sm" variant="ghost" onClick={() => { setRotate(false); setApiKey(''); }}>取消</Button></div>}</Field>}
    </FormSection>}

    {fields.size > 0 && <FormSection title="高级设置"><AdvancedFields value={advanced} onChange={setAdvanced} fields={fields} provider={managed.provider} errors={adv} /></FormSection>}
    {managed.resource_type === 'chatgpt_subscription' && <Notice tone="info">ChatGPT 订阅的 OAuth 登录与退出仍需在终端完成。</Notice>}
    {status && <Notice tone={status.tone}>{status.text}</Notice>}
    {!readOnly && <div className="form-actions">
      <span className="form-dirty">{changed.length ? `${changed.length} 项修改：${changed.map(k => fieldLabels[k] ?? k).join('、')}` : '没有未保存的修改'}</span>
      <Button disabled={!changed.length || busy} onClick={() => reset(managed)}>还原</Button>
      <Button type="submit" variant="primary" disabled={!changed.length || invalid || busy || Boolean(saving)}>{busy ? '正在保存…' : '保存修改'}</Button>
    </div>}
    <p className="form-meta"><Tag mono>rev {managed.revision.slice(0, 8)}</Tag>目录 {label(managed.discovery.state)} · 检查于 {dateTime(managed.discovery.checked_at, '从未')}</p>
  </form>
    <ConfirmDialog open={confirmDisable} danger title="停用此连接？" confirmLabel="停用并保存"
      onCancel={() => setConfirmDisable(false)} onConfirm={() => { setConfirmDisable(false); void save(); }}>
      <p>停用后，所有应用都无法再通过 <b>{managed.name}</b> 发起新调用；已派发的请求继续完成。</p>
      <p>历史记录、模型启用状态与应用权限都会保留，可随时重新启用。</p>
    </ConfirmDialog>
  </>;
}
