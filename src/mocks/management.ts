/** In-memory management workflow. Never stores submitted credentials or calls providers. */
import { ApiError } from '../api/http';
import type { ApplicationQuota, Capabilities, Connection, DashboardApi, ManagedApplication, ManagedConnection, ManagedModels, Policy, Provider, Snapshot } from '../api/types';
import specification from '../../contracts/dashboard.openapi.json';
import { input } from './contract';

export interface ManagementFixture {
  capabilities: Capabilities;
  providers: Provider[];
  connections: ManagedConnection[];
  models: Record<string, ManagedModels>;
  applications: ManagedApplication[];
  quotas: Record<string, ApplicationQuota>;
}
type ManagementApi = Pick<DashboardApi, 'getCapabilities' | 'getProviders' | 'getConnections' | 'getConnection' | 'createConnection' | 'updateConnection' | 'getConnectionModels' | 'discoverModels' | 'approveModels' | 'setDefaultModel' | 'getApplications' | 'getApplication' | 'createApplication' | 'updateApplicationPolicy' | 'revokeApplication' | 'getApplicationQuota'>;
const clone = <T>(value: T): T => structuredClone(value);
const defaultPolicy = Object.fromEntries(Object.entries(specification.components.schemas.Policy.properties).map(([name, schema]) => [name, schema.default])) as Policy;
const modelId = /^[A-Za-z0-9][A-Za-z0-9_.:/@+-]{0,199}$/;

function fail(status: number, code: string, message: string): never { throw new ApiError(status, message, code); }
function validModel(value: string) { return modelId.test(value) && !value.includes('::'); }
function validatePolicy(policy: Policy) {
  if (policy.daily_budget !== null && (!/^\d{1,10}(?:\.\d{1,9})?$/.test(policy.daily_budget) || Number(policy.daily_budget) > 1e9)) fail(400, 'invalid_request', '预算须为非负十进制字符串。');
  if (policy.allowed_connections?.some(id => !/^[a-z][a-z0-9_-]{0,63}$/.test(id)) || policy.allowed_models?.some(id => {
    const parts = id.split('::');
    return parts.length !== 2 || !/^[a-z][a-z0-9_-]{0,63}$/.test(parts[0]) || !validModel(parts[1]);
  })) fail(400, 'invalid_request', '权限列表中的标识无效。');
}
function validateUrl(value: string) {
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) throw new Error();
  } catch { fail(400, 'invalid_configuration', '连接地址无效。'); }
}

