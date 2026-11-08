import { _electron as electron, expect } from '@playwright/test';
import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createTestServer } from './mock-server.mjs';

const root = path.resolve(import.meta.dirname, '..');
const { version: desktopVersion } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const work = path.join(root, '.benchmark', desktopVersion);
const baseline = path.join(work, 'baseline');
const host = path.join(work, 'host');
const { revision: baselineRef } = JSON.parse(await readFile(path.join(root, 'frontend-baseline.json'), 'utf8'));
async function prepare() {
await mkdir(work, { recursive: true });
if (process.env.SELARK_BENCH_BASELINE) {
  for (const file of ['src', 'contracts', 'vite.config.ts', 'index.html', 'package.json']) {
    await cp(path.join(process.env.SELARK_BENCH_BASELINE, file), path.join(baseline, file), { recursive: true });
  }
} else {
const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', baselineRef], { cwd: root, encoding: 'utf8', windowsHide: true }).trim().split('\n');
for (const file of paths.filter(file => /^(src\/|contracts\/|vite.config.ts$|index.html$|package.json$)/.test(file))) {
  const target = path.join(baseline, file); await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, execFileSync('git', ['show', `${baselineRef}:${file}`], { cwd: root, windowsHide: true }));
}
}
// Both versions use exactly the same native transport, login view and Electron host.
// Baseline App, dashboard loading hook, pages and styles remain upstream's original.
for (const file of ['src/main.tsx', 'src/api/http.ts']) await cp(path.join(root, file), path.join(baseline, file));
await cp(path.join(root, 'src/desktop'), path.join(baseline, 'src/desktop'), { recursive: true });
await build({ root: baseline, configFile: path.join(baseline, 'vite.config.ts'), build: { outDir: path.join(work, 'baseline-dist') }, logLevel: 'warn' });
await cp(path.join(root, 'electron'), host, { recursive: true });
const mainSource = await readFile(path.join(host, 'main.cjs'), 'utf8');
await writeFile(path.join(host, 'main.cjs'), mainSource.replace("const root = path.resolve(__dirname, '../dist');", 'const root = process.env.SELARK_BENCH_RENDERER;'));
}

const report = { measuredAt: new Date().toISOString(), desktopVersion, platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0].model, electron: JSON.parse(await readFile(path.join(root, 'node_modules/electron/package.json'))).version, baselineRef, workload: 'Same synthetic 65 records; 15 ms local response delay; 10 alternating record-page changes. Same native host and transport. Foreground idle at default settings: upstream auto-refresh on, desktop off. No real providers or WSL processes.', samples: [] };
const percentile = (array, p) => [...array].sort((a, b) => a - b)[Math.ceil(array.length * p) - 1];
async function run(name, renderer) {
  const server = await createTestServer({ delay: 15 });
  let app;
  try {
    const start = performance.now();
    app = await electron.launch({ args: [path.join(host, 'main.cjs')], timeout: 20000, env: { ...process.env, SELARK_TEST_PROFILE: path.join(work, `profile-${name}-${Date.now()}`), SELARK_BENCH_RENDERER: renderer } });
    const page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    await expect(page.getByRole('heading', { name: '连接到你的工作空间' })).toBeVisible();
    const startupMs = performance.now() - start;
    await page.getByRole('button', { name: '手动连接', exact: true }).click();
    await page.getByLabel('一次性管理链接', { exact: true }).fill(server.origin + '/#login=desktop-test-bootstrap');
    await page.getByRole('button', { name: '打开工作空间' }).click();
    await expect(page.getByRole('region', { name: '所选范围的用量汇总' })).toBeVisible();
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '用量分析', exact: true }).click();
    const pager = page.getByRole('navigation', { name: '调用记录分页' });
    await expect(pager).toContainText('1–25 / 65');
    const initialRequests = server.requests.filter(r => r.path !== '/api/session').length;
    const pages = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      await page.getByRole('button', { name: i % 2 ? '上一页' : '下一页', exact: true }).click();
      await expect(pager).toContainText(i % 2 ? '1–25 / 65' : '26–50 / 65');
      pages.push(performance.now() - start);
    }
    const requests = server.requests.filter(r => r.path !== '/api/session').length;
    // Warm up before sampling all Electron processes. CPU uses cumulative process
    // seconds, normalized to one logical core; RSS/working set includes shared pages.
    await new Promise(resolve => setTimeout(resolve, 1500));
    const metrics = () => app.evaluate(({ app }) => app.getAppMetrics());
    const before = await metrics(), idleStart = performance.now(), requestCount = server.requests.length;
    console.log(`${name}: sampling 30 seconds idle…`);
    await new Promise(resolve => setTimeout(resolve, 30000));
    const after = await metrics(), seconds = (performance.now() - idleStart) / 1000;
    const previous = new Map(before.map(p => [p.pid, p.cpu.cumulativeCPUUsage]));
    const idleCpu = after.reduce((sum, p) => sum + Math.max(0, p.cpu.cumulativeCPUUsage - (previous.get(p.pid) ?? p.cpu.cumulativeCPUUsage)), 0) / seconds * 100;
    const sample = { name, startupMs: Math.round(startupMs), initialRequests, requestsIncludingTenPageChanges: requests, paginationMs: pages.map(v => Math.round(v)), paginationP50Ms: Math.round(percentile(pages, .5)), paginationP95Ms: Math.round(percentile(pages, .95)), idleSeconds: +seconds.toFixed(1), idleCpuOneCorePercent: +idleCpu.toFixed(3), totalWorkingSetMiB: +(after.reduce((sum, p) => sum + p.memory.workingSetSize, 0) / 1024).toFixed(1), idleRequests: server.requests.length - requestCount, processes: after.map(p => ({ type: p.type, workingSetMiB: +(p.memory.workingSetSize / 1024).toFixed(1) })) };
    console.log(JSON.stringify(sample));
    return sample;
  } finally { await app?.close(); await server.close(); }
}
try {
  await prepare();
  report.samples.push(await run('baseline', path.join(work, 'baseline-dist')));
  report.samples.push(await run('optimized', path.join(root, 'dist')));
  report.result = 'passed';
} catch (error) { report.result = 'failed'; report.error = String(error); process.exitCode = 1; }
await mkdir(path.join(root, 'artifacts'), { recursive: true });
await writeFile(path.join(root, `artifacts/performance-${desktopVersion}.json`), JSON.stringify(report, null, 2));
console.log(`Benchmark ${report.result}: artifacts/performance-${desktopVersion}.json`);
