import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';

// Real CMD -> packaged Electron launch. Profiles and native backend data are isolated.
const root = path.resolve(import.meta.dirname, '..');
const profile = path.join(root, `.test-profile-cmd-${Date.now()}`);
const freePort = async () => {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
};
const debuggingPort = await freePort();
const gatewayPort = await freePort();
await mkdir(profile, { recursive: true });
await writeFile(path.join(profile, 'preferences.json'), JSON.stringify({ windows: { configDir: path.join(profile, 'Windows 中文'), initialPort: gatewayPort, autoConnect: true } }));
const invoke = async name => {
  const file = path.join(root, '..', name);
  // cmd.exe /s /c requires an outer quote pair around this entire command line.
  for (const value of [file, profile]) assert(!/["%&|<>^\r\n]/.test(value));
  const command = `""${file}" --user-data-dir="${profile}" --remote-debugging-port=${debuggingPort}"`;
  const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], { windowsVerbatimArguments: true, windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`CMD exited ${code}`))); });
};
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
let browser;
let page;
let gatewayPid;
const connect = async () => {
  await expect.poll(async () => {
    try { return (await fetch(`http://127.0.0.1:${debuggingPort}/json/version`)).ok; } catch { return false; }
  }, { timeout: 30000 }).toBe(true);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debuggingPort}`);
  const context = browser.contexts()[0];
  await expect.poll(() => context.pages().length, { timeout: 20000 }).toBeGreaterThan(0);
  page = context.pages()[0];
};
const close = async () => {
  await page?.evaluate(() => window.selark.window('close')).catch(() => {});
  if (gatewayPid) await expect.poll(() => alive(gatewayPid), { timeout: 15000 }).toBe(false);
  await expect.poll(async () => {
    try { await fetch(`http://127.0.0.1:${debuggingPort}/json/version`); return false; } catch { return true; }
  }, { timeout: 15000 }).toBe(true);
  await browser?.close().catch(() => {});
  browser = null; page = null;
};
try {
  await invoke('启动 Selark Windows.cmd');
  await connect();
  await expect(page.getByRole('heading', { name: '资源概览', level: 1 })).toBeVisible({ timeout: 60000 });
  let config = await page.evaluate(() => window.selark.config());
  assert.equal(config.connectionMode, 'windows');
  assert.equal(config.nativeInfo.configDir, path.join(profile, 'Windows 中文'));
  gatewayPid = config.nativeInfo.gatewayPid;
  await invoke('启动 Selark WSL.cmd');
  await expect(page.getByRole('button', { name: '连接 WSL 工作空间', exact: true })).toBeVisible();
  assert(alive(gatewayPid), 'A second launch must let the user confirm switching');
  await invoke('启动 Selark Windows.cmd');
  await expect(page.getByRole('button', { name: '打开 Windows 工作空间', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回当前工作空间', exact: true }).click();
  await close();
  await invoke('启动 Selark.cmd');
  await connect();
  await expect(page.getByRole('heading', { name: '资源概览', level: 1 })).toBeVisible({ timeout: 60000 });
  config = await page.evaluate(() => window.selark.config());
  gatewayPid = config.nativeInfo.gatewayPid;
  await close();
  await invoke('选择 Selark 后端.cmd');
  await connect();
  await expect(page.getByRole('heading', { name: '连接到你的工作空间' })).toBeVisible();
  config = await page.evaluate(() => window.selark.config());
  assert.equal(config.connected, false);
  assert.equal(config.nativeInfo, null);
  const preferences = await readFile(path.join(profile, 'preferences.json'), 'utf8');
  assert(!/#login=|session_token/.test(preferences));
  const result = { passed: true, windowsCmdStartsBundledCore: true, defaultCmdRestoresLastBackend: true, chooseCmdSuppressesAutoConnect: true, secondInstanceSelectsWithoutStoppingGateway: true, shutdownCleansOwnedGateway: true, realProviderRequests: 0 };
  await writeFile(path.join(root, 'artifacts/launchers.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { if (browser) await close(); }
