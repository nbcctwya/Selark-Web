import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockApi } from './api';
import fixture from './fixture.json';
import { conforms } from './contract';

afterEach(() => vi.unstubAllGlobals());
const make = (scenario: Parameters<typeof createMockApi>[0] = {}) => createMockApi({ delayMs: 0, now: new Date(fixture.reference_time), ...scenario });

describe('mock contract and interactions', () => {
  it('runs connection, model and application workflows against the published response contract', async () => {
    const send = vi.fn(); vi.stubGlobal('fetch', send);
    const api = make(); await api.initialize();
    const checked = <T>(schema: string, value: T): T => { expect(conforms(schema, value), schema).toBe(true); return value; };
    checked('Capabilities', await api.getCapabilities());
    checked('ProviderList', await api.getProviders());
    const connection = checked('ManagedConnection', await api.createConnection({ id: 'new-relay', provider: 'openai-compatible', base_url: 'https://relay.example/v1', api_key: 'fixture-submitted-key' }));
    expect(connection.allowed_models).toEqual([]);
    expect(connection.discovery.state).toBe('never');
    expect(connection).not.toHaveProperty('api_key');
    await expect(api.createConnection({ id: connection.id, provider: 'openai', api_key: 'fixture-key' })).rejects.toMatchObject({ status: 409, code: 'connection_exists' });
    const updated = checked('ManagedConnection', await api.updateConnection(connection.id, { revision: connection.revision, name: 'Changed', api_key: 'fixture-rotated-key' }));
    await expect(api.updateConnection(connection.id, { revision: connection.revision, enabled: false })).rejects.toMatchObject({ status: 409, code: 'connection_changed' });
    expect(updated.name).toBe('Changed');
    const discovered = checked('ManagedModels', await api.discoverModels(connection.id));
    expect(discovered.discovery.state).toBe('success');
    expect(discovered.models.every(m => !m.approved)).toBe(true);
    const approved = checked('ManagedModels', await api.approveModels(connection.id, { revision: discovered.approval_revision, enabled: true, all_models: true }));
    const selected = checked('ManagedModels', await api.setDefaultModel(connection.id, { revision: approved.approval_revision, model: approved.models[0].id }));
    await expect(api.approveModels(connection.id, { revision: selected.approval_revision, enabled: false, all_models: true })).rejects.toMatchObject({ status: 409, code: 'default_model_confirmation' });
    const app = checked('CreatedApplication', await api.createApplication({ name: 'New editor', policy: { allowed_connections: [connection.id], daily_token_limit: 1000 } }));
    expect(app.token).toContain('demo-only-not-a-real-token');
    const list = checked('ApplicationList', await api.getApplications());
    expect(JSON.stringify(list)).not.toContain(app.token);
    expect(checked('ManagedApplication', await api.getApplication(app.id))).not.toHaveProperty('token');
    const policy = checked('ManagedApplication', await api.updateApplicationPolicy(app.id, { revision: app.revision, policy: { daily_token_limit: 500, daily_budget: '1.25' } }));
    const quota = checked('ApplicationQuota', await api.getApplicationQuota(app.id));
    expect(quota.remaining_tokens).toBe(500);
    expect(quota.policy.daily_budget).toBe('1.25');
    await expect(api.revokeApplication(app.id, { revision: app.revision })).rejects.toMatchObject({ status: 409, code: 'application_changed' });
    const revoked = checked('RevokedApplication', await api.revokeApplication(app.id, { revision: policy.revision }));
    expect(revoked.in_flight_policy).toBe('already_admitted_requests_continue');
    expect(revoked.active).toBe(false);
    const disabled = checked('ManagedModels', await api.approveModels(connection.id, { revision: selected.approval_revision, enabled: false, all_models: true, clear_default: true }));
    expect(disabled.default_model).toBeNull();
    checked('ConnectionList', await api.getConnections());
    checked('ManagedModels', await api.getConnectionModels(connection.id));
    const snapshot = checked('Snapshot', await api.snapshot());
    expect(snapshot.applications.find(item => item.id === app.id)?.effective_resources).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain('fixture-rotated-key');
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects malformed edits and separates read-only, offline and failed discovery behavior', async () => {
    const api = make(); await api.initialize();
    const connection = await api.getConnection('openai-demo');
    await expect(api.updateConnection(connection.id, { revision: connection.revision })).rejects.toMatchObject({ status: 400, code: 'invalid_request' });
    await expect(api.updateConnection(connection.id, { revision: connection.revision, enabled: null } as never)).rejects.toMatchObject({ status: 400, code: 'invalid_request' });
    await expect(api.updateConnection(connection.id, { revision: connection.revision, name: 'Valid', unexpected: true } as never)).rejects.toMatchObject({ status: 400 });
    expect((await api.getConnection(connection.id)).revision).toBe(connection.revision);
    const readonly = make({ scenario: 'readonly' }); await readonly.initialize();
    expect(Object.values(await readonly.getCapabilities()).every(value => !value)).toBe(true);
    await expect(readonly.createApplication({ name: 'Blocked' })).rejects.toMatchObject({ status: 405 });
    const offline = make({ scenario: 'offline-mode' }); await offline.initialize();
    expect((await offline.getCapabilities()).model_discovery).toBe(false);
    await expect(offline.discoverModels(connection.id)).rejects.toMatchObject({ status: 405 });
    expect((await offline.createApplication({ name: 'Local only' })).active).toBe(true);
    const failing = make({ scenario: 'discovery-error' }); await failing.initialize();
    const before = await failing.getConnectionModels(connection.id);
    const failure = await failing.discoverModels(connection.id);
    expect(failure.discovery.state).toBe('failure');
    expect(failure.discovery.models).toEqual(before.discovery.models);
    expect(failure.default_model).toBe(before.default_model);
    expect(conforms('ManagedModels', failure)).toBe(true);
  });

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
    expect(conforms('Snapshot', await api.snapshot({ connection_id: 'deepseek', period: '7d' }))).toBe(true);
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
    expect(snapshot.connections.map(c => c.id)).toEqual((await api.snapshot({})).connections.map(c => c.id));
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
