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
  await expect(sheet.getByRole('status')).toContainText('操作不会自动重试');
  await expect(conflicted).toHaveAttribute('aria-checked', 'false');
  await conflicted.click();
  await expect(conflicted).toHaveAttribute('aria-checked', 'true');
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
    const values: Record<string, unknown> = { '/api/snapshot': fixture.snapshot, '/api/records': { items: fixture.records.slice(0, 25), total: 65, offset: 0, limit: 25 }, '/api/logs': fixture.logs, '/api/backups': fixture.backups };
    await route.fulfill({ json: values[path] });
  });
  await page.goto('http://127.0.0.1:5174/#login=fixture-login');
  await expect(metrics(page)).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.locator('.dev-toolbar')).toHaveCount(0);
  await page.reload();
  await expect(metrics(page)).toBeVisible();
  expect(exchanges).toBe(1);

  // A 401 during a write clears every resource value and closes the open detail.
  const sheet = await openConnection(page, 'OpenAI Demo');
  expired = true;
  await sheet.getByRole('switch', { name: '启用 demo-text-small' }).click();
  await expect(page.getByRole('heading', { name: '需要本机管理会话' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('OpenAI Demo')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('selark-dashboard-session'))).toBeNull();
  expect(errors).toEqual([]);
});
