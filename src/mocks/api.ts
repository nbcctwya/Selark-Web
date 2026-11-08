/** Development only: fixture-backed interactions, never provider or Selark requests. */
import { ApiError } from '../api/http';
import type { Application, Backups, Connection, DashboardApi, Filters, Logs, ModelApproval, RecordQuery, RequestRecord, Snapshot, Usage, UsageSummary } from '../api/types';
import fixtureData from './fixture.json';
import { createManagement, type ManagementFixture } from './management';

export const scenarios = {
  normal: '正常数据', empty: '空数据', unknown: '未知用量', offline: '网关离线',
  readonly: '只读模式', expired: '会话过期', error: '读取失败', partial: '部分数据不可读',
  conflict: '修改冲突', slow: '慢速加载', 'offline-mode': '离线模式', 'discovery-error': '发现失败',
} as const;
export type Scenario = keyof typeof scenarios;
interface Fixture {
  fixture_only: boolean;
  management: ManagementFixture;
  reference_time: string;
  snapshot: Snapshot;
  records: RequestRecord[];
  accounting: Record<string, { quota_tokens: number; token_basis: string }>;
  logs: Logs;
  backups: Backups;
}
const fixture = fixtureData as unknown as Fixture;

function shiftDates<T>(source: T, delta: number): T {
  return JSON.parse(JSON.stringify(source, (_key, value: unknown) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:/.test(value) && Number.isFinite(Date.parse(value))
      ? new Date(Date.parse(value) + delta).toISOString() : value)) as T;
}

function addMoney(values: string[]): string {
  const sum = values.reduce((total, value) => {
    const [whole, fraction = ''] = value.split('.');
    return total + BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'));
  }, 0n);
  return `${sum / 1_000_000_000n}.${String(sum % 1_000_000_000n).padStart(9, '0')}`;
}

