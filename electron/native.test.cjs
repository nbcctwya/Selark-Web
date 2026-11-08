const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { NativeDashboard, settings } = require('./native.cjs');

test('native options cannot inject commands or select shared/device/root paths', () => {
  assert.equal(settings().initialPort, 8788);
  assert.equal(settings().keepRunning, false);
  assert.equal(settings({ configDir: 'D:\\work spaces\\中文' }).configDir, 'D:\\work spaces\\中文');
  for (const input of [{ configDir: '..\\secret' }, { configDir: '\\\\host\\share' }, { configDir: 'C:\\' }, { configDir: 'C:\\bad\npath' }, { initialPort: '8788' }, { initialPort: 65536 }, { keepRunning: 'yes' }]) assert.throws(() => settings(input));
});
function harness(output = 'ready') {
  const launches = [], commands = [];
  const backend = { session: null, origin: '', disconnect() { this.session = null; }, async connect(link) { this.session = 'fixture'; this.origin = new URL(link).origin; return { connected: true }; } };
  const manager = new NativeDashboard(backend, { executable: __filename, defaultConfigDir: 'C:\\fixture-only', startupTimeout: 30, shutdownTimeout: 1000, spawn(file, args, options) {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.exitCode = null; child.signalCode = null;
    const ready = () => child.stdout.write(JSON.stringify({ protocol: 1, type: 'ready', link: 'http://127.0.0.1:49999/#login=fixture-private-bootstrap-only', gatewayUrl: 'http://127.0.0.1:49998', gatewayPid: 1234, ownsGateway: true }) + '\n');
    const close = () => { child.exitCode = 0; child.emit('close', 0); };
    child.stdin = new Writable({ write(chunk, encoding, done) { commands.push(chunk.toString()); if (chunk.toString() === 'renew\n') setImmediate(ready); done(); }, final(done) { done(); setImmediate(close); } });
    launches.push({ file, args, options, child });
    setImmediate(() => { if (output === 'ready') ready(); if (output === 'error') child.stdout.write('{"type":"error","code":"native_start_failed"}\n'); });
    return child;
  } });
  return { manager, backend, launches, commands };
}
test('native session renewal reuses the owned helper and never sends credentials through argv', async () => {
  const h = harness();
  await Promise.all([h.manager.start(), h.manager.start()]);
  assert.equal(h.launches.length, 1);
  assert(h.launches[0].args.includes('desktop-session'));
  assert.equal(h.launches[0].options.windowsHide, true);
  assert.equal(h.launches[0].options.shell, false);
  assert(!JSON.stringify(h.launches[0].args).includes('bootstrap'));
  h.backend.disconnect(); await h.manager.start();
  assert.equal(h.launches.length, 1);
  assert.deepEqual(h.commands, ['renew\n']);
  assert.equal(h.manager.info.gatewayPid, 1234);
  await h.manager.stop();
  assert.deepEqual(h.commands, ['renew\n', 'stop\n']);
  assert.equal(h.manager.process, null);
});
test('native startup failure and timeout close only the owned pipe', async () => {
  for (const mode of ['error', 'silent']) {
    const h = harness(mode);
    await assert.rejects(h.manager.start(), /失败|超时/);
    assert.deepEqual(h.commands, ['stop\n']);
    assert.equal(h.manager.process, null);
    assert.equal(h.backend.session, null);
  }
});
test('native cancellation before launch never creates a child', async () => {
  const h = harness();
  const promise = h.manager.start();
  await h.manager.stop();
  await assert.rejects(promise, /取消/);
  assert.equal(h.launches.length, 0);
});
