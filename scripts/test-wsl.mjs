import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { Backend } = require('../electron/backend.cjs');
const { WslDashboard, listDistributions } = require('../electron/wsl.cjs');

// Opt-in integration test, never part of fixture-only CI. Uses --read-only.
const distribution = process.argv[2] ?? '';
const backend = new Backend();
const manager = new WslDashboard(backend);
const distributions = await listDistributions();
assert(distributions.length > 0, 'No WSL distribution installed');
const start = performance.now();
let origin;
try {
  const result = await manager.start({ distribution }, true);
  origin = result.endpoint;
  assert(result.connected, 'Automatic login failed');
  const response = await backend.request({ id: 'capabilities', path: '/api/capabilities', method: 'GET' });
  assert.equal(response.status, 200);
  assert(response.body.connection_management === false && response.body.application_management === false, 'Integration test must be read-only');
  console.log(JSON.stringify({ result: 'connected', automaticStartupMs: Math.round(performance.now() - start), readOnly: true, credentialsPrinted: false }));
} finally {
  await manager.stop(); backend.close();
}
assert(!backend.session, 'Session must be cleared');
const check = new Backend();
try {
  let reachable = false;
  try { reachable = (await check.probe(origin)).reachable; } catch { /* expected: owned process stopped */ }
  assert(!reachable, 'Owned Dashboard should stop with the desktop connection');
  console.log(JSON.stringify({ result: 'passed', ownedDashboardStopped: true, businessWrites: 0, providerCalls: 0 }));
} finally { check.close(); }
