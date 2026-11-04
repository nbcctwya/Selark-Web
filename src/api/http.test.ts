import { describe, expect, it, vi } from 'vitest';
import { ApiError, createHttpApi } from './http';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

describe('real HTTP adapter', () => {
  it('exchanges a one-use link once even under concurrent React initialization', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ session_token: 'fixture-admin-session', authenticated: true, expires_in: 28800 })));
    const saved = storage();
    const api = createHttpApi({ fetch: send, storage: saved });
    await Promise.all([api.initialize('fixture-login'), api.initialize('fixture-login')]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual(['/api/session', expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'fixture-login' }), credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-store' })]);
    expect(saved.getItem('selark-dashboard-session')).toBe('fixture-admin-session');
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
