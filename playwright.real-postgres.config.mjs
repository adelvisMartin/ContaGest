import { defineConfig, devices } from '@playwright/test';

const databaseUrl=String(process.env.DATABASE_URL||'').trim();
if(!databaseUrl)throw new Error('58/75 requires DATABASE_URL for an isolated PostgreSQL database.');
if(String(process.env.NODE_ENV||'').toLowerCase()==='production')throw new Error('58/75 must never run with NODE_ENV=production.');

const common={
  ...process.env,
  NODE_ENV:'test',
  API_MODE:'prisma',
  PORT:'3030',
  APP_URL:'http://127.0.0.1:8080',
  CORS_ORIGIN:'http://127.0.0.1:8080',
  ALLOW_DEV_TENANT_HEADER:'false',
  SUPABASE_AUTH_FALLBACK:'false'
};

export default defineConfig({
  testDir:'./qa',
  testMatch:'browser-real-postgres-v5875.spec.mjs',
  timeout:120_000,
  expect:{timeout:15_000},
  fullyParallel:false,
  workers:1,
  retries:0,
  reporter:[['list'],['html',{outputFolder:'playwright-report-real-postgres',open:'never'}]],
  use:{
    baseURL:'http://127.0.0.1:8080',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'retain-on-failure'
  },
  projects:[{name:'chromium-real-postgres',use:{...devices['Desktop Chrome']}}],
  webServer:[
    {
      command:'npm --workspace backend exec -- tsx src/server.ts',
      url:'http://127.0.0.1:3030/health',
      reuseExistingServer:false,
      timeout:60_000,
      env:common
    },
    {
      command:'npm --workspace frontend run dev',
      url:'http://127.0.0.1:8080',
      reuseExistingServer:false,
      timeout:60_000,
      env:{...common,VITE_API_BASE_URL:'http://127.0.0.1:3030/api/v1'}
    }
  ]
});
