import type { Backups, DashboardApi, Filters, Logs, ModelApproval, ModelApprovalResult, RecordQuery, RecordsPage, Snapshot } from './types';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const SESSION_KEY = 'selark-dashboard-session';

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

  async function request<T>(path: string, signal?: AbortSignal, payload?: unknown, login = false): Promise<T> {
    const headers: Record<string, string> = login ? {} : { 'X-Selark-Dashboard': '1', 'X-Selark-Session': session ?? '' };
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    const response = await send(`/api/${path}`, {
      method: payload === undefined ? 'GET' : 'POST', headers,
      credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-store',
      body: payload === undefined ? undefined : JSON.stringify(payload), signal: signal ?? AbortSignal.timeout(20000),
    });
    if (response.status === 401) save(null);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error : '本地数据暂时不可读。';
      throw new ApiError(response.status, message);
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
  };
}
