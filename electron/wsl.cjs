const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { endpoint } = require('./backend.cjs');

const DEFAULT_SETTINGS = Object.freeze({ distribution: '', executable: '', configDir: '', autoConnect: true, readOnly: false });
const errors = {
  selark_not_found: '这个 WSL 环境中没有找到 Selark。请在高级设置中填写已安装的 selark 可执行文件路径。',
  launch_failed: '无法启动 Selark，请检查高级设置中的程序路径。',
  dashboard_failed: 'Dashboard 启动失败，请确认该 WSL 环境中的 Selark 可正常运行，以及配置目录是否正确。',
  runner_failed: 'WSL 启动助手未能完成操作，请检查 Python 3 和 Selark 安装。',
};

function settings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('WSL 设置格式无效。');
  const result = { ...DEFAULT_SETTINGS };
  for (const name of ['distribution', 'executable', 'configDir']) {
    if (input[name] === undefined) continue;
    if (typeof input[name] !== 'string' || input[name].length > (name === 'distribution' ? 200 : 2048) || /[\x00-\x1f]/.test(input[name])) throw new Error('WSL 设置包含无效字符。');
    result[name] = input[name].trim();
  }
  if (result.distribution.startsWith('-')) throw new Error('WSL 环境名称无效。');
  for (const name of ['executable', 'configDir']) {
    if (result[name] && !result[name].startsWith('/') && !result[name].startsWith('~/')) throw new Error('程序和配置目录请填写 WSL 中的绝对路径，或以 ~/ 开头的路径。');
  }
  if (input.autoConnect !== undefined && typeof input.autoConnect !== 'boolean') throw new Error('自动连接设置无效。');
  result.autoConnect = input.autoConnect ?? true;
  if (input.readOnly !== undefined && typeof input.readOnly !== 'boolean') throw new Error('只读模式设置无效。');
  result.readOnly = input.readOnly ?? false;
  return result;
}

function decodeList(buffer) {
  return buffer.toString(buffer.includes(0) ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map(value => value.replace(/\0/g, '').trim()).filter(Boolean);
}

function listDistributions(execute = execFile) {
  return new Promise((resolve, reject) => execute('wsl.exe', ['--list', '--quiet'], { windowsHide: true, timeout: 10000, maxBuffer: 65536, encoding: 'buffer' }, (error, stdout) => {
    if (error) reject(new Error('无法读取 WSL 环境。请确认已安装 WSL，并在当前 Windows 用户下运行应用。'));
    else resolve(decodeList(stdout));
  }));
}

class WslDashboard {
  constructor(backend, options = {}) {
    this.backend = backend;
    this.spawn = options.spawn ?? spawn;
    this.readRunner = options.readRunner ?? (() => fs.readFile(path.join(__dirname, 'wsl-runner.py'), 'utf8'));
    this.startupTimeout = options.startupTimeout ?? 60000;
    this.process = null;
    this.starting = null;
    this.epoch = 0;
    this.current = null;
  }
  async start(input = {}, readOnly = input?.readOnly ?? false) {
    const options = settings(input);
    const key = JSON.stringify({ ...options, readOnly });
    if (this.starting) return this.starting;
    if (this.process && this.backend.session && this.current === key) return { endpoint: this.backend.origin, connected: true };
    this.starting = this.launch(options, readOnly, key);
    try { return await this.starting; } finally { this.starting = null; }
  }
  async launch(options, readOnly, key) {
    const stopping = this.stop();
    const epoch = this.epoch;
    await stopping;
    if (epoch !== this.epoch) throw new Error('连接已取消。');
    const runner = await this.readRunner();
    if (epoch !== this.epoch) throw new Error('连接已取消。');
    const args = options.distribution ? ['--distribution', options.distribution] : [];
    // Python source and user settings travel as distinct arguments, never shell code.
    args.push('--exec', 'python3', '-u', '-c', runner, JSON.stringify({ executable: options.executable, configDir: options.configDir, readOnly }));
    const child = this.spawn('wsl.exe', args, { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    this.process = child;
    this.current = key;
    child.stdin.on('error', () => {});
    child.stderr.on('data', () => {});
    child.on('close', () => {
      if (this.process === child) { this.process = null; this.current = null; this.backend.disconnect(); }
    });
    try {
      const link = await new Promise((resolve, reject) => {
        let buffer = '', done = false;
        const finish = (error, link) => {
          if (done) return;
          done = true; clearTimeout(timer); child.stdout.removeListener('data', read);
          child.removeListener('error', failed); child.removeListener('close', exited);
          child.stdout.resume(); // Drain later output without retaining a credential.
          error ? reject(error) : resolve(link);
        };
        const failed = () => finish(new Error('无法启动 WSL，请确认当前 Windows 用户已安装可用的 WSL 环境。'));
        const exited = () => finish(new Error('WSL 启动已取消或失败。请确认环境中有 Python 3 和 Selark。'));
        const read = chunk => {
          buffer += chunk.toString('utf8');
          if (buffer.length > 65536) return finish(new Error('WSL 返回了异常启动信息。'));
          let index;
          while ((index = buffer.indexOf('\n')) !== -1 && !done) {
            const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
            try {
              const message = JSON.parse(line);
              if (message.type === 'error') finish(new Error(errors[message.code] ?? errors.runner_failed));
              if (message.type === 'ready') {
                const parsed = endpoint(message.link);
                if (!/^#login=[A-Za-z0-9_-]{20,512}$/.test(parsed.hash)) throw new Error();
                finish(null, parsed.href);
              }
            } catch { /* Ignore WSL platform output; never display it or tokens. */ }
          }
        };
        const timer = setTimeout(() => finish(new Error('启动 WSL 超时，请稍后重试或检查 WSL 是否可正常启动。')), this.startupTimeout);
        child.stdout.on('data', read); child.once('error', failed); child.once('close', exited);
      });
      if (epoch !== this.epoch) throw new Error('连接已取消。');
      // Forwarding from WSL to Windows may lag behind the Linux listen socket.
      // Only HEAD is retried; the single-use credential is exchanged exactly once.
      const origin = endpoint(link).origin;
      let reachable = false;
      for (let attempt = 0; attempt < 8 && epoch === this.epoch; attempt++) {
        try { reachable = (await this.backend.probe(origin)).reachable; } catch { /* bounded startup readiness */ }
        if (reachable) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (epoch !== this.epoch) throw new Error('连接已取消。');
      if (!reachable) throw new Error('Dashboard 已启动，但 Windows 无法访问 WSL 的本机端口。请检查 WSL 的 localhost 转发。');
      const result = await this.backend.connect(link);
      if (epoch !== this.epoch) throw new Error('连接已取消。');
      return result;
    } catch (error) {
      if (epoch === this.epoch) await this.stop();
      throw error;
    }
  }
  async stop() {
    this.epoch++;
    const child = this.process;
    this.process = null; this.current = null;
    this.backend.disconnect();
    if (!child || child.exitCode !== null || child.signalCode) return;
    await new Promise(resolve => {
      let timer;
      const done = () => { clearTimeout(timer); child.removeListener('close', done); resolve(); };
      child.once('close', done);
      // EOF also handles a crashed Windows parent. No global WSL shutdown/kill.
      child.stdin.end('stop\n');
      timer = setTimeout(() => { child.kill(); done(); }, 11000);
    });
  }
}

module.exports = { WslDashboard, listDistributions, settings, decodeList, DEFAULT_SETTINGS };
