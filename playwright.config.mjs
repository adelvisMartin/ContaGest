import { defineConfig, devices } from '@playwright/test';

const remoteBaseURL = String(process.env.QA_BASE_URL || '').trim();
const serverlessChromium = String(process.env.CG_PLAYWRIGHT_CHROMIUM_EXECUTABLE || '').trim();
const campaignSha = String(process.env.CANDIDATE_SHA || '').trim();
let serverlessChromiumArgs=[];
try { serverlessChromiumArgs=JSON.parse(process.env.CG_PLAYWRIGHT_CHROMIUM_ARGS || '[]'); }
catch { serverlessChromiumArgs=[]; }
const chromiumLaunchOptions=serverlessChromium?{
  executablePath:serverlessChromium,
  args:Array.isArray(serverlessChromiumArgs)?serverlessChromiumArgs:[]
}:undefined;

export default defineConfig({
  testDir: './qa',
  testIgnore: campaignSha ? [] : [
    '**/erp-system-campaign-v155.spec.mjs',
    '**/erp-system-reliability-v155.spec.mjs'
  ],
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: remoteBaseURL || 'http://127.0.0.1:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(chromiumLaunchOptions?{launchOptions:chromiumLaunchOptions}:{}) } },
    { name: 'webkit-safari', use: { ...devices['Desktop Safari'] } },
    { name: 'webkit-iphone', use: { ...devices['iPhone 13'] } }
  ],
  webServer: remoteBaseURL ? undefined : {
    command: 'npm --workspace frontend run dev',
    url: 'http://127.0.0.1:8080',
    reuseExistingServer: false,
    timeout: 120_000
  }
});