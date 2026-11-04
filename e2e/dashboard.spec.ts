import { expect, test } from '@playwright/test';
import fixture from '../src/mocks/fixture.json' with { type: 'json' };

test('five pages, filters, pagination and request details work without an API server', async ({ page }) => {
  const errors: string[] = [], urls: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => urls.push(request.url()));
  await page.goto('/');
  await expect(page.getByText('前端开发 · 模拟数据')).toBeVisible();
  await expect(page.locator('.metrics')).toBeVisible();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.locator('.pagination')).toContainText('26–50 / 65');
  await page.getByRole('button', { name: '详情', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('调用详情');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '用量分析', exact: true }).click();
  await page.getByLabel('连接', { exact: true }).selectOption('deepseek');
  await page.getByRole('button', { name: '应用筛选', exact: true }).click();
  await expect(page.locator('.pagination')).toContainText('1–22 / 22');
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await page.getByRole('button', { name: '应用管理', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cursor Workspace' })).toBeVisible();
  await page.getByRole('button', { name: '运行监控', exact: true }).click();
  await expect(page.getByRole('heading', { name: '网关状态：运行中' })).toBeVisible();
  await page.getByRole('button', { name: '连接与模型', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'OpenAI Demo' })).toBeVisible();
  expect(errors).toEqual([]);
  expect(urls.every(url => new URL(url).origin === 'http://127.0.0.1:5173')).toBe(true);
  expect(urls.some(url => new URL(url).pathname.startsWith('/api/'))).toBe(false);
});

test('model writes confirm defaults, enforce read-only and require a second action after a conflict', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.metrics')).toBeVisible();
  await page.getByRole('button', { name: '连接与模型', exact: true }).click();
  const section = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'OpenAI Demo', exact: true }) });
  const small = section.getByRole('row').filter({ hasText: 'demo-text-small' });
  await small.getByRole('button', { name: '启用', exact: true }).click();
  await expect(small).toContainText('已启用');
  const primary = section.getByRole('row').filter({ hasText: '默认模型' });
  page.once('dialog', dialog => void dialog.accept());
  await primary.getByRole('button', { name: '禁用', exact: true }).click();
  await expect(section).not.toContainText('默认模型');
  await page.getByLabel('场景', { exact: true }).selectOption('readonly');
  await expect(page.locator('.metrics')).toBeVisible();
  await page.getByRole('button', { name: '连接与模型', exact: true }).click();
  await expect(page.getByRole('button', { name: '启用', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '禁用', exact: true })).toHaveCount(0);
  await page.getByLabel('场景', { exact: true }).selectOption('conflict');
  await expect(page.locator('.metrics')).toBeVisible();
  await page.getByRole('button', { name: '连接与模型', exact: true }).click();
  await small.getByRole('button', { name: '启用', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('操作不会自动重试');
  await expect(small).toContainText('未启用');
  await small.getByRole('button', { name: '启用', exact: true }).click();
  await expect(small).toContainText('已启用');
});

test('empty, partial, failed, unknown and expired states remain distinct', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.metrics')).toBeVisible();
  const scenario = page.getByLabel('场景', { exact: true });
  await scenario.selectOption('empty');
  await expect(page.getByText('这个时段还没有调用记录。')).toBeVisible();
  await scenario.selectOption('unknown');
  await expect(page.locator('.metrics').getByText('未知', { exact: true })).toBeVisible();
  await scenario.selectOption('partial');
  await expect(page.getByText('用量账本暂不可读。', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '资源池' })).toBeVisible();
  await scenario.selectOption('error');
  await expect(page.getByText('暂时无法读取工作空间，请刷新重试。')).toBeVisible();
  await scenario.selectOption('expired');
  await expect(page.getByRole('heading', { name: '需要本机管理会话' })).toBeVisible();
  await expect(page.locator('.metrics')).toHaveCount(0);
});

test('all pages fit a phone viewport and support a dark theme', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.metrics')).toBeVisible();
  await page.getByRole('button', { name: '切换深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  for (const name of ['资源概览', '连接与模型', '用量分析', '应用管理', '运行监控']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: info.outputPath('mobile-dark.png'), fullPage: true });
});

test('production build uses same-origin HTTP, survives reload and clears data after a 401', async ({ page }) => {
  let exchanges = 0, expired = false;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
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
  await expect(page.locator('.metrics')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.locator('.dev-toolbar')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.metrics')).toBeVisible();
  expect(exchanges).toBe(1);
  expired = true;
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByRole('heading', { name: '需要本机管理会话' })).toBeVisible();
  await expect(page.locator('.metrics')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('selark-dashboard-session'))).toBeNull();
  expect(errors).toEqual([]);
});
