#!/usr/bin/env node
// #664. Local, disposable operational smoke; no production or shared database writes.
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveGitContext, withEphemeralDatabase } from './local-verification-runner-v630.mjs';
import { assertLoopbackPostgresUrl, verifyNativePostgres17 } from './zero-cost-bootstrap-v668.mjs';
import { checkedBaseUrl, runHipicoSmoke } from './hipico-operational-smoke-v664.mjs';

const SHA = /^[0-9a-f]{40}$/i;
const ERASE_REMOTE_ENV = [
  'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_DB_URL',
  'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_PASSWORD',
  'OPENAI_API_KEY', 'WHATSAPP_CLOUD_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID',
  'VERCEL_AUTOMATION_BYPASS_SECRET'
];

export function assertSmokeEnvironment(env, candidateSha) {
  if (!SHA.test(candidateSha)) throw new Error('SMOKE_CANDIDATE_SHA_REQUIRED');
  if (String(env.NODE_ENV || '').toLowerCase() === 'production' || env.VERCEL_ENV) {
    throw new Error('SMOKE_PRODUCTION_FORBIDDEN');
  }
  const raw = String(env.LOCAL_VERIFY_DATABASE_ADMIN_URL || '').trim();
  if (!raw) throw new Error('SMOKE_LOCAL_POSTGRES_ADMIN_REQUIRED');
  const url = assertLoopbackPostgresUrl(raw);
  if (url.pathname !== '/postgres' || url.hash || url.search) {
    throw new Error('SMOKE_ADMIN_DATABASE_MUST_BE_LOCAL_POSTGRES');
  }
  return url;
}

export function buildSmokeSteps() {
  return [
    { id: 'schema', command: 'npm', args: ['--workspace', 'backend', 'run', 'prisma:generate'] },
    { id: 'migrations', command: 'npm', args: ['--workspace', 'backend', 'run', 'prisma:deploy'] },
    { id: 'seed', command: 'npm', args: ['--workspace', 'backend', 'run', 'seed'] },
    { id: 'rls', command: 'npm', args: ['--workspace', 'backend', 'run', 'db:rls'] },
    { id: 'api-finance', command: 'npm', args: ['--workspace', 'backend', 'exec', '--', 'tsx', '--test', '../qa/erp-operational-financial-v664.test.ts'] },
    { id: 'chromium-erp', command: 'node', args: ['scripts/erp-real-browser-postgres-v5875.mjs'] }
  ];
}

export function isolatedSmokeEnvironment(source, databaseUrl) {
  const env = { ...source };
  for (const key of ERASE_REMOTE_ENV) delete env[key];
  // DB fallbacks and direct URLs must never route around the disposable PostgreSQL.
  for (const key of [
    'DATABASE_RUNTIME_URL', 'POSTGRES_PRISMA_URL', 'DIRECT_URL', 'DIRECT_DATABASE_URL',
    'POSTGRES_URL_NON_POOLING', 'SUPABASE_DB_URL', 'POSTGRES_URL'
  ]) delete env[key];
  return {
    ...env, NODE_ENV: 'test', VERCEL_ENV: '', API_MODE: 'prisma',
    SUPABASE_AUTH_FALLBACK: 'false', ALLOW_DEV_TENANT_HEADER: 'false',
    JWT_SECRET: randomBytes(32).toString('hex'),
    LICENSE_HASH_SECRET: randomBytes(32).toString('hex'),
    DATABASE_URL: databaseUrl,
    DIRECT_DATABASE_URL: databaseUrl,
    DATABASE_RUNTIME_URL: databaseUrl
  };
}

function executeStep(step, env) {
  const command = process.platform === 'win32' && step.command === 'npm' ? 'npm.cmd' : step.command;
  const started = performance.now();
  const result = spawnSync(command, step.args, { cwd: process.cwd(), env, stdio: 'inherit', shell: false });
  return {
    id: step.id,
    status: result.error ? 'BLOCKED' : result.status === 0 ? 'PASS' : 'FAIL',
    exitCode: result.status ?? null,
    durationMs: Math.round(performance.now() - started),
    code: result.error ? 'COMMAND_UNAVAILABLE' : result.status === 0 ? 'OK' : 'COMMAND_FAILED'
  };
}

