import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockApi } from './api';
import fixture from './fixture.json';

afterEach(() => vi.unstubAllGlobals());
const make = (scenario: Parameters<typeof createMockApi>[0] = {}) => createMockApi({ delayMs: 0, now: new Date(fixture.reference_time), ...scenario });

describe('mock contract and interactions', () => {
  it('preserves aggregate tokens, cost precision and unknown usage from the real synthetic ledger', async () => {
    const api = make(); await api.initialize();
    const snapshot = await api.snapshot();
    expect(snapshot.usage?.summary.known_tokens).toEqual(fixture.snapshot.usage.summary.known_tokens);
    expect(snapshot.usage?.summary.estimated_cost_by_currency).toEqual(fixture.snapshot.usage.summary.estimated_cost_by_currency);
    expect(snapshot.usage?.summary.unknown_consumption_requests).toBe(fixture.snapshot.usage.summary.unknown_consumption_requests);
    expect(snapshot.usage?.summary.resource_accounting).toEqual(fixture.snapshot.usage.summary.resource_accounting);
  });

  it('filters summaries and records consistently and paginates without duplicates', async () => {
    const api = make(); await api.initialize();
    const first = await api.records(), second = await api.records({ offset: 25 });
    expect(first.total).toBe(65); expect(first.items).toHaveLength(25); expect(second.items).toHaveLength(25);
    expect(new Set([...first.items, ...second.items].map(r => r.request_id)).size).toBe(50);
    const snapshot = await api.snapshot({ connection_id: 'deepseek' });
    const records = await api.records({ connection_id: 'deepseek' });
    expect(records.total).toBe(snapshot.usage?.summary.requests);
    expect(records.items.every(r => r.connection_id === 'deepseek')).toBe(true);
    const errors = await api.records({ errors: true });
    expect(errors.items.every(r => r.status === 'failed')).toBe(true);
    expect(errors.total).toBeGreaterThan(0);
  });

  it('supports explicit empty custom windows and retains global resource lists', async () => {
    const api = make(); await api.initialize();
    const filters = { period: 'custom' as const, since: '2000-01-01T00:00:00Z', until: '2000-01-02T00:00:00Z' };
    const snapshot = await api.snapshot(filters);
    expect(snapshot.usage?.summary.requests).toBe(0);
    expect(snapshot.usage?.summary.known_tokens.total_tokens).toBeNull();
    expect(snapshot.connections).toHaveLength(6);
    expect((await api.records(filters)).total).toBe(0);
  });

  it('requires confirmation before clearing a default and rejects stale writes', async () => {
    const api = make(); await api.initialize();
    const snapshot = await api.snapshot();
    const connection = snapshot.connections.find(c => c.id === 'mimo-default')!;
    const request = { connection_id: connection.id, model: connection.default_model!, enabled: false, revision: connection.model_catalog.approval_revision };
    await expect(api.setModelApproval(request)).rejects.toMatchObject({ status: 409 });
    const changed = await api.setModelApproval({ ...request, clear_default: true });
    expect(changed).toMatchObject({ enabled: false, default_model: null });
    await expect(api.setModelApproval({ ...request, enabled: true })).rejects.toMatchObject({ status: 409 });
    const after = await api.snapshot();
    expect(after.applications.map(a => a.policy)).toEqual(snapshot.applications.map(a => a.policy));
    expect(after.connections[0].model_catalog.models.find(m => m.id === request.model)?.effective_applications).toEqual([]);
  });

  it('updates enabled lists and authorization views, without changing the default on enable', async () => {
    const api = make(); await api.initialize();
    const c = (await api.snapshot()).connections.find(c => c.id === 'openai-demo')!;
    await api.setModelApproval({ connection_id: c.id, model: 'demo-text-small', enabled: true, revision: c.model_catalog.approval_revision });
    const after = (await api.snapshot()).connections.find(item => item.id === c.id)!;
    expect(after.models).toEqual(['demo-text', 'demo-text-small']);
    expect(after.default_model).toBe('demo-text');
    expect(after.model_catalog.models[1].effective_applications).toContain('legacy');
  });

  it('does not mutate state when an operation is aborted', async () => {
    const api = make(); await api.initialize();
    const c = (await api.snapshot()).connections[0];
    const controller = new AbortController(); controller.abort();
    await expect(api.setModelApproval({ connection_id: c.id, model: c.default_model!, enabled: false, revision: c.model_catalog.approval_revision, clear_default: true }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect((await api.snapshot()).connections[0].default_model).toBe(c.default_model);
  });

  it.each(['expired', 'error'] as const)('exposes the %s failure with its real HTTP status', async scenario => {
    const api = make({ scenario }); await api.initialize();
    await expect(api.snapshot()).rejects.toMatchObject({ status: scenario === 'expired' ? 401 : 503 });
  });

  it('separates empty, unknown, offline, partial and read-only states', async () => {
    const empty = make({ scenario: 'empty' }); await empty.initialize();
    expect((await empty.snapshot()).connections).toEqual([]);
    expect((await empty.records()).total).toBe(0);
    const unknown = make({ scenario: 'unknown' }); await unknown.initialize();
    expect((await unknown.snapshot()).usage?.summary.known_tokens.total_tokens).toBeNull();
    expect((await unknown.snapshot()).applications[0].quota.remaining_tokens).toBeNull();
    const offline = make({ scenario: 'offline' }); await offline.initialize();
    expect((await offline.snapshot()).service).toEqual({ state: 'unreachable_or_invalid', reachable: false, capacity: {}, storage: {} });
    const partial = make({ scenario: 'partial' }); await partial.initialize();
    expect((await partial.snapshot()).usage).toBeNull();
    await expect(partial.records()).rejects.toMatchObject({ status: 503 });
    const readonly = make({ scenario: 'readonly' }); await readonly.initialize();
    expect((await readonly.snapshot()).capabilities.model_approval).toBe(false);
    await expect(readonly.setModelApproval({ connection_id: 'mimo-default', model: 'mimo-fixture', enabled: false, revision: 1 })).rejects.toMatchObject({ status: 405 });
  });

  it('isolates each mock instance, never calls fetch, and makes conflict recovery explicit', async () => {
    const send = vi.fn(); vi.stubGlobal('fetch', send);
    const api = make({ scenario: 'conflict' }); await api.initialize();
    const c = (await api.snapshot()).connections.find(c => c.id === 'openai-demo')!;
    const change = { connection_id: c.id, model: 'demo-text-small', enabled: true, revision: c.model_catalog.approval_revision };
    await expect(api.setModelApproval(change)).rejects.toMatchObject({ status: 409 });
    const fresh = (await api.snapshot()).connections.find(item => item.id === c.id)!;
    expect(fresh.models).not.toContain('demo-text-small');
    await api.setModelApproval({ ...change, revision: fresh.model_catalog.approval_revision });
    const other = make(); await other.initialize();
    expect((await other.snapshot()).connections.find(c => c.id === 'openai-demo')!.models).not.toContain('demo-text-small');
    await api.records(); await api.logs(); await api.backups();
    expect(send).not.toHaveBeenCalled();
  });
});
