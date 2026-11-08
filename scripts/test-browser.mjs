import { createServer, preview } from 'vite';
import { spawn } from 'node:child_process';

// Own the two Vite servers in this process, avoiding orphaned npm.cmd trees on Windows.
let development, production;
try {
  development = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: true } });
  await development.listen();
  production = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true, env: { ...process.env, SELARK_TEST_SERVER_MANAGED: '1', SELARK_TEST_DEV_URL: development.resolvedUrls.local[0].replace(/\/$/, ''), SELARK_TEST_PROD_URL: production.resolvedUrls.local[0].replace(/\/$/, '') } });
  process.exitCode = await new Promise((resolve, reject) => { child.on('exit', code => resolve(code ?? 1)); child.on('error', reject); });
} finally {
  production?.httpServer.closeAllConnections();
  if (production) await new Promise(resolve => production.httpServer.close(resolve));
  await development?.close();
}
