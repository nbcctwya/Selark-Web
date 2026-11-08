const http = require('node:http');

function endpoint(value) {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('请输入本机 Dashboard 地址。');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('地址格式无效，请粘贴完整的 Dashboard 管理链接。'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search) {
    throw new Error('仅支持 http://127.0.0.1:端口 的本机 Dashboard；localhost 会自动转换。');
  }
  url.hostname = '127.0.0.1';
  return url;
}

function validateRequest(input) {
  if (!input || typeof input.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(input.id)) throw new Error('无效的请求标识。');
  if (typeof input.path !== 'string' || input.path.length > 4096 || /[\\#\r\n]/.test(input.path)) throw new Error('无效的 API 路径。');
  const url = new URL(input.path, 'http://127.0.0.1');
  const path = url.pathname;
  if (url.origin !== 'http://127.0.0.1' || !input.path.startsWith('/api/')) throw new Error('无效的 API 路径。');
  const routes = [
    ['GET', /^\/api\/(snapshot|records|logs|backups|capabilities|providers|connections|applications)$/],
    ['GET', /^\/api\/connections\/[^/]+(?:\/models)?$/],
    ['GET', /^\/api\/applications\/[^/]+(?:\/quota)?$/],
    ['POST', /^\/api\/(connections|applications|model-approval)$/],
    ['POST', /^\/api\/connections\/[^/]+\/(discover|models\/approval)$/],
    ['PUT', /^\/api\/connections\/[^/]+\/models\/default$/],
    ['PATCH', /^\/api\/connections\/[^/]+$/],
    ['PATCH', /^\/api\/applications\/[^/]+\/policy$/],
    ['POST', /^\/api\/applications\/[^/]+\/revoke$/],
  ];
  // Encoded path separators and dot segments must never escape the route allowlist.
  if (/%(?:2f|5c|2e|25)/i.test(path) || !routes.some(([method, pattern]) => input.method === method && pattern.test(path))) throw new Error('不支持的 API 操作。');
  const body = input.body === undefined ? undefined : JSON.stringify(input.body);
  if ((body && Buffer.byteLength(body) > 256 * 1024) || (input.method === 'GET' && body)) throw new Error('请求内容过大或格式无效。');
  return { path: url.pathname + url.search, method: input.method, body };
}

class Backend {
  constructor() {
    this.origin = 'http://127.0.0.1:8790';
    this.session = null;
    this.epoch = 0;
    this.pending = new Map();
    this.agent = new http.Agent({ keepAlive: true, maxSockets: 6, maxFreeSockets: 2, timeout: 30000 });
  }
  disconnect() {
    this.epoch++;
    this.session = null;
    for (const controller of this.pending.values()) controller.abort();
    this.pending.clear();
  }
  async connect(link) {
    const url = endpoint(link);
    const token = new URLSearchParams(url.hash.slice(1)).get('login');
    if (!token || token.length > 512) throw new Error('链接缺少一次性凭证，请运行 selark dashboard --no-open 并粘贴完整链接。');
    this.disconnect();
    const epoch = this.epoch;
    this.origin = url.origin;
    const result = await this.send('login', '/api/session', 'POST', JSON.stringify({ token }), 20000);
    if (epoch !== this.epoch) throw new Error('连接已取消。');
    if (result.status !== 200 || typeof result.body?.session_token !== 'string') throw new Error(result.body?.error || '管理链接已失效，请重新获取。');
    this.session = result.body.session_token;
    return { endpoint: this.origin, connected: true };
  }
  async probe(address) {
    const origin = endpoint(address).origin;
    const result = await this.send('probe', '/', 'HEAD', undefined, 3000, origin);
    // FastAPI's GET / route may return 405 to HEAD. That still confirms the
    // loopback service is listening; only the subsequent session exchange authenticates it.
    return { reachable: result.status === 200 || result.status === 405, endpoint: origin };
  }
  async request(input) {
    const request = validateRequest(input);
    if (!this.session) return { status: 401, body: { error: '管理会话已失效，请重新连接。' } };
    const epoch = this.epoch;
    const result = await this.send(input.id, request.path, request.method, request.body, request.path.endsWith('/discover') ? 45000 : 20000);
    if (epoch !== this.epoch) throw new Error('连接已切换，请重新读取。');
    if (result.status === 401) this.disconnect();
    return result;
  }
  cancel(id) { this.pending.get(id)?.abort(); }
  send(id, path, method, body, timeout, origin = this.origin) {
    if (this.pending.has(id)) throw new Error('请求正在进行。');
    if (this.pending.size >= 32) throw new Error('当前请求过多，请稍后重试。');
    const controller = new AbortController();
    this.pending.set(id, controller);
    const headers = { Origin: origin, 'X-Selark-Dashboard': '1', 'Cache-Control': 'no-store' };
    if (this.session && origin === this.origin && path.startsWith('/api/') && path !== '/api/session') headers['X-Selark-Session'] = this.session;
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(body); }
    const timer = setTimeout(() => controller.abort(), timeout);
    return new Promise((resolve, reject) => {
      const req = http.request(origin + path, { method, headers, agent: this.agent, signal: controller.signal }, res => {
        const chunks = [];
        let size = 0;
        res.on('data', chunk => {
          size += chunk.length;
          if (size > 16 * 1024 * 1024) { res.destroy(); reject(new Error('Dashboard 响应过大，请缩小查询范围。')); }
          else chunks.push(chunk);
        });
        res.on('error', () => reject(new Error('读取中断，请重试；写入结果请刷新核对。')));
        res.on('end', () => {
          let data = null;
          try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* HEAD and invalid JSON are handled by caller. */ }
          resolve({ status: res.statusCode || 502, body: data });
        });
      });
      req.on('error', error => reject(new Error(error.name === 'AbortError' ? '请求已取消或超时；写入结果请刷新核对。' : '无法连接 Dashboard。请确认所选后端正在运行，或重新选择工作空间。')));
      req.end(body);
    }).finally(() => { clearTimeout(timer); if (this.pending.get(id) === controller) this.pending.delete(id); });
  }
  close() { this.disconnect(); this.agent.destroy(); }
}

module.exports = { Backend, endpoint, validateRequest };
