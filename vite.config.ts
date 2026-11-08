import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, watch: { ignored: ['**/release/**', '**/.benchmark/**', '**/artifacts/**', '**/.test-profile*/**'] } },
  build: { manifest: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
