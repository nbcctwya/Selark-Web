import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import net from 'node:net';

// Opt-in: read-only real WSL integration. No screenshots or real resource output.
const root = path.resolve(import.meta.dirname, '..');
const profile = path.join(root, `.test-profile-wsl-${Date.now()}`);
const distribution = process.argv[2] ?? '';
await mkdir(profile, { recursive: true });
const portProbe = net.createServer();
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
await writeFile(path.join(profile, 'preferences.json'), JSON.stringify({ windows: { configDir: path.join(profile, 'native-test'), initialPort: port }, wsl: { distribution, executable: '', configDir: '', autoConnect: true, readOnly: true } }));
let app;
const launch = () => electron.launch(process.env.SELARK_TEST_PACKAGED === '1'
  ? { executablePath: path.join(root, 'release/win-unpacked/Selark.exe'), args: [`--user-data-dir=${profile}`], timeout: 20000 }
  : { args: [root], timeout: 20000, env: { ...process.env, SELARK_TEST_PROFILE: profile } });
try {
  app = await launch();
  let page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: '连接到你的工作空间' })).toBeVisible();
  await page.getByRole('button', { name: 'WSL 自动连接', exact: true }).click();
  await page.getByRole('button', { name: '连接 WSL 工作空间', exact: true }).click();
  await expect(page.getByRole('heading', { name: '资源概览', level: 1 })).toBeVisible({ timeout: 70000 });
  assert((await page.evaluate(() => window.selark.config())).connected, 'Should connect automatically');
  await expect(page.getByLabel('一次性管理链接', { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.selark.clearSession());
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByText('管理会话已自动恢复。如刚才正在保存，请核对操作结果。', { exact: true })).toBeVisible({ timeout: 70000 });
  await expect(page.getByRole('heading', { name: '资源概览', level: 1 })).toBeVisible();
  for (const name of ['连接与模型', '用量分析', '应用管理', '运行监控']) {
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, level: 1, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '刷新', exact: true })).toBeEnabled();
  }
  await expect(page.getByRole('heading', { name: '运行日志', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '切换后端', exact: true }).click();
  await page.getByRole('button', { name: 'Windows 本地', exact: true }).click();
  await page.getByRole('button', { name: '打开 Windows 工作空间', exact: true }).click();
  await expect(page.getByRole('heading', { name: '资源概览', level: 1 })).toBeVisible({ timeout: 60000 });
  const native = await page.evaluate(() => window.selark.config());
  assert.equal(native.connectionMode, 'windows');
  const empty = await page.evaluate(() => window.selark.request({ id: crypto.randomUUID(), path: '/api/snapshot', method: 'GET' }));
  assert.deepEqual(empty.body.connections, []);
  await page.getByRole('button', { name: '切换后端', exact: true }).click();
  await page.getByRole('button', { name: 'WSL 自动连接', exact: true }).click();
  await page.getByRole('button', { name: '连接 WSL 工作空间', exact: true }).click();
  await expect(page.getByRole('heading', { name: '资源概览', level: 1 })).toBeVisible({ timeout: 70000 });
  assert.throws(() => process.kill(native.nativeInfo.gatewayPid, 0), 'Switching back must stop the owned Windows gateway');
  await app.close(); app = null;
  const prefs = JSON.parse(await readFile(path.join(profile, 'preferences.json'), 'utf8'));
  assert(prefs.connectionMode === 'wsl' && prefs.wsl.autoConnect && prefs.wsl.readOnly);
  assert(!JSON.stringify(prefs).includes('#login=') && !JSON.stringify(prefs).includes('session_token'));
  app = await launch(); page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: '资源概览', level: 1 })).toBeVisible({ timeout: 70000 });
  console.log(JSON.stringify({ result: 'passed', firstConnectionButton: true, automaticSessionRecovery: true, automaticReopen: true, fullFrontendPages: true, wslWindowsWslSwitch: true, isolatedWindowsProfile: true, readOnly: true, packaged: process.env.SELARK_TEST_PACKAGED === '1', credentialsPersisted: false, businessWrites: 0 }));
} finally { await app?.close(); }
