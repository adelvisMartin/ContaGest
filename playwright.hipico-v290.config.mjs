import { defineConfig, devices } from '@playwright/test';

const remoteBaseURL = String(process.env.QA_BASE_URL || '').trim();

export default defineConfig({
  testDir: './qa',
  testMatch: ['hipico-production-v290.spec.mjs'],
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/hipico-v290', open: 'never' }]],
  outputDir: 'test-results/hipico-v290',
  use: {
    baseURL: remoteBaseURL || 'http://127.0.0.1:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ],
  webServer: remoteBaseURL ? undefined : {
    command: 'npm --workspace frontend run dev',
    url: 'http://127.0.0.1:8080',
    reuseExistingServer: false,
    timeout: 120_000
  }
});
