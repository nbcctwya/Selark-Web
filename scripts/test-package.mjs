import { _electron as electron, expect } from '@playwright/test';
import path from 'node:path';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

const root = path.resolve(import.meta.dirname, '..');
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const profile = path.join(root, `.test-profile-packaged-${Date.now()}`);
await mkdir(profile, { recursive: true });
const app = await electron.launch({ executablePath: path.join(root, 'release/win-unpacked/Selark.exe'), args: [`--user-data-dir=${profile}`], timeout: 20000 });
try {
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: '连接到你的工作空间' })).toBeVisible();
  const info = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion(), userData: app.getPath('userData'), metrics: app.getAppMetrics().length }));
  assert(info.packaged);
  assert.equal(info.version, version);
  const sandbox = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox);
  assert.equal(sandbox, true);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await page.screenshot({ path: path.join(root, 'artifacts/packaged-welcome.png') });
  await page.getByRole('button', { name: '手动连接', exact: true }).click();
  await page.getByText('连接诊断', { exact: true }).click();
  await page.getByLabel('Dashboard 地址', { exact: true }).fill('http://127.0.0.1:1');
  await page.getByRole('button', { name: '检查本机服务', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('无法连接 Dashboard');
  console.log(JSON.stringify({ result: 'passed', ...info, sandbox, offlineWindow: true }, null, 2));
} finally { await app.close(); }
