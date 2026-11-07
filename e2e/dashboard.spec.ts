import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import fixture from '../src/mocks/fixture.json' with { type: 'json' };

const metrics = (page: Page) => page.getByRole('region', { name: '所选范围的用量汇总' });
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true });
const pager = (page: Page) => page.getByRole('navigation', { name: '调用记录分页' });
async function scenario(page: Page, value: string) {
  await page.getByLabel('场景', { exact: true }).selectOption(value);
}
async function openConnection(page: Page, name: string) {
  await nav(page, '连接与模型').click();
  await page.getByRole('button', { name, exact: true }).click();
  const sheet = page.getByRole('dialog', { name });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('five pages, filters, pagination and request details work without an API server', async ({ page }) => {
  const errors: string[] = [], urls: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => urls.push(request.url()));
  await page.goto('/');
  await expect(page.getByText('前端开发 · 模拟数据')).toBeVisible();
  await expect(metrics(page)).toBeVisible();

  await nav(page, '用量分析').click();
  await expect(page.getByRole('heading', { name: '用量分析', level: 1 })).toBeVisible();
  await expect(pager(page)).toContainText('1–25 / 65');
  await pager(page).getByRole('button', { name: '下一页' }).click();
  await expect(pager(page)).toContainText('26–50 / 65');
  await page.getByRole('button', { name: /^查看 .+ 详情$/ }).first().click();
  const detail = page.getByRole('dialog');
  await expect(detail).toContainText('调用详情');
  await expect(detail).toContainText('上游结果');
  await expect(detail).toContainText('下游交付');
  await page.getByRole('button', { name: '关闭详情' }).click();
  await expect(detail).toHaveCount(0);

  await page.getByLabel('连接', { exact: true }).selectOption('deepseek');
  await expect(pager(page)).toContainText('1–22 / 22');
  await page.getByRole('radio', { name: '仅异常' }).click();
  await expect(page.getByRole('heading', { name: /异常调用/ })).toBeVisible();
  await page.getByRole('radio', { name: '全部' }).first().click();
  await page.getByRole('button', { name: '重置筛选' }).click();
  await expect(pager(page)).toContainText('1–25 / 65');

  await page.getByRole('radio', { name: '自定义' }).click();
  await page.getByLabel('开始时间').fill('2000-01-02T00:00');
  await page.getByLabel('结束时间').fill('2000-01-01T00:00');
  await page.getByRole('button', { name: '应用时间' }).click();
  await expect(page.getByRole('alert')).toContainText('结束晚于开始');
  await page.getByLabel('结束时间').fill('2000-01-03T00:00');
  await page.getByRole('button', { name: '应用时间' }).click();
  await expect(page.getByText('这个时段还没有调用记录').first()).toBeVisible();

  await nav(page, '应用管理').click();
  await expect(page.getByRole('heading', { name: 'Cursor Workspace' })).toBeVisible();
  await page.getByRole('button', { name: 'Cursor Workspace', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Cursor Workspace' })).toContainText('已扣除或预留 Token');
  await page.keyboard.press('Escape');
  await nav(page, '运行监控').click();
  await expect(page.getByRole('heading', { name: '运行中' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /异常调用/ })).toBeVisible();
  await nav(page, '连接与模型').click();
  await expect(page.getByRole('heading', { name: 'OpenAI Demo' })).toBeVisible();
  // Hidden tabs stop their freshness clock as well as API polling, then refresh on return.
  await expect(page.getByRole('button', { name: '刷新', exact: true })).toBeEnabled();
  await page.clock.install();
  const freshness = page.locator('.freshness');
  const before = await freshness.innerText();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(120000);
  await expect(freshness).toHaveText(before);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: '刷新', exact: true })).toBeEnabled();
  await expect(freshness).toHaveText('刚刚更新');
  expect(errors).toEqual([]);
  expect(urls.every(url => new URL(url).origin === 'http://127.0.0.1:5173')).toBe(true);
  expect(urls.some(url => new URL(url).pathname.startsWith('/api/'))).toBe(false);
});

