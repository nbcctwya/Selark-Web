import { describe, expect, it, vi } from 'vitest';
import { ApiError, createHttpApi } from './http';
import specification from '../../contracts/dashboard.openapi.json';
import { conforms } from '../mocks/contract';
import type { ApplicationCreate, ApplicationPolicy } from './types';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

describe('real HTTP adapter', () => {
  it('maps all management methods to documented routes and sends PATCH, PUT, revisions and error codes', async () => {
    const saved = storage(); saved.setItem('selark-dashboard-session', 'fixture-session');
    const send = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{}'));
    const api = createHttpApi({ fetch: send, storage: saved });
    const version = 'a'.repeat(64);
    const operations: [string, unknown[]][] = [
      ['getCapabilities', []], ['getProviders', []], ['getConnections', []], ['getConnection', ['sample']],
      ['createConnection', [{ id: 'sample', provider: 'openai', api_key: 'fixture-key' }]],
      ['updateConnection', ['sample', { revision: version, enabled: false }]],
      ['getConnectionModels', ['sample']], ['discoverModels', ['sample']],
      ['approveModels', ['sample', { revision: 1, enabled: true, models: ['demo'] }]],
      ['setDefaultModel', ['sample', { revision: 1, model: null }]],
      ['getApplications', []], ['getApplication', ['sample']], ['createApplication', [{ name: 'Editor' }]],
      ['updateApplicationPolicy', ['sample', { revision: version, policy: { allowed_models: [] } }]],
      ['revokeApplication', ['sample', { revision: version }]], ['getApplicationQuota', ['sample']],
    ];
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    try {
      for (const [name, args] of operations) {
        await (api as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[name](...args);
        const [url, options] = send.mock.calls.at(-1)!;
        const path = String(url).replace('/sample', '/{identity}');
        const route = specification.paths[path as keyof typeof specification.paths];
        const operation = (route as Record<string, { operationId: string; requestBody?: { content: { 'application/json': { schema: { $ref: string } } } } }>)[options!.method!.toLowerCase()];
        expect(operation.operationId).toBe(name);
        if (operation.requestBody) expect(conforms(operation.requestBody.content['application/json'].schema.$ref.split('/').at(-1)!, JSON.parse(String(options!.body)))).toBe(true);
      }
      expect(timeout).toHaveBeenCalledWith(45000);
    } finally { timeout.mockRestore(); }
    expect(send).toHaveBeenCalledTimes(16);
    await api.getApplication('a/b?x=1');
    expect(send.mock.calls.at(-1)![0]).toBe('/api/applications/a%2Fb%3Fx%3D1');
    send.mockResolvedValue(new Response(JSON.stringify({ error: 'Refresh', code: 'connection_changed' }), { status: 409 }));
    await expect(api.updateConnection('sample', { revision: version, name: 'Edited' })).rejects.toMatchObject({ status: 409, code: 'connection_changed' });
    expect(send).toHaveBeenCalledTimes(18);
  });

  it('exchanges a one-use link once even under concurrent React initialization', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ session_token: 'fixture-admin-session', authenticated: true, expires_in: 28800 })));
    const saved = storage();
    const api = createHttpApi({ fetch: send, storage: saved });
    await Promise.all([api.initialize('fixture-login'), api.initialize('fixture-login')]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual(['/api/session', expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'fixture-login' }), credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-store' })]);
    expect(saved.getItem('selark-dashboard-session')).toBe('fixture-admin-session');
  });

  it.each(['http', 'desktop'] as const)('sends current policy fields over %s without changing restrictions or accepting an empty stale draft', async mode => {
    const send = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{}'));
    const api = createHttpApi({ fetch: send, storage: storage(), ...(mode === 'desktop' ? { transport: async (path, method, payload, signal) => {
      await send(path, { method, body: JSON.stringify(payload), signal });
      return { status: 200, body: {} };
    } } : {}) });
    const controller = new AbortController();
    const policy = {
      allow_token_plans: false, allowed_connections: [], allowed_models: null,
      requests_per_minute: 12, max_concurrent_requests: 2, max_output_tokens: 256,
      max_estimated_input_tokens: 4096, daily_token_limit: 10000, daily_budget: '0.00', budget_currency: 'USD',
    };
    expect(Object.keys(policy).sort()).toEqual(Object.keys(specification.components.schemas.Policy.properties).sort());
    const draft = { ...policy, retired_option: false, retired_limit: null };
    const original = structuredClone(draft);
    await api.createApplication({ name: 'Editor', policy: draft }, controller.signal);
    expect(JSON.parse(String(send.mock.calls.at(-1)![1]!.body))).toEqual({ name: 'Editor', policy });
    await api.updateApplicationPolicy('sample', { revision: 'a'.repeat(64), policy: draft }, controller.signal);
    expect(JSON.parse(String(send.mock.calls.at(-1)![1]!.body))).toEqual({ revision: 'a'.repeat(64), policy });
    expect(send.mock.calls.at(-1)![1]!.signal).toBe(controller.signal);
    expect(draft).toEqual(original);
    await api.updateApplicationPolicy('sample', { revision: 'b'.repeat(64), policy: { allowed_models: [] } });
    expect(JSON.parse(String(send.mock.calls.at(-1)![1]!.body))).toEqual({ revision: 'b'.repeat(64), policy: { allowed_models: [] } });
    await expect(api.createApplication({ name: 'Editor', policy: { retired_option: true } } as ApplicationCreate)).rejects.toMatchObject({ code: 'empty_policy' });
    await expect(api.updateApplicationPolicy('sample', { revision: 'c'.repeat(64), policy: { retired_limit: null } } as ApplicationPolicy)).rejects.toMatchObject({ code: 'empty_policy' });
    await expect(api.updateApplicationPolicy('sample', { revision: 'c'.repeat(64), policy: {} })).rejects.toMatchObject({ code: 'empty_policy' });
    await expect(api.createApplication({ name: 'Editor', policy: { allowed_models: undefined, retired_option: true } } as ApplicationCreate)).rejects.toMatchObject({ code: 'empty_policy' });
    expect(send).toHaveBeenCalledTimes(3);
    await api.createApplication({ name: 'Default' });
    expect(JSON.parse(String(send.mock.calls.at(-1)![1]!.body))).toEqual({ name: 'Default' });
  });

  it('keeps requests relative, sends explicit session headers, and encodes query values', async () => {
    const saved = storage(); saved.setItem('selark-dashboard-session', 'fixture-existing-session');
    const send = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{}'));
    const api = createHttpApi({ fetch: send, storage: saved });
    await api.initialize();
    await api.records({ model: 'demo&offset=999', offset: 25, errors: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe('/api/records?model=demo%26offset%3D999&offset=25&errors=true');
    expect(send.mock.calls[0][1]).toMatchObject({ headers: { 'X-Selark-Dashboard': '1', 'X-Selark-Session': 'fixture-existing-session' }, credentials: 'omit', mode: 'same-origin', redirect: 'error' });
  });

  it('clears expired sessions even when a 401 response is not JSON', async () => {
    const saved = storage(); saved.setItem('selark-dashboard-session', 'fixture-old-session');
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('expired', { status: 401 }));
    const api = createHttpApi({ fetch: send, storage: saved });
    await api.initialize();
    await expect(api.snapshot()).rejects.toMatchObject({ status: 401 });
    expect(saved.getItem('selark-dashboard-session')).toBeNull();
  });

  it('keeps a memory session when browser storage is blocked', async () => {
    const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    const send = vi.fn<typeof fetch>().mockImplementation(async path => new Response(JSON.stringify(path === '/api/session' ? { session_token: 'fixture-memory-session' } : {})));
    const api = createHttpApi({ fetch: send, storage: blocked });
    await api.initialize('fixture-login'); await api.snapshot();
    expect(send.mock.calls[1][1]?.headers).toHaveProperty('X-Selark-Session', 'fixture-memory-session');
  });

  it('does not retry model writes or discard the supplied abort signal', async () => {
    const saved = storage(); saved.setItem('selark-dashboard-session', 'fixture-session');
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: '刷新后重试' }), { status: 409 }));
    const api = createHttpApi({ fetch: send, storage: saved });
    const controller = new AbortController();
    const change = { connection_id: 'demo', model: 'demo-text', enabled: false, revision: 2, clear_default: true };
    await expect(api.setModelApproval(change, controller.signal)).rejects.toMatchObject({ status: 409 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual(['/api/model-approval', expect.objectContaining({ method: 'POST', body: JSON.stringify(change), signal: controller.signal })]);
  });

  it('does not request data when no management session exists', async () => {
    const send = vi.fn<typeof fetch>();
    await expect(createHttpApi({ fetch: send, storage: storage() }).initialize()).rejects.toBeInstanceOf(ApiError);
    expect(send).not.toHaveBeenCalled();
  });
});
