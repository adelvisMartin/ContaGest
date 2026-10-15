import { defineConfig } from '@playwright/test';

// Standalone, opt-in #854 test configuration; never auto-runs against production
// or in the normal browser quality campaign. The test itself checks for an
// explicitly local disposable backend and a synthetic tenant token.
export default defineConfig({
  testDir: './qa',
  testMatch: ['notification-dispatch-v854.e2e.mjs'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8080',
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  },
  projects: [{ name: 'chromium' }]
});
