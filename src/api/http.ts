import type { ApplicationPolicy, Backups, DashboardApi, Filters, Logs, ModelApproval, ModelApprovalResult, Policy, RecordQuery, RecordsPage, Snapshot } from './types';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const SESSION_KEY = 'selark-dashboard-session';

const POLICY_FIELDS = {
  allow_token_plans: true, allowed_connections: true, allowed_models: true,
  requests_per_minute: true, max_concurrent_requests: true, max_output_tokens: true,
  max_estimated_input_tokens: true, daily_token_limit: true, daily_budget: true, budget_currency: true,
} satisfies Record<keyof Policy, true>;

function currentPolicy(policy: ApplicationPolicy['policy'], patch = false): ApplicationPolicy['policy'] {
  const entries = Object.entries(policy);
  const current = entries.filter(([key, value]) => Object.hasOwn(POLICY_FIELDS, key) && value !== undefined);
  // A stale draft must never turn into an unrestricted create or an empty update.
  if (!current.length && (patch || entries.length)) {
    throw new ApiError(400, '策略已更新，请重新打开表单后提交。', 'empty_policy');
  }
  return Object.fromEntries(current);
}

function browserStorage(): SessionStorage | undefined {
  try { return globalThis.sessionStorage; } catch { return undefined; }
}

function query(filters: Filters | RecordQuery = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.size ? `?${params}` : '';
}

export function createHttpApi(options: { fetch?: typeof fetch; storage?: SessionStorage } = {}): DashboardApi {
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);
  const storage = options.storage ?? browserStorage();
  let session: string | null = null;
  let initializing: Promise<void> | undefined;
  try { session = storage?.getItem(SESSION_KEY) ?? null; } catch { /* Memory-only fallback. */ }

  function save(value: string | null) {
    session = value;
    try {
      if (value) storage?.setItem(SESSION_KEY, value);
      else storage?.removeItem(SESSION_KEY);
    } catch { /* Storage may be disabled. */ }
  }

  async function request<T>(path: string, signal?: AbortSignal, payload?: unknown, login = false, method = payload === undefined ? 'GET' : 'POST', timeout = 20000): Promise<T> {
    const headers: Record<string, string> = login ? {} : { 'X-Selark-Dashboard': '1', 'X-Selark-Session': session ?? '' };
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    const response = await send(`/api/${path}`, {
      method, headers,
      credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-store',
      body: payload === undefined ? undefined : JSON.stringify(payload), signal: signal ?? AbortSignal.timeout(timeout),
    });
    if (response.status === 401) save(null);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error : '本地数据暂时不可读。';
      const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : undefined;
      throw new ApiError(response.status, message, code);
    }
    if (!body || typeof body !== 'object') throw new ApiError(502, 'Dashboard 返回了无效数据。');
    return body as T;
  }

  return {
    kind: 'http',
    initialize(bootstrap) {
      // React StrictMode can mount twice; a one-use login link is exchanged only once.
      initializing ??= (async () => {
        if (bootstrap) {
          save(null);
          const response = await request<{ session_token: string }>('session', undefined, { token: bootstrap }, true);
          if (typeof response.session_token !== 'string' || !response.session_token) {
            throw new ApiError(401, '管理会话无效，请重新运行 selark dashboard。');
          }
          save(response.session_token);
        }
        if (!session) throw new ApiError(401, '请从终端打开 selark dashboard 的一次性管理链接。');
      })();
      return initializing;
    },
    clearSession() { save(null); },
    snapshot: (filters, signal) => request<Snapshot>(`snapshot${query(filters)}`, signal),
    records: (filters, signal) => request<RecordsPage>(`records${query(filters)}`, signal),
    logs: signal => request<Logs>('logs', signal),
    backups: signal => request<Backups>('backups', signal),
    setModelApproval: (change: ModelApproval, signal) => request<ModelApprovalResult>('model-approval', signal, change),
    getCapabilities: signal => request('capabilities', signal),
    getProviders: signal => request('providers', signal),
    getConnections: signal => request('connections', signal),
    getConnection: (id, signal) => request(`connections/${encodeURIComponent(id)}`, signal),
    createConnection: (input, signal) => request('connections', signal, input),
    updateConnection: (id, input, signal) => request(`connections/${encodeURIComponent(id)}`, signal, input, false, 'PATCH'),
    getConnectionModels: (id, signal) => request(`connections/${encodeURIComponent(id)}/models`, signal),
    discoverModels: (id, signal) => request(`connections/${encodeURIComponent(id)}/discover`, signal, {}, false, 'POST', 45000),
    approveModels: (id, input, signal) => request(`connections/${encodeURIComponent(id)}/models/approval`, signal, input),
    setDefaultModel: (id, input, signal) => request(`connections/${encodeURIComponent(id)}/models/default`, signal, input, false, 'PUT'),
    getApplications: signal => request('applications', signal),
    getApplication: (id, signal) => request(`applications/${encodeURIComponent(id)}`, signal),
    createApplication: async (input, signal) => request('applications', signal, {
      name: input.name, ...(input.policy === undefined ? {} : { policy: currentPolicy(input.policy) }),
    }),
    updateApplicationPolicy: async (id, input, signal) => request(`applications/${encodeURIComponent(id)}/policy`, signal, {
      revision: input.revision, policy: currentPolicy(input.policy, true),
    }, false, 'PATCH'),
    revokeApplication: (id, input, signal) => request(`applications/${encodeURIComponent(id)}/revoke`, signal, input),
    getApplicationQuota: (id, signal) => request(`applications/${encodeURIComponent(id)}/quota`, signal),
  };
}
