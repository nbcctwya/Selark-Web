import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const profile = path.join(root, `.test-profile-native-ui-${Date.now()}`);
const workspaceA = path.join(profile, 'Windows A 中文');
const workspaceB = path.join(profile, 'Windows B');
await mkdir(profile, { recursive: true });
await mkdir(path.join(root, 'artifacts'), { recursive: true });
const freePort = async () => {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
};
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
await writeFile(path.join(profile, 'preferences.json'), JSON.stringify({ windows: { configDir: workspaceA, initialPort: await freePort(), autoConnect: true, readOnly: false, keepRunning: false }, wsl: { distribution: '', autoConnect: true } }));
const packaged = process.env.SELARK_TEST_PACKAGED === '1' || !!process.env.SELARK_TEST_APP;
const launch = () => electron.launch(packaged
  ? { executablePath: process.env.SELARK_TEST_APP || path.join(root, 'release/win-unpacked/Selark.exe'), args: [`--user-data-dir=${profile}`], timeout: 30000 }
  : { args: [root], env: { ...process.env, SELARK_TEST_PROFILE: profile }, timeout: 30000 });
let app;
let gatewayPid;
const errors = [];
try {
  app = await launch();
  const actualProfile = await app.evaluate(({ app }) => app.getPath('userData'));
  assert.equal(path.resolve(actualProfile).toLowerCase(), profile.toLowerCase());
  let page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  await expect(page.getByRole('button', { name: 'Windows 本地', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(root, `artifacts/native-${packaged ? 'packaged' : 'development'}-welcome.png`) });
  await page.getByRole('button', { name: '打开 Windows 工作空间', exact: true }).click();
  await expect(page.getByRole('heading', { name: '资源概览', level: 1 })).toBeVisible({ timeout: 60000 });
  let config = await page.evaluate(() => window.selark.config());
  assert.equal(config.connectionMode, 'windows');
  assert.equal(config.nativeInfo.configDir, workspaceA);
  gatewayPid = config.nativeInfo.gatewayPid;
  const create = await page.evaluate(async () => window.selark.request({ id: crypto.randomUUID(), path: '/api/connections', method: 'POST', body: { id: 'saved-example', name: 'Windows 本地测试连接', provider: 'openai-compatible', api_key: 'fixture-only-key', base_url: 'http://127.0.0.1:1/v1' } }));
  assert.equal(create.status, 201);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.evaluate(() => window.selark.clearSession());
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByText('管理会话已自动恢复。如刚才正在保存，请核对操作结果。', { exact: true })).toBeVisible({ timeout: 60000 });
  assert.equal((await page.evaluate(() => window.selark.config())).nativeInfo.gatewayPid, gatewayPid);
  await page.getByRole('button', { name: '切换后端', exact: true }).click();
  await page.getByRole('button', { name: 'WSL 自动连接', exact: true }).click();
  await expect(page.getByRole('button', { name: '连接 WSL 工作空间', exact: true })).toBeVisible();
  assert(alive(gatewayPid), 'Opening the selector must not stop an active gateway');
  await page.getByRole('button', { name: '返回当前工作空间', exact: true }).click();
  await expect(page.getByRole('heading', { name: '资源概览', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: '切换后端', exact: true }).click();
  await page.getByText('Windows 设置', { exact: true }).click();
  await page.getByLabel('Windows 配置目录', { exact: true }).fill(workspaceB);
  await page.getByLabel('新工作空间网关端口', { exact: true }).fill(String(await freePort()));
  await page.getByRole('button', { name: '打开 Windows 工作空间', exact: true }).click();
  await expect(page.getByRole('heading', { name: '资源概览', level: 1 })).toBeVisible({ timeout: 60000 });
  assert(!alive(gatewayPid));
  config = await page.evaluate(() => window.selark.config());
  gatewayPid = config.nativeInfo.gatewayPid;
  const fresh = await page.evaluate(() => window.selark.request({ id: crypto.randomUUID(), path: '/api/snapshot', method: 'GET' }));
  assert.deepEqual(fresh.body.connections, []);
  await page.getByRole('button', { name: '切换后端', exact: true }).click();
  await page.getByText('Windows 设置', { exact: true }).click();
  await page.getByLabel('Windows 配置目录', { exact: true }).fill(workspaceA);
  await page.getByRole('button', { name: '打开 Windows 工作空间', exact: true }).click();
  await expect(page.getByRole('heading', { name: '资源概览', level: 1 })).toBeVisible({ timeout: 60000 });
  assert(!alive(gatewayPid));
  gatewayPid = (await page.evaluate(() => window.selark.config())).nativeInfo.gatewayPid;
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '连接与模型', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Windows 本地测试连接', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(root, `artifacts/native-${packaged ? 'packaged' : 'development'}-connected.png`) });
  // Local configuration only: no discovery, quota refresh or generation with this fake key.
  const kimi = await page.evaluate(async () => window.selark.request({ id: crypto.randomUUID(), path: '/api/connections', method: 'POST', body: { id: 'kimi-fixture', provider: 'kimi-code', name: 'Kimi 档位测试', api_key: 'fixture-only-key' } }));
  assert.equal(kimi.status, 201);
  const approval = await page.evaluate(async revision => window.selark.request({ id: crypto.randomUUID(), path: '/api/connections/kimi-fixture/models/approval', method: 'POST', body: { revision, models: ['k3.1-pro', 'kimi-for-coding-highspeed'], enabled: true } }), kimi.body.approval_revision);
  assert.equal(approval.status, 200);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.getByRole('button', { name: 'Kimi 档位测试', exact: true }).click();
  const kimiSheet = page.getByRole('dialog', { name: 'Kimi 档位测试', exact: true });
  await kimiSheet.getByRole('tab', { name: '客户端接入' }).click();
  config = await page.evaluate(() => window.selark.config());
  await expect(kimiSheet.getByLabel('Selark API 地址')).toHaveValue(config.nativeInfo.gatewayUrl);
  await kimiSheet.getByLabel('接入模型').selectOption('k3.1-pro');
  assert.deepEqual(await kimiSheet.getByLabel('客户端默认档位').locator('option').allTextContents(), ['不指定', 'low', 'high', 'max']);
  await kimiSheet.getByRole('button', { name: '复制 DSH 配置' }).click();
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  assert(copied.includes('kimi-fixture::k3.1-pro') && copied.includes('max: "max"'));
  assert(!copied.includes('medium:') && !copied.includes('xhigh:'));
  assert(copied.includes(config.nativeInfo.gatewayUrl.replace(/\/$/, '') + '/v1'));
  assert(!copied.includes('fixture-only-key'));
  await page.screenshot({ path: path.join(root, 'artifacts/native-dsh-setup.png') });
  await kimiSheet.getByLabel('接入模型').selectOption('kimi-for-coding-highspeed');
  assert.deepEqual(await kimiSheet.getByLabel('客户端默认档位').locator('option').allTextContents(), ['不指定']);
  await expect(kimiSheet.getByRole('status').first()).toContainText('不支持调整档位');
  assert((await kimiSheet.getByLabel('DSH 配置', { exact: true }).inputValue()).includes('reasoningEfforts: false'));
  await page.keyboard.press('Escape');
  const openai = await page.evaluate(async () => window.selark.request({ id: crypto.randomUUID(), path: '/api/connections', method: 'POST', body: { id: 'openai-effort-fixture', provider: 'openai', name: 'OpenAI 档位测试', api_key: 'fixture-only-key' } }));
  assert.equal(openai.status, 201);
  const approved = await page.evaluate(async revision => window.selark.request({ id: crypto.randomUUID(), path: '/api/connections/openai-effort-fixture/models/approval', method: 'POST', body: { revision, models: ['gpt-6-luna', 'gpt-5.1', 'gpt-5.2', 'gpt-image-2.6-flare'], enabled: true } }), openai.body.approval_revision);
  assert.equal(approved.status, 200);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.getByRole('button', { name: 'OpenAI 档位测试', exact: true }).click();
  const apiSheet = page.getByRole('dialog', { name: 'OpenAI 档位测试', exact: true });
  await expect(apiSheet.getByText('已识别 5 档推理 · low / medium / high / xhigh / max', { exact: true })).toBeVisible();
  await expect(apiSheet.getByText('已识别 3 档推理 · low / medium / high', { exact: true })).toBeVisible();
  await apiSheet.getByRole('tab', { name: '客户端接入' }).click();
  await apiSheet.getByLabel('接入模型').selectOption('gpt-5.1');
  assert.deepEqual(await apiSheet.getByLabel('客户端默认档位').locator('option').allTextContents(), ['不指定', 'low', 'medium', 'high']);
  await apiSheet.getByLabel('接入模型').selectOption('gpt-5.2');
  assert.deepEqual(await apiSheet.getByLabel('客户端默认档位').locator('option').allTextContents(), ['不指定', 'low', 'medium', 'high', 'xhigh']);
  await apiSheet.getByLabel('接入模型').selectOption('gpt-image-2.6-flare');
  await expect(apiSheet.getByRole('button', { name: '复制 DSH 配置' })).toBeDisabled();
  await apiSheet.getByLabel('接入模型').selectOption('gpt-6-luna');
  assert.deepEqual(await apiSheet.getByLabel('客户端默认档位').locator('option').allTextContents(), ['不指定', 'low', 'medium', 'high', 'xhigh', 'max']);
  await expect(apiSheet.getByLabel('接入协议')).toHaveValue('openai-responses');
  await apiSheet.getByLabel('客户端默认档位').selectOption('xhigh');
  await apiSheet.getByRole('button', { name: '保存模型选项' }).click();
  await apiSheet.getByRole('button', { name: '复制 DSH 配置' }).click();
  const apiConfig = await app.evaluate(({ clipboard }) => clipboard.readText());
  assert(apiConfig.includes('xhigh: "xhigh"') && apiConfig.includes('reasoning: xhigh'));
  assert(!apiConfig.includes('personal_coding') && !apiConfig.includes('fixture-only-key'));
  await page.screenshot({ path: path.join(root, 'artifacts/native-openai-agent-setup.png') });
  await page.keyboard.press('Escape');
  // Recognized platform capabilities must produce usable exports in the packaged UI,
  // without discovering models or invoking an upstream with these fixture credentials.
  for (const [provider, cases] of [
    ['zhipu', [['glm-5.3', ['low', 'high', 'max']], ['glm-5.2', ['high', 'max']], ['glm-4.7', []]]],
    ['kimi', [['kimi-k3.1-pro', ['low', 'high', 'max']], ['kimi-k2.6', []], ['kimi-k2.7-code', []]]],
    ['mimo', [['mimo-v2.6-pro', []]]],
    ['anthropic', [['claude-sonnet-4-5-20250929', []], ['claude-opus-4-6', ['low', 'medium', 'high', 'max']]]],
    ['deepseek', [['deepseek-v4-pro', ['low', 'high', 'max']]]],
  ]) {
    const name = `${provider} 能力测试`, id = `${provider}-cap-fixture`;
    const created = await page.evaluate(async ({ id, name, provider }) => window.selark.request({ id: crypto.randomUUID(), path: '/api/connections', method: 'POST', body: { id, name, provider, api_key: 'fixture-only-key' } }), { id, name, provider });
    assert.equal(created.status, 201);
    const approved = await page.evaluate(async ({ id, revision, models }) => window.selark.request({ id: crypto.randomUUID(), path: `/api/connections/${id}/models/approval`, method: 'POST', body: { revision, models, enabled: true } }), { id, revision: created.body.approval_revision, models: cases.map(([model]) => model) });
    assert.equal(approved.status, 200);
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    const sheet = page.getByRole('dialog', { name, exact: true });
    await sheet.getByRole('tab', { name: '客户端接入' }).click();
    for (const [model, tiers] of cases) {
      await sheet.getByLabel('接入模型').selectOption(model);
      assert.deepEqual(await sheet.getByLabel('客户端默认档位').locator('option').allTextContents(), ['不指定', ...tiers]);
      await expect(sheet.getByRole('button', { name: '复制 DSH 配置' })).toBeEnabled();
      const output = await sheet.getByLabel('DSH 配置', { exact: true }).inputValue();
      assert(output.includes(`${id}::${model}`) && !output.includes('fixture-only-key'));
      if (tiers.length === 0) {
        await expect(sheet.getByLabel('客户端默认档位')).toBeDisabled();
        assert(output.includes('reasoningEfforts: false'));
      }
      if (model === 'mimo-v2.6-pro') {
        await expect(sheet.getByText('思考开关 · 无强度档位', { exact: true })).toBeVisible();
        await sheet.getByText('其他客户端 · 请求示例', { exact: true }).click();
        assert.deepEqual(JSON.parse(await sheet.getByLabel('请求 JSON').inputValue()).thinking, { type: 'enabled' });
        await page.screenshot({ path: path.join(root, 'artifacts/native-mimo-capabilities.png') });
      }
    }
    await page.keyboard.press('Escape');
  }
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '应用管理', exact: true }).click();
  await page.getByRole('button', { name: '新建应用', exact: true }).click();
  const applicationCreate = page.getByRole('dialog', { name: '新建应用', exact: true });
  await applicationCreate.getByLabel('应用名称').fill('策略保存测试');
  await applicationCreate.getByRole('button', { name: '创建并生成令牌' }).click();
  await expect(applicationCreate.getByLabel('一次性调用令牌')).not.toHaveValue('');
  await applicationCreate.getByRole('button', { name: '我已保存，关闭' }).click();
  await page.getByRole('button', { name: '策略保存测试', exact: true }).click();
  const policy = page.getByRole('dialog', { name: '策略保存测试', exact: true });
  await policy.getByRole('tab', { name: '策略与撤销' }).click();
  await expect(policy.getByRole('button', { name: '保存策略' })).toBeDisabled();
  await policy.getByLabel('日 Token 上限').fill('12345');
  await policy.getByRole('button', { name: '保存策略' }).click();
  await expect(policy.getByRole('status')).toContainText('策略已保存（1 项）');
  await page.keyboard.press('Escape');
  await app.close(); app = null;
  await expect.poll(() => alive(gatewayPid), { timeout: 15000 }).toBe(false);
  const preferences = await readFile(path.join(profile, 'preferences.json'), 'utf8');
  assert(!/fixture-only-key|session_token|#login=/.test(preferences));
  // Reopen the current workspace and verify its saved policy is unchanged.
  app = await launch(); page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: '资源概览', level: 1 })).toBeVisible({ timeout: 60000 });
  config = await page.evaluate(() => window.selark.config());
  assert.equal(config.nativeInfo.configDir, workspaceA);
  gatewayPid = config.nativeInfo.gatewayPid;
  const applications = await page.evaluate(async () => window.selark.request({ id: crypto.randomUUID(), path: '/api/applications', method: 'GET' }));
  assert.equal(applications.status, 200);
  const upgraded = applications.body.items.find(item => item.name === '策略保存测试');
  assert.equal(upgraded.policy.daily_token_limit, 12345);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '连接与模型', exact: true }).click();
  await page.getByRole('button', { name: 'OpenAI 档位测试', exact: true }).click();
  await page.getByRole('tab', { name: '客户端接入' }).click();
  await page.getByLabel('接入模型').selectOption('gpt-6-luna');
  await expect(page.getByLabel('客户端默认档位')).toHaveValue('xhigh');
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  const result = { passed: true, packaged, windowsFirstRun: true, selectionKeepsCurrentGateway: true, workspaceIsolation: true, sessionRenewalWithoutGatewayRestart: true, autoReconnect: true, dshNativeAddressAndClipboard: true, kimiExactlyThreeTiers: true, gptVersionSpecificTiers: true, imageModelsExcludedFromChat: true, highspeedHasNoAdjustableEffort: true, openaiNativeResponsesEffort: true, otherPlatformEffortSwitchAndBudget: true, modelOptionsPersistAcrossRelaunch: true, credentialsPersisted: false, realProviderRequests: 0 };
  Object.assign(result, { applicationPolicySave: true, policyPersistsAcrossRelaunch: true });
  await writeFile(path.join(root, `artifacts/native-ui-${packaged ? 'packaged' : 'development'}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (app) {
    const page = await app.firstWindow();
    await page.screenshot({ path: path.join(root, 'artifacts/native-failure.png') }).catch(() => {});
    const status = await page.getByRole('status').allTextContents();
    console.error('Native UI status:', status);
  }
  throw error;
} finally {
  await app?.close();
  if (gatewayPid) await expect.poll(() => alive(gatewayPid), { timeout: 15000 }).toBe(false);
}
