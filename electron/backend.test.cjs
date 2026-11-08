const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Backend, endpoint, validateRequest } = require('./backend.cjs');

test('only loopback Dashboard origins and known API routes are accepted', () => {
  assert.equal(endpoint('http://localhost:8790/#login=abc').origin, 'http://127.0.0.1:8790');
  for (const url of ['https://example.com/', 'http://127.0.0.1.evil.test/', 'file:///C:/secret', 'http://user:pass@127.0.0.1/', 'http://127.0.0.1/api/session', 'http://127.0.0.1/?token=bad', 'http://[::1]/']) assert.throws(() => endpoint(url));
  for (const path of ['http://example.com/api/snapshot', '//example.com/api/snapshot', '/api/session', '/v1/chat/completions', '/api/connections/%2Fsecret', '/api/connections/%252fsecret']) assert.throws(() => validateRequest({ id: 'test', path, method: 'GET' }));
  assert.equal(validateRequest({ id: 'test', path: '/api/records?offset=25', method: 'GET' }).path, '/api/records?offset=25');
  assert.throws(() => validateRequest({ id: 'test', path: '/api/applications', method: 'POST', body: { name: 'a'.repeat(300000) } }));
});

async function server(t, respond) {
  const instance = http.createServer(respond);
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  t.after(() => { instance.closeAllConnections(); instance.close(); });
  return `http://127.0.0.1:${instance.address().port}`;
}

test('session exchange, exact Host/Origin, no probe credentials, 401 clearing and no redirect', async t => {
  const requests = [];
  let expired = false;
  const origin = await server(t, (req, res) => {
    requests.push({ path: req.url, headers: req.headers });
    assert.equal(req.headers.origin, origin);
    assert.equal(req.headers.host, origin.slice(7));
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/session') res.end(JSON.stringify({ session_token: 'test-session' }));
    else if (req.url === '/') { assert.equal(req.headers['x-selark-session'], undefined); res.statusCode = 405; res.end(); }
    else if (req.url === '/api/logs') { res.writeHead(302, { Location: origin + '/forbidden' }); res.end('{}'); }
    else { assert.equal(req.headers['x-selark-session'], 'test-session'); res.statusCode = expired ? 401 : 200; res.end(JSON.stringify(expired ? { error: 'expired' } : { ok: true })); }
  });
  const backend = new Backend(); t.after(() => backend.close());
  await backend.connect(origin + '/#login=test-bootstrap');
  assert.equal((await backend.request({ id: '1', path: '/api/snapshot', method: 'GET' })).status, 200);
  assert.equal((await backend.probe(origin)).reachable, true, 'FastAPI can reject HEAD while serving GET /');
  assert.equal((await backend.request({ id: '2', path: '/api/logs', method: 'GET' })).status, 302);
  assert(!requests.some(request => request.path === '/forbidden'));
  expired = true;
  assert.equal((await backend.request({ id: '3', path: '/api/snapshot', method: 'GET' })).status, 401);
  assert.equal(backend.session, null);
  const count = requests.length;
  assert.equal((await backend.request({ id: '4', path: '/api/snapshot', method: 'GET' })).status, 401);
  assert.equal(requests.length, count);
});

test('cancel aborts in-flight requests and failed mutations are never retried', async t => {
  let calls = 0;
  const origin = await server(t, (req, res) => {
    if (req.url === '/api/session') res.end('{"session_token":"test-session"}');
    else { calls++; if (req.url === '/api/applications') { res.statusCode = 503; res.end('{"error":"unavailable"}'); } }
  });
  const backend = new Backend(); t.after(() => backend.close());
  await backend.connect(origin + '/#login=test-bootstrap');
  const request = backend.request({ id: 'cancelled', path: '/api/snapshot', method: 'GET' });
  await new Promise(resolve => setTimeout(resolve, 30)); backend.cancel('cancelled');
  await assert.rejects(request, /取消/);
  const before = calls;
  assert.equal((await backend.request({ id: 'write', path: '/api/applications', method: 'POST', body: { name: 'test' } })).status, 503);
  assert.equal(calls - before, 1);
  assert.equal(backend.pending.size, 0);
});
