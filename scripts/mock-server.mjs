import http from 'node:http';
import { readFile } from 'node:fs/promises';

// Synthetic public fixtures only; never reads user configuration or calls providers.
export async function createTestServer({ delay = 0, modelCount = 0 } = {}) {
  const fixture = JSON.parse(await readFile(new URL('../src/mocks/fixture.json', import.meta.url), 'utf8'));
  if (modelCount) {
    const connection = fixture.snapshot.connections.find(c => c.name === 'OpenAI Demo');
    connection.model_catalog.models = Array.from({ length: modelCount }, (_, i) => ({ ...connection.model_catalog.models[0], id: `catalog-${String(i).padStart(4, '0')}`, default: false }));
  }
  const requests = [];
  const state = { expired: false, sessions: 0 };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const origin = `http://127.0.0.1:${server.address().port}`;
    requests.push({ path: url.pathname, search: url.search, method: req.method, at: performance.now() });
    const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (req.headers.host !== origin.slice(7) || (req.headers.origin && req.headers.origin !== origin)) return reply(403, { error: 'boundary mismatch' });
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (url.pathname === '/') return reply(200, {});
    if (url.pathname === '/api/session') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const { token } = JSON.parse(Buffer.concat(chunks));
      if (token !== 'desktop-test-bootstrap' || req.headers.origin !== origin) return reply(401, { error: '管理链接已失效。' });
      state.sessions++; state.expired = false;
      return reply(200, { session_token: 'desktop-test-session', expires_in: 28800 });
    }
    if (state.expired || req.headers['x-selark-session'] !== 'desktop-test-session' || req.headers['x-selark-dashboard'] !== '1') return reply(401, { error: '管理会话已失效。' });
    if (url.pathname === '/api/snapshot') return reply(200, fixture.snapshot);
    if (url.pathname === '/api/records') { const offset = Number(url.searchParams.get('offset') || 0); return reply(200, { items: fixture.records.slice(offset, offset + 25), offset, limit: 25, total: fixture.records.length }); }
    if (url.pathname === '/api/logs') return reply(200, fixture.logs);
    if (url.pathname === '/api/backups') return reply(200, fixture.backups);
    if (url.pathname === '/api/capabilities') return reply(200, fixture.management.capabilities);
    if (url.pathname === '/api/providers') return reply(200, { items: fixture.management.providers });
    for (const kind of ['connections', 'applications']) {
      const prefix = `/api/${kind}`;
      if (req.method === 'GET' && url.pathname === prefix) return reply(200, { items: fixture.management[kind] });
      if (req.method === 'GET' && url.pathname.startsWith(prefix + '/')) {
        const item = fixture.management[kind].find(item => item.id === decodeURIComponent(url.pathname.slice(prefix.length + 1)));
        if (item) return reply(200, item);
      }
    }
    return reply(404, { error: 'Unknown test endpoint' });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, requests, state, close: () => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); } };
}