export function createManagement(options: {
  state: Snapshot; data: ManagementFixture; scenario: string; now: Date;
  wait: (signal?: AbortSignal) => Promise<void>; reconcile: () => void;
}): ManagementApi {
  const { state, data, scenario, now, wait, reconcile } = options;
  let serial = 100;
  let conflictPending = scenario === 'conflict';
  let discovering = false;
  const revision = () => (++serial).toString(16).padStart(64, '0');
  const capabilities: Capabilities = {
    connection_management: scenario !== 'readonly', model_approval: scenario !== 'readonly',
    model_discovery: !['readonly', 'offline-mode'].includes(scenario), application_management: scenario !== 'readonly',
  };
  if (scenario === 'empty') { data.connections = []; data.applications = []; data.models = {}; data.quotas = {}; }
  for (const app of state.applications) {
    const managed = data.applications.find(item => item.id === app.id);
    if (managed) managed.policy = clone(app.policy);
    data.quotas[app.id] = { id: app.id, ...clone(app.quota) };
  }
  const connection = (id: string) => data.connections.find(item => item.id === id) ?? fail(404, 'connection_not_found', '未找到连接。');
  const application = (id: string) => data.applications.find(item => item.id === id) ?? fail(404, 'application_not_found', '未找到应用。');

  async function write<T>(schema: string, value: T, signal?: AbortSignal) {
    await wait(signal);
    if (scenario === 'readonly') fail(405, 'operation_disabled', '此 Dashboard 为只读模式。');
    return input(schema, value);
  }
  function checkRevision(item: ManagedConnection | ManagedApplication, expected: string, code: string) {
    if (conflictPending) { item.revision = revision(); conflictPending = false; }
    if (expected !== item.revision) fail(409, code, '数据已被其他操作修改，请刷新后重新确认。');
  }
  function checkModels(item: ManagedConnection, expected: number) {
    if (conflictPending) {
      item.approval_revision++; item.revision = revision(); conflictPending = false; syncConnection(item);
    }
    if (expected !== item.approval_revision) fail(409, 'model_approval_changed', '模型设置已改变，请刷新后重新确认。');
  }
  function emptyModels(item: ManagedConnection): ManagedModels {
    return { connection_id: item.id, connection_enabled: item.enabled, approval_revision: item.approval_revision,
      default_model: null, protocol: item.provider === 'anthropic' ? 'anthropic-messages' : item.provider === 'chatgpt' ? 'responses' : 'chat-completions',
      discovery: clone(item.discovery), models: [], counts: { discovered: 0, approved: 0, application_authorized: 0, historically_verified: 0 }, live_availability: 'unknown' };
  }
  function syncConnection(item: ManagedConnection) {
    const details = data.models[item.id] ??= emptyModels(item);
    details.connection_enabled = item.enabled; details.approval_revision = item.approval_revision;
    details.default_model = item.default_model; details.discovery = clone(item.discovery);
    const previous = new Map(details.models.map(model => [model.id, model]));
    details.models = [...new Set([...item.discovery.models, ...item.allowed_models])].map(id => ({
      id, discovery: item.discovery.models.includes(id) ? 'listed' : item.discovery.current && item.discovery.state === 'success' ? 'not_in_catalog' : 'unknown',
      approved: item.allowed_models.includes(id), default: item.default_model === id,
      authorized_applications: [], effective_applications: [], verification: previous.get(id)?.verification ?? [],
      verified_capabilities: previous.get(id)?.verified_capabilities ?? [], live_availability: 'unknown',
    }));
    let view = state.connections.find(c => c.id === item.id);
    if (!view) {
      view = { id: item.id, name: item.name, provider: item.provider, resource_type: item.resource_type,
        enabled: item.enabled, models: [], default_model: null, client_allowed_models: [],
        authorization: { kind: 'api_key', credential_configured: item.api_key_configured, remote_validity: 'unknown' },
        verification: { state: 'never' }, availability: { state: 'unknown', checked_live: false, blockers: [] },
        discovery: { state: 'never', checked_at: null, discovered_at: null, current: false, count: 0 },
        model_catalog: { counts: details.counts, protocol: details.protocol, approval_revision: item.approval_revision, models: [] },
        provider_quota: { state: 'unknown', windows: [], reported_counters: [] } } satisfies Connection;
      state.connections.push(view);
    }
    view.name = item.name; view.enabled = item.enabled; view.default_model = item.default_model;
    view.discovery = { state: item.discovery.state, checked_at: item.discovery.checked_at, discovered_at: item.discovery.discovered_at, current: item.discovery.current, count: item.discovery.count };
    view.model_catalog.models = details.models; view.model_catalog.approval_revision = item.approval_revision;
    view.model_catalog.counts.discovered = item.discovery.models.length;
    view.model_catalog.counts.historically_verified = details.models.filter(model => model.verified_capabilities.length > 0).length;
    view.authorization.credential_configured = item.api_key_configured;
    if (!item.enabled) view.availability = { state: 'disabled', checked_live: false, blockers: ['connection_disabled'] };
    else view.availability = { state: 'unknown', checked_live: false, blockers: [] };
    reconcile(); details.counts = clone(view.model_catalog.counts);
  }
  function syncApplication(item: ManagedApplication) {
    const quota = data.quotas[item.id];
    quota.policy = clone(item.policy);
    quota.remaining_tokens = item.policy.daily_token_limit === null || quota.unknown_token_requests > 0 ? null : Math.max(0, item.policy.daily_token_limit - quota.charged_or_reserved_tokens);
    quota.token_quota_state = item.policy.daily_token_limit === null ? 'unlimited' : quota.unknown_token_requests > 0 ? 'blocked_unknown_usage' : quota.remaining_tokens === 0 ? 'exhausted' : 'limited';
    let view = state.applications.find(app => app.id === item.id);
    if (!view) {
      view = { id: item.id, name: item.name, created_at: item.created_at, revoked_at: item.revoked_at, active: item.active, policy: clone(item.policy), quota: clone(quota), effective_resources: [] };
      state.applications.push(view);
    }
    view.active = item.active; view.revoked_at = item.revoked_at; view.policy = clone(item.policy);
    const { id: _id, ...publicQuota } = quota;
    view.quota = clone(publicQuota);
    reconcile();
    for (const c of data.connections) {
      const projection = state.connections.find(view => view.id === c.id)!;
      data.models[c.id].counts = clone(projection.model_catalog.counts);
    }
  }
  for (const item of data.connections) syncConnection(item);

  return {
    async getCapabilities(signal) { await wait(signal); return clone(capabilities); },
    async getProviders(signal) { await wait(signal); return { items: clone(data.providers) }; },
    async getConnections(signal) { await wait(signal); return { items: clone(data.connections) }; },
    async getConnection(id, signal) { await wait(signal); return clone(connection(id)); },
    async createConnection(value, signal) {
      const body = await write('ConnectionCreate', value, signal);
      if (body.id === 'mimo-default' || data.connections.some(c => c.id === body.id)) fail(409, 'connection_exists', '连接 ID 已存在。');
      const provider = data.providers.find(p => p.id === body.provider);
      if (!provider?.can_create) fail(400, 'invalid_request', '该供应商需要通过 CLI 授权。');
      const url = body.base_url ?? provider.base_url;
      if (!url || data.connections.length >= 32) fail(400, 'invalid_configuration', '连接配置无效或已达到数量上限。');
      validateUrl(url);
      if (!/^[\x21-\x7e]+$/.test(body.api_key)) fail(400, 'invalid_configuration', 'Key 格式无效。');
      const item: ManagedConnection = { id: body.id, provider: provider.id, resource_type: provider.resource_type,
        name: body.name ?? provider.name, base_url: url.replace(/\/$/, ''), enabled: true, api_key_configured: true,
        timeout_seconds: body.timeout_seconds ?? 60, stream_usage: body.stream_usage ?? true, token_parameter: body.token_parameter ?? 'max_tokens',
        workspace_id: body.workspace_id ?? null, anthropic_version: body.anthropic_version ?? '2026-10-21',
        plan: provider.resource_type === 'token_plan' ? { tier: null, use: 'personal_interactive_coding', reasoning_effort: 'low', extra_usage_policy: 'forbid', ...body.plan } : null,
        allowed_models: [], default_model: null, revision: revision(), approval_revision: 1,
        editable_fields: ['name', 'enabled', 'base_url', 'api_key', 'timeout_seconds', 'stream_usage', 'token_parameter', 'workspace_id', 'anthropic_version', ...(provider.resource_type === 'token_plan' ? ['plan'] : [])],
        discovery: { state: 'never', checked_at: null, discovered_at: null, current: false, count: 0, models: [], error_code: null } };
      data.connections.push(item); syncConnection(item); return clone(item);
    },
    async updateConnection(id, value, signal) {
      const body = await write('ConnectionPatch', value, signal);
      const item = connection(id); const fields = Object.keys(body).filter(k => k !== 'revision');
      if (fields.some(field => !item.editable_fields.includes(field))) fail(400, 'unsupported_field', '该连接不支持修改所提供的字段。');
      checkRevision(item, body.revision, 'connection_changed');
      if (body.base_url !== undefined) validateUrl(body.base_url);
      if (body.api_key !== undefined && !/^[\x21-\x7e]+$/.test(body.api_key)) fail(400, 'invalid_configuration', 'Key 格式无效。');
      const { api_key, revision: _revision, ...changes } = body;
      const changed = api_key !== undefined || Object.entries(changes).some(([key, value]) => JSON.stringify(item[key as keyof ManagedConnection]) !== JSON.stringify(value));
      const configChanged = api_key !== undefined || Object.entries(changes).some(([key, value]) => !['name', 'enabled'].includes(key) && JSON.stringify(item[key as keyof ManagedConnection]) !== JSON.stringify(value));
      Object.assign(item, changes);
      if (api_key !== undefined) item.api_key_configured = true;
      if (changed) item.revision = revision();
      if (configChanged) {
        item.approval_revision++;
        for (const model of data.models[id].models) {
          model.verified_capabilities = [];
          model.verification = model.verification.map(evidence => ({ ...evidence, state: evidence.scope === 'legacy_unknown' ? 'unscoped' : 'stale', current_configuration: false }));
        }
      }
      if ((body.base_url !== undefined || api_key !== undefined) && item.discovery.state !== 'never') { item.discovery.state = 'stale'; item.discovery.current = false; }
      syncConnection(item); return clone(item);
    },
    async getConnectionModels(id, signal) { await wait(signal); connection(id); return clone(data.models[id]); },
    async discoverModels(id, signal) {
      if (discovering) { await wait(signal); fail(409, 'discovery_busy', '已有模型发现正在进行。'); }
      discovering = true;
      try {
        await write('EmptyRequest', {}, signal);
        if (!capabilities.model_discovery) fail(405, 'operation_disabled', '当前启动模式不允许模型发现。');
        const item = connection(id); const checked = now.toISOString();
        if (scenario === 'discovery-error') { item.discovery.state = 'failure'; item.discovery.checked_at = checked; item.discovery.error_code = 'upstream_unavailable'; }
        else {
          const models = item.discovery.models.length ? item.discovery.models : item.allowed_models.length ? item.allowed_models : ['demo-text', 'demo-text-small'];
          item.discovery = { state: 'success', current: true, checked_at: checked, discovered_at: checked, error_code: null, models: clone(models), count: models.length };
        }
        syncConnection(item); return clone(data.models[id]);
      } finally { discovering = false; }
    },
    async approveModels(id, value, signal) {
      const body = await write('ModelApproval', value, signal); const item = connection(id);
      checkModels(item, body.revision);
      if (body.enabled && body.all_models && (item.discovery.state !== 'success' || !item.discovery.current)) fail(400, 'invalid_configuration', '请先成功发现当前连接的模型目录。');
      const selected = body.all_models ? body.enabled ? item.discovery.models : item.allowed_models : body.models ?? [];
      if (selected.some(model => !validModel(model))) fail(400, 'invalid_request', '模型标识无效。');
      const approved = body.enabled ? [...new Set([...item.allowed_models, ...selected])] : item.allowed_models.filter(model => !selected.includes(model));
      if (item.default_model !== null && !approved.includes(item.default_model) && !body.clear_default) fail(409, 'default_model_confirmation', '禁用默认模型需要确认清除默认值。');
      if (JSON.stringify(approved) !== JSON.stringify(item.allowed_models)) { item.approval_revision++; item.revision = revision(); }
      item.allowed_models = approved;
      if (item.default_model !== null && !approved.includes(item.default_model)) item.default_model = null;
      syncConnection(item); return clone(data.models[id]);
    },
    async setDefaultModel(id, value, signal) {
      const body = await write('DefaultModel', value, signal); const item = connection(id);
      checkModels(item, body.revision);
      if (body.model !== null && (!validModel(body.model) || !item.allowed_models.includes(body.model))) fail(400, 'invalid_configuration', '默认模型必须已启用。');
      if (body.model !== item.default_model) { item.default_model = body.model; item.approval_revision++; item.revision = revision(); }
      syncConnection(item); return clone(data.models[id]);
    },
    async getApplications(signal) { await wait(signal); return { items: clone(data.applications) }; },
    async getApplication(id, signal) { await wait(signal); return clone(application(id)); },
    async createApplication(value, signal) {
      const body = await write('ApplicationCreate', value, signal); const policy: Policy = { ...clone(defaultPolicy), ...body.policy };
      validatePolicy(policy);
      if (!body.name.trim()) fail(400, 'invalid_configuration', '应用名称不能为空。');
      const item: ManagedApplication = { id: `demo-created-${++serial}`, name: body.name, created_at: now.toISOString(), revoked_at: null, active: true, policy, revision: revision() };
      data.applications.push(item);
      data.quotas[item.id] = { id: item.id, day: now.toISOString().slice(0, 10), timezone: 'UTC', policy: clone(policy), requests: 0,
        in_flight_requests: 0, uncertain_requests: 0, remaining_tokens: null, token_quota_state: 'unlimited', historical_requests_excluded: 0,
        charged_or_reserved_tokens: 0, unknown_token_requests: 0, estimated_reserved_tokens: 0, estimated_cost_or_reservation: {}, unknown_cost_requests: 0, billed_cost: null,
        scope: 'Selark 0.5+ admissions; historical usage remains in usage queries' };
      syncApplication(item);
      // Synthetic value exists only in this return value, never in stored mock state.
      return { ...clone(item), token: `demo-only-not-a-real-token-${item.id}` };
    },
    async updateApplicationPolicy(id, value, signal) {
      const body = await write('ApplicationPolicy', value, signal); const item = application(id);
      checkRevision(item, body.revision, 'application_changed');
      const policy = { ...item.policy, ...body.policy }; validatePolicy(policy);
      if (JSON.stringify(policy) !== JSON.stringify(item.policy)) { item.policy = policy; item.revision = revision(); }
      syncApplication(item); return clone(item);
    },
    async revokeApplication(id, value, signal) {
      const body = await write('ApplicationRevoke', value, signal); const item = application(id);
      checkRevision(item, body.revision, 'application_changed');
      if (item.active) { item.active = false; item.revoked_at = now.toISOString(); item.revision = revision(); }
      syncApplication(item); return { ...clone(item), in_flight_policy: 'already_admitted_requests_continue' };
    },
    async getApplicationQuota(id, signal) { await wait(signal); application(id); return clone(data.quotas[id]); },
  };
}
