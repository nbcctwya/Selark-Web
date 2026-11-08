const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { endpoint } = require('./backend.cjs');

const DEFAULT_SETTINGS = Object.freeze({ configDir: '', initialPort: 8788, autoConnect: true, readOnly: false, keepRunning: false });
function settings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Windows 设置格式无效。');
  const result = { ...DEFAULT_SETTINGS };
  if (input.configDir !== undefined) {
    if (typeof input.configDir !== 'string' || input.configDir.length > 2048 || /[\x00-\x1f]/.test(input.configDir)) throw new Error('Windows 配置目录无效。');
    result.configDir = input.configDir.trim();
    if (result.configDir && !/^[a-z]:[\\/]/i.test(result.configDir)) throw new Error('Windows 配置目录须为本地磁盘的绝对路径。');
    if (result.configDir && path.win32.normalize(result.configDir) === path.win32.parse(result.configDir).root) throw new Error('请选择独立的配置文件夹，不能使用磁盘根目录。');
  }
  if (input.initialPort !== undefined) {
    if (!Number.isInteger(input.initialPort) || input.initialPort < 1024 || input.initialPort > 65535) throw new Error('初始网关端口须在 1024–65535 之间。');
    result.initialPort = input.initialPort;
  }
  for (const name of ['autoConnect', 'readOnly', 'keepRunning']) {
    if (input[name] !== undefined && typeof input[name] !== 'boolean') throw new Error('Windows 连接选项无效。');
    result[name] = input[name] ?? result[name];
  }
  return result;
}

class NativeDashboard {
  constructor(backend, { executable, defaultConfigDir, spawn: spawnChild = spawn, startupTimeout = 60000, shutdownTimeout = 65000 } = {}) {
    this.backend = backend;
    this.executable = executable;
    this.defaultConfigDir = defaultConfigDir;
    this.spawn = spawnChild;
    this.startupTimeout = startupTimeout;
    this.shutdownTimeout = shutdownTimeout;
    this.process = null;
    this.pending = null;
    this.starting = null;
    this.stopping = null;
    this.current = null;
    this.info = null;
    this.epoch = 0;
  }
  waitReady(child) {
    if (this.pending) throw new Error('Windows 连接正在进行。');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Windows 服务启动超时，请检查配置或端口占用。')), this.startupTimeout);
      const finish = (error, message) => {
        clearTimeout(timer);
        if (this.pending?.finish === finish) this.pending = null;
        error ? reject(error) : resolve(message);
      };
      this.pending = { child, finish };
    });
  }
  attach(child) {
    let buffer = '';
    child.stdin.on('error', () => {});
    child.stderr.on('data', () => {}); // Never retain credentials or raw backend diagnostics.
    child.stdout.on('data', chunk => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 65536) {
        this.pending?.finish(new Error('Windows 服务返回了异常启动信息。'));
        buffer = '';
        return;
      }
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let value;
        try { value = JSON.parse(line); } catch { continue; }
        if (this.pending?.child !== child) continue;
        if (value.type === 'error') this.pending.finish(new Error('Windows 服务启动失败。请检查本地配置、文件权限或网关端口占用；已有数据不会重置。'));
        if (value.type === 'ready') {
          try {
            const link = endpoint(value.link);
            const gateway = endpoint(value.gatewayUrl);
            if (value.protocol !== 1 || !/^#login=[A-Za-z0-9_-]{20,512}$/.test(link.hash) || !Number.isSafeInteger(value.gatewayPid) || value.gatewayPid < 2 || typeof value.ownsGateway !== 'boolean') throw new Error();
            this.pending.finish(null, { link: link.href, gatewayUrl: gateway.origin, gatewayPid: value.gatewayPid, ownsGateway: value.ownsGateway,
              configDir: typeof value.configDir === 'string' ? value.configDir : '', dataDir: typeof value.dataDir === 'string' ? value.dataDir : '' });
          } catch { this.pending?.finish(new Error('Windows 服务握手信息无效。')); }
        }
      }
    });
    child.on('error', () => this.pending?.child === child && this.pending.finish(new Error('无法启动内置 Windows 后端，请修复安装或重新构建应用。')));
    child.on('close', () => {
      if (this.pending?.child === child) this.pending.finish(new Error('Windows 会话已结束，请重新连接。'));
      if (this.process === child) { this.process = null; this.current = null; this.info = null; this.backend.disconnect(); }
    });
  }
  async start(input = {}) {
    const options = settings(input);
    if (this.starting) return this.starting;
    this.starting = this.launch(options);
    try { return await this.starting; } finally { this.starting = null; }
  }
  async launch(options) {
    const key = JSON.stringify(options);
    let ready;
    if (this.process && this.current === key) {
      if (this.backend.session) return { endpoint: this.backend.origin, connected: true };
      ready = this.waitReady(this.process);
      this.process.stdin.write('renew\n');
    } else {
      const stopping = this.stop();
      const epoch = this.epoch;
      await stopping;
      if (epoch !== this.epoch) throw new Error('连接已取消。');
      await fs.access(this.executable).catch(() => { throw new Error('未找到内置 Windows 后端，请重新构建或修复安装。'); });
      if (epoch !== this.epoch) throw new Error('连接已取消。');
      const args = ['--config-dir', options.configDir || this.defaultConfigDir, 'desktop-session', '--initial-port', String(options.initialPort)];
      if (options.readOnly) args.push('--read-only'); else args.push('--create');
      if (options.keepRunning) args.push('--keep-running');
      const env = { ...process.env, PYTHONUTF8: '1', PYTHONUNBUFFERED: '1', PYINSTALLER_RESET_ENVIRONMENT: '1' };
      // Explicit native profile; ambient WSL/developer overrides must never redirect it.
      for (const name of ['SELARK_CONFIG_DIR', 'SELARK_DATA_DIR', 'MIMO_API_KEY', 'PYTHONPATH', 'PYTHONHOME', '__PYVENV_LAUNCHER__']) delete env[name];
      const child = this.spawn(this.executable, args, { windowsHide: true, shell: false, cwd: path.dirname(this.executable), stdio: ['pipe', 'pipe', 'pipe'], env });
      this.process = child; this.current = key;
      ready = this.waitReady(child);
      this.attach(child);
    }
    const epoch = this.epoch;
    try {
      const { link, ...info } = await ready;
      if (epoch !== this.epoch) throw new Error('连接已取消。');
      const result = await this.backend.connect(link);
      if (epoch !== this.epoch) throw new Error('连接已取消。');
      this.info = info;
      return result;
    } catch (error) {
      if (epoch === this.epoch) await this.stop();
      throw error;
    }
  }
  async stop() {
    this.epoch++;
    this.backend.disconnect();
    this.pending?.finish(new Error('连接已取消。'));
    if (this.stopping) return this.stopping;
    const child = this.process;
    if (!child || child.exitCode !== null || child.signalCode) return;
    this.stopping = new Promise((resolve, reject) => {
      const finish = () => { clearTimeout(timer); child.removeListener('close', finish); resolve(); };
      const timer = setTimeout(() => { child.removeListener('close', finish); reject(new Error('Windows 服务仍在正常退出，请稍后重试。')); }, this.shutdownTimeout);
      child.once('close', finish);
      child.stdin.end('stop\n');
    });
    try { await this.stopping; } finally { this.stopping = null; }
  }
}
module.exports = { NativeDashboard, settings, DEFAULT_SETTINGS };
