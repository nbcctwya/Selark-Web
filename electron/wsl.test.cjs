const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { WslDashboard, settings, decodeList, listDistributions } = require('./wsl.cjs');

test('WSL options are data, accept absolute paths, and decode localized UTF-16 lists', async () => {
  assert.deepEqual(decodeList(Buffer.from('\ufeffUbuntu-20.04\r\nDebian\r\n', 'utf16le')), ['Ubuntu-20.04', 'Debian']);
  assert.equal(settings().autoConnect, true);
  assert.equal(settings({ executable: '/tmp/selark-fixture/my env/bin/selark' }).executable, '/tmp/selark-fixture/my env/bin/selark');
  for (const value of [{ distribution: '--shutdown' }, { distribution: 'bad\nname' }, { executable: 'selark; reboot' }, { configDir: '../secret' }, { autoConnect: 'yes' }]) assert.throws(() => settings(value));
  const names = await listDistributions((_file, args, options, callback) => {
    assert.deepEqual(args, ['--list', '--quiet']); assert.equal(options.windowsHide, true);
    callback(null, Buffer.from('Ubuntu\r\n', 'utf16le'));
  });
  assert.deepEqual(names, ['Ubuntu']);
});

function harness(output = 'ready', startupTimeout = 1000) {
  const launches = [], commands = [];
  let disconnected = 0, exchanges = 0;
  const backend = {
    session: null, origin: '',
    disconnect() { this.session = null; disconnected++; },
    async probe() { return { reachable: true }; },
    async connect(link) { exchanges++; this.session = 'private'; this.origin = new URL(link).origin; return { connected: true, endpoint: this.origin }; },
  };
  const manager = new WslDashboard(backend, { startupTimeout, readRunner: async () => '# fixed runner', spawn(file, args, options) {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.exitCode = null; child.signalCode = null;
    const close = () => { if (child.exitCode !== null) return; child.exitCode = 0; child.emit('close', 0); };
    child.stdin = new Writable({ write(chunk, _encoding, done) { commands.push(chunk.toString()); done(); }, final(done) { done(); setImmediate(close); } });
    child.kill = () => { commands.push('kill'); close(); };
    launches.push({ file, args, options, child });
    setImmediate(() => {
      if (output === 'ready') child.stdout.write(JSON.stringify({ type: 'ready', link: 'http://127.0.0.1:49152/#login=synthetic-credential-123456789' }) + '\n');
      if (output === 'error') child.stdout.write('{"type":"error","code":"selark_not_found"}\n');
    });
    return child;
  } });
  return { manager, backend, launches, commands, exchanges: () => exchanges, disconnected: () => disconnected };
}

test('concurrent startup exchanges once, uses argv, and stops only its owned child', async () => {
  const h = harness();
  const options = { distribution: 'Ubuntu-20.04', executable: '/tmp/selark-fixture/a; b/selark', configDir: '/tmp/selark-fixture/config space' };
  const result = await Promise.all([h.manager.start(options), h.manager.start(options)]);
  assert(result.every(value => value.connected));
  assert.equal(h.launches.length, 1); assert.equal(h.exchanges(), 1);
  const launch = h.launches[0];
  assert.equal(launch.file, 'wsl.exe'); assert.equal(launch.options.shell, false); assert.equal(launch.options.windowsHide, true);
  assert.deepEqual(launch.args.slice(0, 7), ['--distribution', 'Ubuntu-20.04', '--exec', 'python3', '-u', '-c', '# fixed runner']);
  assert.equal(JSON.parse(launch.args[7]).executable, options.executable);
  await h.manager.start(options);
  assert.equal(h.exchanges(), 1);
  await h.manager.stop();
  assert.deepEqual(h.commands, ['stop\n']); assert.equal(h.backend.session, null);
});

test('expired managed sessions start a fresh Dashboard without replaying business writes', async () => {
  const h = harness();
  await h.manager.start(); h.backend.disconnect(); await h.manager.start();
  assert.equal(h.launches.length, 2); assert.equal(h.exchanges(), 2);
  assert.equal(h.commands.length, 1);
  await h.manager.stop();
});

test('startup errors and timeouts clean up, with no credential in diagnostics', async () => {
  for (const output of ['error', 'silent']) {
    const h = harness(output, 20);
    await assert.rejects(h.manager.start(), output === 'error' ? /没有找到 Selark/ : /超时/);
    assert.equal(h.manager.process, null); assert.equal(h.exchanges(), 0);
    assert.deepEqual(h.commands, ['stop\n']);
  }
});

test('cancellation during runner loading never starts a process', async () => {
  let release;
  const h = harness();
  h.manager.readRunner = () => new Promise(resolve => { release = resolve; });
  const starting = h.manager.start();
  await new Promise(resolve => setImmediate(resolve));
  await h.manager.stop(); release('# fixed runner');
  await assert.rejects(starting, /取消/);
  assert.equal(h.launches.length, 0); assert.equal(h.backend.session, null);
});