test('model writes confirm defaults, enforce read-only and require a second action after a conflict', async ({ page }) => {
  await page.goto('/');
  await expect(metrics(page)).toBeVisible();
  let sheet = await openConnection(page, 'OpenAI Demo');
  const small = sheet.getByRole('switch', { name: '启用 demo-text-small' });
  await expect(small).toHaveAttribute('aria-checked', 'false');
  await small.click();
  await expect(small).toHaveAttribute('aria-checked', 'true');
  await expect(sheet.getByRole('status')).toContainText('demo-text-small 已启用');
  await expect(sheet.getByText('默认模型', { exact: true })).toHaveCount(1);

  const primary = sheet.getByRole('switch', { name: '启用 demo-text', exact: true });
  await primary.click();
  const confirm = page.getByRole('dialog', { name: '禁用默认模型？' });
  await expect(confirm).toContainText('清除默认值');
  await confirm.getByRole('button', { name: '取消' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(primary).toHaveAttribute('aria-checked', 'true');
  await primary.click();
  await page.getByRole('button', { name: '禁用并清除默认' }).click();
  await expect(primary).toHaveAttribute('aria-checked', 'false');
  await expect(sheet.getByText('默认模型', { exact: true })).toHaveCount(0);
  await expect(sheet.getByRole('status')).toContainText('默认模型已清除');
  await page.getByRole('button', { name: '关闭详情' }).click();

  await scenario(page, 'readonly');
  await expect(metrics(page)).toBeVisible();
  sheet = await openConnection(page, 'OpenAI Demo');
  await expect(sheet).toContainText('只读模式');
  await expect(sheet.getByRole('switch')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭详情' }).click();
  await expect(page.getByRole('main')).toContainText('只读模式');

  await scenario(page, 'conflict');
  await expect(metrics(page)).toBeVisible();
  sheet = await openConnection(page, 'OpenAI Demo');
  const conflicted = sheet.getByRole('switch', { name: '启用 demo-text-small' });
  await conflicted.click();
  await expect(sheet.getByRole('alert')).toContainText('操作不会自动重试');
  await expect(conflicted).toHaveAttribute('aria-checked', 'false');
  await conflicted.click();
  await expect(conflicted).toHaveAttribute('aria-checked', 'true');
});

test('connections can be created, discovered, approved, defaulted and edited without echoing keys', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(metrics(page)).toBeVisible();
  await nav(page, '连接与模型').click();
  await page.getByRole('button', { name: '新建连接' }).click();
  const create = page.getByRole('dialog', { name: '新建连接' });
  await expect(create.getByRole('radio', { name: /OpenAI/ }).first()).toBeEnabled();
  await create.getByRole('radio', { name: /通用 API（OpenAI 兼容）/ }).click();
  await create.getByRole('button', { name: '创建连接' }).click();
  await expect(create.getByText('此供应商需要填写接口地址。')).toBeVisible();
  await create.getByLabel('连接 ID').fill('deepseek');
  await create.getByLabel('接口地址').fill('http://relay.example/v1');
  await create.getByLabel('API Key').fill('sk-fixture-only');
  await expect(create.getByText('该连接 ID 已存在。')).toBeVisible();
  await expect(create.getByText('非本机地址必须使用 HTTPS。')).toBeVisible();
  await create.getByLabel('连接 ID').fill('my-relay');
  await create.getByLabel('接口地址').fill('https://relay.example/v1');
  await expect(create.getByLabel('API Key')).toHaveAttribute('type', 'password');
  await create.getByRole('button', { name: '创建连接' }).click();

  const sheet = page.getByRole('dialog', { name: '通用 API（OpenAI 兼容）' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('目录中还没有模型')).toBeVisible();
  await sheet.getByRole('button', { name: '发现模型' }).click();
  await expect(sheet.getByRole('status')).toContainText('新模型不会自动启用');
  await expect(sheet.getByRole('switch', { name: '启用 demo-text', exact: true })).toHaveAttribute('aria-checked', 'false');
  await sheet.getByRole('button', { name: '启用目录全部' }).click();
  await expect(sheet.getByRole('switch', { name: '启用 demo-text', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(sheet.getByText('默认模型', { exact: true })).toHaveCount(0);
  await sheet.getByRole('button', { name: '将 demo-text 设为默认模型' }).click();
  await expect(sheet.getByText('默认模型', { exact: true })).toHaveCount(1);

  await sheet.getByRole('checkbox', { name: '选择 demo-text', exact: true }).check();
  await sheet.getByRole('checkbox', { name: '选择 demo-text-small' }).check();
  await sheet.getByRole('button', { name: '禁用所选' }).click();
  await expect(page.getByRole('dialog', { name: '禁用默认模型？' })).toContainText('本次将禁用 2 个模型');
  await page.getByRole('button', { name: '禁用并清除默认' }).click();
  await expect(sheet.getByRole('switch', { name: '启用 demo-text-small' })).toHaveAttribute('aria-checked', 'false');
  await expect(sheet.getByText('默认模型', { exact: true })).toHaveCount(0);

  await sheet.getByRole('tab', { name: '设置' }).click();
  await sheet.getByLabel('显示名称').fill('我的中转');
  await sheet.getByRole('button', { name: '更换 Key' }).click();
  await sheet.getByLabel('新的 API Key').fill('sk-rotated-fixture');
  await expect(sheet.getByText('2 项修改')).toBeVisible();
  await sheet.getByRole('button', { name: '保存修改' }).click();
  const renamed = page.getByRole('dialog', { name: '我的中转' });
  await expect(renamed.getByRole('status')).toContainText('已保存');
  await expect(renamed.getByLabel('新的 API Key')).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  expect(await page.content()).not.toContain('sk-rotated-fixture');
  await renamed.getByRole('switch', { name: '启用连接' }).click();
  await renamed.getByRole('button', { name: '保存修改' }).click();
  await page.getByRole('button', { name: '停用并保存' }).click();
  await expect(page.getByRole('dialog', { name: '我的中转' })).toContainText('已停用');
  expect(errors).toEqual([]);
});

test('discovery failures keep the old catalog and offline mode closes discovery only', async ({ page }) => {
  await page.goto('/');
  await expect(metrics(page)).toBeVisible();
  await scenario(page, 'discovery-error');
  await expect(metrics(page)).toBeVisible();
  let sheet = await openConnection(page, 'OpenAI Demo');
  await sheet.getByRole('button', { name: '重新发现' }).click();
  await expect(sheet.getByRole('alert')).toContainText('发现失败');
  await expect(sheet.getByRole('alert')).toContainText('已保留上次目录');
  await expect(sheet.getByRole('switch', { name: '启用 demo-text', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭详情' }).click();

  await scenario(page, 'offline-mode');
  await expect(metrics(page)).toBeVisible();
  await expect(page.getByText('离线管理')).toBeVisible();
  sheet = await openConnection(page, 'OpenAI Demo');
  await expect(sheet.getByRole('button', { name: '重新发现' })).toBeDisabled();
  await expect(sheet.getByRole('switch', { name: '启用 demo-text-small' })).toBeEnabled();
  await page.getByRole('button', { name: '关闭详情' }).click();
  await nav(page, '应用管理').click();
  await expect(page.getByRole('button', { name: '新建应用' })).toBeEnabled();

  await scenario(page, 'readonly');
  await expect(metrics(page)).toBeVisible();
  await nav(page, '应用管理').click();
  await expect(page.getByRole('button', { name: '新建应用' })).toBeDisabled();
  await nav(page, '连接与模型').click();
  await expect(page.getByRole('button', { name: '新建连接' })).toBeDisabled();
});

test('applications show a one-time token, edit policies with revisions and revoke after confirmation', async ({ page }) => {
  await page.goto('/');
  await expect(metrics(page)).toBeVisible();
  await nav(page, '应用管理').click();
  await page.getByRole('button', { name: '新建应用' }).click();
  let create = page.getByRole('dialog', { name: '新建应用' });
  await create.getByRole('button', { name: '创建并生成令牌' }).click();
  await expect(create.getByText('请输入应用名称。')).toBeVisible();
  await create.getByLabel('应用名称').fill('我的编辑器');
  await create.getByRole('radiogroup', { name: '允许连接' }).getByRole('radio', { name: '指定' }).click();
  await expect(create.getByText('请选择至少一个连接')).toBeVisible();
  await create.getByRole('checkbox', { name: /DeepSeek/ }).check();
  await create.getByLabel('日 Token 上限').fill('0');
  await create.getByRole('button', { name: '创建并生成令牌' }).click();
  await expect(create.getByText(/请输入 1–/).first()).toBeVisible();
  await create.getByLabel('日 Token 上限').fill('100000');
  await create.getByRole('button', { name: '创建并生成令牌' }).click();
  const token = create.getByLabel('一次性调用令牌');
  await expect(token).toHaveValue(/^demo-only-not-a-real-token-/);
  await expect(create).toContainText('这是唯一一次显示此令牌');
  await create.getByRole('button', { name: '我已保存，关闭' }).click();
  await expect(page.getByLabel('一次性调用令牌')).toHaveCount(0);
  expect(await page.content()).not.toContain('demo-only-not-a-real-token');
  await page.getByRole('button', { name: '新建应用' }).click();
  create = page.getByRole('dialog', { name: '新建应用' });
  await expect(create.getByLabel('一次性调用令牌')).toHaveCount(0);
  await create.getByRole('button', { name: '关闭详情' }).click();

  await page.getByRole('button', { name: '我的编辑器', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: '我的编辑器' });
  await sheet.getByRole('tab', { name: '策略与撤销' }).click();
  await expect(sheet.getByLabel('日 Token 上限')).toHaveValue('100000');
  await sheet.getByLabel('并发上限').fill('2');
  await sheet.getByRole('button', { name: '保存策略' }).click();
  await expect(sheet.getByRole('status')).toContainText('策略已保存（1 项）');
  await sheet.getByRole('button', { name: '撤销令牌' }).click();
  const confirm = page.getByRole('dialog', { name: '撤销「我的编辑器」？' });
  await confirm.getByRole('button', { name: '取消' }).click();
  await expect(sheet.getByRole('button', { name: '撤销令牌' })).toBeVisible();
  await sheet.getByRole('button', { name: '撤销令牌' }).click();
  await page.getByRole('button', { name: '永久撤销' }).click();
  await expect(sheet.getByText(/令牌已撤销.*已接纳的请求继续完成/)).toBeVisible();
  await expect(sheet).toContainText('应用 · 已撤销');
  await expect(sheet.getByRole('button', { name: '撤销令牌' })).toHaveCount(0);
});

test('a policy conflict refreshes the form and never resends the edit', async ({ page }) => {
  await page.goto('/');
  await expect(metrics(page)).toBeVisible();
  await scenario(page, 'conflict');
  await expect(metrics(page)).toBeVisible();
  await nav(page, '应用管理').click();
  await page.getByRole('button', { name: 'Personal Notebook', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Personal Notebook' });
  await sheet.getByRole('tab', { name: '策略与撤销' }).click();
  await sheet.getByLabel('每分钟请求').fill('30');
  await sheet.getByRole('button', { name: '保存策略' }).click();
  await expect(sheet.getByRole('alert')).toContainText('表单已重置为最新策略');
  await expect(sheet.getByLabel('每分钟请求')).toHaveValue('');
  await sheet.getByLabel('每分钟请求').fill('30');
  await sheet.getByRole('button', { name: '保存策略' }).click();
  await expect(sheet.getByRole('status')).toContainText('策略已保存');
});

test('empty, partial, failed, unknown, offline and expired states remain distinct', async ({ page }) => {
  await page.goto('/');
  await expect(metrics(page)).toBeVisible();
  await scenario(page, 'empty');
  await expect(page.getByRole('heading', { name: /最近调用/ })).toBeVisible();
  await expect(page.getByText('这个时段还没有调用记录').first()).toBeVisible();
  await expect(page.getByText('还没有连接')).toBeVisible();

  await scenario(page, 'unknown');
  await expect(metrics(page).getByText('未知', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('未知用量 · 已暂停').first()).toBeVisible();

  await scenario(page, 'partial');
  await expect(page.getByText('用量账本暂不可读').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /资源池/ })).toBeVisible();
  await expect(page.getByText('调用记录暂不可读', { exact: true })).toBeVisible();

  await scenario(page, 'offline');
  await expect(metrics(page)).toBeVisible();
  await expect(page.getByRole('region', { name: '工作空间状态' }).getByText('网关离线')).toBeVisible();
  await nav(page, '运行监控').click();
  await expect(page.getByRole('heading', { name: '离线或响应无效' })).toBeVisible();
  await expect(page.getByText('不代表服务停止或队列为零', { exact: false })).toBeVisible();

  await scenario(page, 'error');
  await expect(page.getByText('暂时无法读取工作空间，请刷新重试。')).toBeVisible();

  await scenario(page, 'expired');
  await expect(page.getByRole('heading', { name: '需要本机管理会话' })).toBeVisible();
  await expect(metrics(page)).toHaveCount(0);
});

test('slow loads show progress and stay navigable', async ({ page }) => {
  await page.goto('/');
  await expect(metrics(page)).toBeVisible();
  await scenario(page, 'slow');
  await expect(page.getByRole('status', { name: '正在读取工作空间' })).toBeVisible();
  await nav(page, '应用管理').click();
  await expect(page.getByRole('heading', { name: '应用管理', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cursor Workspace' })).toBeVisible({ timeout: 8000 });
});

test('keyboard shortcuts, command palette and chart readout are usable without a mouse', async ({ page }) => {
  await page.goto('/');
  await expect(metrics(page)).toBeVisible();
  await page.keyboard.press('3');
  await expect(page.getByRole('heading', { name: '用量分析', level: 1 })).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: '命令面板' });
  await expect(palette).toBeVisible();
  await page.keyboard.type('Cursor');
  await page.keyboard.press('Enter');
  await expect(palette).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Cursor Workspace' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('1');
  const chart = page.getByRole('img', { name: /Token每日趋势/ });
  await chart.focus();
  await page.keyboard.press('Home');
  await expect(page.locator('.readout').first()).toContainText('UTC');
});

test('all pages fit a phone viewport and support a dark theme', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(metrics(page)).toBeVisible();
  await page.getByRole('button', { name: '切换深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  for (const name of ['资源概览', '连接与模型', '用量分析', '应用管理', '运行监控']) {
    await nav(page, name).click();
    await expect(page.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await openConnection(page, 'MiMo');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('mobile-dark.png') });
  await page.getByRole('button', { name: '关闭详情' }).click();
  await page.getByRole('button', { name: '切换浅色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('production build uses same-origin HTTP under CSP, survives reload and clears data after a 401', async ({ page }) => {
  let exchanges = 0, expired = false;
  const snapshot = structuredClone(fixture.snapshot);
  for (const app of snapshot.applications) app.id = `caller_${'a'.repeat(24)}_${app.id}`;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // The intentional 401 response is logged by the browser; anything else (e.g. a CSP violation) is a failure.
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) errors.push(message.text()); });
  await page.route('http://127.0.0.1:5174/', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" } });
  });
  await page.route('http://127.0.0.1:5174/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/api/session') {
      exchanges++;
      expect(request.postDataJSON()).toEqual({ token: 'fixture-login' });
      expect(request.headers().origin).toBe('http://127.0.0.1:5174');
      await route.fulfill({ json: { authenticated: true, expires_in: 28800, session_token: 'fixture-browser-session' } });
      return;
    }
    expect(request.headers()['x-selark-dashboard']).toBe('1');
    expect(request.headers()['x-selark-session']).toBe('fixture-browser-session');
    expect(request.headers().cookie).toBeUndefined();
    if (expired) { await route.fulfill({ status: 401, json: { error: '管理会话已失效。' } }); return; }
    const values: Record<string, unknown> = { '/api/snapshot': snapshot, '/api/records': { items: fixture.records.slice(0, 25), total: 65, offset: 0, limit: 25 }, '/api/logs': fixture.logs, '/api/backups': fixture.backups, '/api/capabilities': fixture.management.capabilities };
    if (!(path in values)) throw new Error(`Unexpected API request ${request.method()} ${path}`);
    await route.fulfill({ json: values[path] });
  });
  // Every entry point must expire the whole dashboard, including reads started by a sheet.
  for (const entry of ['write', 'providers', 'connection', 'application']) {
    expired = false;
    await page.goto('about:blank');
    await page.goto('http://127.0.0.1:5174/#login=fixture-login');
    await expect(metrics(page)).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
    await expect(page.locator('.dev-toolbar')).toHaveCount(0);
    const previousExchanges = exchanges;
    await page.reload();
    await expect(metrics(page)).toBeVisible();
    expect(exchanges).toBe(previousExchanges);

    if (entry === 'application') {
      await page.setViewportSize({ width: 390, height: 844 });
      await nav(page, '应用管理').click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: 'Cursor Workspace', exact: true }).click();
      expired = true;
      await page.getByRole('tab', { name: '策略与撤销' }).click();
    } else if (entry === 'providers') {
      await nav(page, '连接与模型').click();
      expired = true;
      await page.getByRole('button', { name: '新建连接' }).click();
    } else {
      const sheet = await openConnection(page, 'OpenAI Demo');
      expired = true;
      if (entry === 'write') await sheet.getByRole('switch', { name: '启用 demo-text-small' }).click();
      else await sheet.getByRole('tab', { name: '设置' }).click();
    }
    await expect(page.getByRole('heading', { name: '需要本机管理会话' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('OpenAI Demo')).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('selark-dashboard-session'))).toBeNull();
  }
  expect(errors).toEqual([]);
});