export async function runOperationalSmoke({ env = process.env, candidateSha, erpOnly = false, execute = executeStep, withDatabase = withEphemeralDatabase, hipicoSmoke = runHipicoSmoke } = {}) {
  const report = {
    schema: 'erp-operational-smoke-v664-v1',
    candidateSha,
    scope: erpOnly ? 'ERP' : 'ERP_AND_HIPICO',
    status: 'BLOCKED',
    stages: [],
    remoteCI: 'NOT_EXECUTED',
    manualQA: 'NOT_EXECUTED'
  };
  try {
    const admin = assertSmokeEnvironment(env, candidateSha);
    if (!erpOnly) {
      if (!env.HIPICO_SMOKE_BASE_URL) throw new Error('SMOKE_HIPICO_BASE_URL_REQUIRED');
      checkedBaseUrl(env.HIPICO_SMOKE_BASE_URL);
    }
    const version = verifyNativePostgres17({ adminUrl: admin.toString() });
    report.postgresMajor = version.major;

    await withDatabase({ candidateSha, env }, async (databaseEnv, db) => {
      const safeEnv = isolatedSmokeEnvironment({ ...databaseEnv, GIT_COMMIT_SHA: candidateSha }, db.databaseUrl);
      for (const step of buildSmokeSteps()) {
        const result = await execute(step, safeEnv);
        report.stages.push(result);
        if (result.status !== 'PASS') throw new Error('SMOKE_STEP_FAILED');
      }
      // Prisma generators must not silently change source after the SHA was captured.
      resolveGitContext({ cwd: process.cwd(), expectedSha: candidateSha, baseRef: 'main' });
    });

    if (!erpOnly) {
      const hipico = await hipicoSmoke(env.HIPICO_SMOKE_BASE_URL);
      report.stages.push({
        id: 'hipico-readonly',
        status: hipico.status,
        checks: hipico.checks.map(check => ({ name: check.name, status: check.status, code: check.code }))
      });
    } else {
      report.stages.push({ id: 'hipico-readonly', status: 'NOT_APPLICABLE', code: 'ERP_ONLY' });
    }
    report.status = report.stages.some(x => x.status === 'FAIL') ? 'FAIL'
      : report.stages.some(x => x.status === 'BLOCKED') ? 'BLOCKED' : 'PASS';
  } catch (error) {
    const code = String(error?.message || 'SMOKE_UNKNOWN');
    const blocked = /SMOKE_LOCAL_POSTGRES_ADMIN_REQUIRED|SMOKE_HIPICO_BASE_URL_REQUIRED|ZERO_COST_.*(?:REQUIRED|FAILED)|LOCAL_POSTGRES_BLOCKED/.test(code);
    if (!report.stages.some(x => x.status !== 'PASS')) {
      report.stages.push({ id: 'prerequisite-or-cleanup', status: blocked ? 'BLOCKED' : 'FAIL', code: code.startsWith('SMOKE_') ? code : blocked ? 'PREREQUISITE_UNAVAILABLE' : 'EXECUTION_FAILED' });
    }
    report.status = report.stages.some(x => x.status === 'FAIL') ? 'FAIL' : 'BLOCKED';
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(x => x !== '--erp-only')) throw new Error('SMOKE_ARGUMENT_UNKNOWN');
  const { candidateSha } = resolveGitContext({
    cwd: process.cwd(),
    baseRef: 'main',
    expectedSha: process.env.CANDIDATE_SHA || ''
  });
  const report = await runOperationalSmoke({
    env: process.env, candidateSha, erpOnly: args.includes('--erp-only')
  });
  const folder = join(process.cwd(), 'artifacts', 'operational-smoke', candidateSha);
  await mkdir(folder, { recursive: true });
  const output = join(folder, 'report.json');
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, candidateSha, artifact: relative(process.cwd(), output), stages: report.stages }, null, 2));
  if (report.status !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(() => {
    console.error('SMOKE_INITIALIZATION_FAILED (check clean checkout, branch main and CANDIDATE_SHA)');
    process.exitCode = 1;
  });
}