export function createMockApi(options: { scenario?: Scenario; delayMs?: number; now?: Date } = {}): DashboardApi {
  const scenario = options.scenario ?? 'normal';
  const now = options.now ?? new Date();
  const content = shiftDates(fixture, now.getTime() - Date.parse(fixture.reference_time));
  const state = content.snapshot;
  let rows = content.records;
  let authenticated = false;
  state.checked_at = now.toISOString();
  state.capabilities.model_approval = scenario !== 'readonly';
  state.service = scenario === 'offline' ? { state: 'unreachable_or_invalid', reachable: false, capacity: {}, storage: {} }
    : { state: 'running', reachable: true, version: state.version, version_matches: true, pid: 12345,
      capacity: { active: 2, queued: 1, admitted: 3, max_active: 4, max_queued: 16, accepting: true },
      storage: { degraded: false, pending_records: 0, invalid_records: 0, accepting: true } };
  if (scenario === 'offline-mode') state.service = { state: 'not_checked', reachable: null };
  for (const app of state.applications) app.quota.day = now.toISOString().slice(0, 10);
  if (scenario === 'empty') {
    state.connections = []; state.applications = []; rows = [];
    state.options = { models: [], connections: [] };
    content.logs.items = []; content.backups.items = []; content.backups.total = 0;
  }
  if (scenario === 'unknown') {
    rows.forEach(row => {
      row.prompt_tokens = row.completion_tokens = row.total_tokens = null;
      row.usage_known = false; row.usage_final = false;
      row.cost.estimated_cost = null; row.cost.cost_status = 'unknown'; row.cost.token_basis = 'unknown_hold';
      content.accounting[row.request_id].token_basis = 'unknown_hold';
    });
    for (const app of state.applications) {
      app.policy.daily_token_limit = 500000;
      app.quota.policy = structuredClone(app.policy);
      app.quota.remaining_tokens = null;
      app.quota.token_quota_state = 'blocked_unknown_usage';
      app.quota.unknown_token_requests = Math.max(1, app.quota.requests);
    }
  }

  async function wait(signal?: AbortSignal) {
    signal?.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, options.delayMs ?? (scenario === 'slow' ? 1800 : 180));
      signal?.addEventListener('abort', abort, { once: true });
    });
    if (!authenticated || scenario === 'expired') throw new ApiError(401, '管理会话失效，请重新运行 selark dashboard。');
    if (scenario === 'error') throw new ApiError(503, '本地数据暂时不可读。');
  }

  function window(filters: Filters = {}) {
    const period = filters.period ?? '7d';
    const days = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };
    const until = period === 'custom' ? new Date(filters.until ?? '') : now;
    const since = period === 'custom' ? new Date(filters.since ?? '') : new Date(now.getTime() - days[period] * 86400000);
    if (!Number.isFinite(since.getTime()) || !Number.isFinite(until.getTime()) || since >= until || until.getTime() - since.getTime() > 366 * 86400000) {
      throw new ApiError(400, '筛选无效；时间范围须大于零且不超过 366 天。');
    }
    const selected = rows.filter(row => {
      const date = Date.parse(row.started_at ?? '');
      return date >= since.getTime() && date < until.getTime()
        && (!filters.caller_id || row.caller_id === filters.caller_id)
        && (!filters.connection_id || row.connection_id === filters.connection_id)
        && (!filters.model || row.model === filters.model);
    });
    return { since, until, selected };
  }

  function summary(selected: RequestRecord[]): UsageSummary {
    const statuses: Record<string, number> = {};
    for (const row of selected) statuses[row.status] = (statuses[row.status] ?? 0) + 1;
    const tokens = (key: 'prompt_tokens' | 'completion_tokens' | 'total_tokens') => {
      const known = selected.flatMap(row => row[key] == null ? [] : [row[key]]);
      return known.length ? known.reduce((a, b) => a + b, 0) : null;
    };
    const costs: Record<string, string> = {};
    const currencies = new Set(selected.flatMap(row => row.cost.estimated_cost != null && row.cost.currency ? [row.cost.currency] : []));
    for (const currency of currencies) costs[currency] = addMoney(selected.flatMap(row => row.cost.currency === currency && row.cost.estimated_cost != null ? [row.cost.estimated_cost] : []));
    const completed = selected.filter(row => ['success', 'failed', 'cancelled', 'interrupted'].includes(row.status));
    const latencies = completed.flatMap(row => row.duration_ms == null ? [] : [row.duration_ms]);
    const bases: Record<string, number> = {};
    for (const row of selected) {
      const allocation = content.accounting[row.request_id];
      if (allocation) bases[allocation.token_basis] = (bases[allocation.token_basis] ?? 0) + allocation.quota_tokens;
    }
    return {
      requests: selected.length,
      known_usage_requests: selected.filter(r => r.usage_known).length,
      missing_usage_requests: selected.filter(r => !r.usage_known).length,
      local_rejected_requests: selected.filter(r => r.upstream_attempts === 0).length,
      unknown_consumption_requests: selected.filter(r => !r.usage_known && r.upstream_attempts !== 0).length,
      in_flight_requests: statuses.running ?? 0,
      reported_usage_requests: selected.filter(r => r.prompt_tokens != null || r.completion_tokens != null || r.total_tokens != null).length,
      upstream_attempts: selected.reduce((sum, r) => sum + (r.upstream_attempts ?? 0), 0),
      unknown_attempt_count_requests: selected.filter(r => r.upstream_attempts == null).length,
      unknown_time_requests: 0, status_counts: statuses,
      known_tokens: { prompt_tokens: tokens('prompt_tokens'), completion_tokens: tokens('completion_tokens'), total_tokens: tokens('total_tokens') },
      missing_field_requests: Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens'].map(k => [k, selected.filter(r => r[k as 'total_tokens'] == null).length])),
      estimated_cost_by_currency: costs,
      unknown_cost_requests: selected.filter(r => r.cost.estimated_cost == null).length,
      billed_cost: null,
      resource_accounting: { scope: 'Selark 0.5+ admissions', requests: selected.length, tokens_by_basis: bases },
      completed_requests: completed.length,
      success_rate: completed.length ? (statuses.success ?? 0) / completed.length : null,
      average_latency_ms: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null,
      latency_samples: latencies.length,
    };
  }

  function usage(filters: Filters): Usage {
    const { since, until, selected } = window(filters);
    const trend = [];
    for (let day = Date.parse(`${since.toISOString().slice(0, 10)}T00:00:00Z`); day < until.getTime(); day += 86400000) {
      const key = new Date(day).toISOString().slice(0, 10);
      const point = summary(selected.filter(r => r.started_at?.slice(0, 10) === key));
      trend.push({ ...point, day: key, success_rate: point.success_rate ?? null, average_latency_ms: point.average_latency_ms ?? null });
    }
    const models = [...new Set(selected.map(row => `${row.connection_id}::${row.model}`))].map(key => {
      const [connection_id, model] = key.split('::');
      return { ...summary(selected.filter(r => r.connection_id === connection_id && r.model === model)), connection_id, model };
    }).sort((a, b) => b.requests - a.requests).slice(0, 10);
    const { period: _period, ...selection } = filters;
    return { timezone: 'UTC', group_by: 'day', filters: { ...selection, since: since.toISOString(), until: until.toISOString() }, summary: summary(selected), trend, models, unknown_time_excluded: 0 };
  }

  function permitted(app: Application, connection: Connection, model: string) {
    const p = app.policy;
    if (connection.resource_type === 'token_plan') {
      if (!p.allowed_connections?.includes(connection.id)) return false;
      if (!p.allow_token_plans) return false;
    }
    return (p.allowed_connections == null || p.allowed_connections.includes(connection.id))
      && (p.allowed_models == null || p.allowed_models.includes(`${connection.id}::${model}`));
  }

  function reconcile() {
    for (const connection of state.connections) {
      const models = connection.model_catalog.models;
      for (const model of models) {
        model.authorized_applications = state.applications.filter(app => app.active && permitted(app, connection, model.id)).map(app => app.id);
        model.effective_applications = connection.enabled && model.approved ? [...model.authorized_applications] : [];
      }
      connection.models = models.filter(m => m.approved).map(m => m.id);
      connection.client_allowed_models = models.filter(m => m.effective_applications.includes('legacy')).map(m => m.id);
      connection.model_catalog.counts.approved = connection.models.length;
      connection.model_catalog.counts.application_authorized = models.filter(m => m.effective_applications.length > 0).length;
    }
    for (const app of state.applications) {
      app.effective_resources = state.connections.flatMap(connection => {
        const models = connection.model_catalog.models.filter(m => m.effective_applications.includes(app.id)).map(m => m.id);
        return models.length ? [{ id: connection.id, name: connection.name, resource_type: connection.resource_type, models }] : [];
      });
    }
  }

  const management = createManagement({ state, data: content.management, scenario, now, wait, reconcile });

  return {
    ...management,
    kind: 'mock',
    async initialize() { authenticated = true; },
    clearSession() { authenticated = false; },
    async snapshot(filters = {}, signal) {
      await wait(signal);
      const result = structuredClone(state);
      result.usage = scenario === 'partial' ? null : usage(filters);
      if (scenario === 'partial') { result.ok = false; result.issues = ['用量账本暂不可读；连接和应用仍可查看。']; }
      return result;
    },
    async records(filters: RecordQuery = {}, signal) {
      await wait(signal);
      if (scenario === 'partial') throw new ApiError(503, '调用记录暂不可读。');
      let { selected } = window(filters);
      if (filters.errors) selected = selected.filter(row => ['failed', 'cancelled', 'interrupted'].includes(row.status));
      selected.sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? '') || b.request_id.localeCompare(a.request_id));
      const offset = filters.offset ?? 0;
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000000) throw new ApiError(400, '分页偏移无效。');
      return structuredClone({ items: selected.slice(offset, offset + 25), total: selected.length, offset, limit: 25 });
    },
    async logs(signal) { await wait(signal); return structuredClone(content.logs); },
    async backups(signal) { await wait(signal); return structuredClone(content.backups); },
    async setModelApproval(change: ModelApproval, signal) {
      const result = await management.approveModels(change.connection_id, {
        revision: change.revision, enabled: change.enabled, models: [change.model], clear_default: change.clear_default,
      }, signal);
      return { connection_id: result.connection_id, model: change.model, enabled: result.models.some(m => m.id === change.model && m.approved), default_model: result.default_model };
    },
  };
}
