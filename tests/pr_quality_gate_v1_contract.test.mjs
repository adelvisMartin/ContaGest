import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/pr-quality-gate-v1.yml', import.meta.url), 'utf8');

test('Quality Gate usa PostgreSQL efímero y no una base productiva', () => {
  assert.match(workflow, /image:\s*postgres:16-alpine/);
  assert.match(workflow, /contagest_qa/);
  assert.match(workflow, /prisma:deploy/);
  assert.match(workflow, /prisma:seed/);
  assert.doesNotMatch(workflow, /supabase\.co/i);
});

test('Quality Gate cubre build, financieros, browser, responsive y accesibilidad', () => {
  for (const command of [
    'npm run typecheck',
    'npm run build:frontend',
    'npm run build:backend',
    'test:backend:persistence:real',
    'test:backend:financial:real',
    'test:backend:ledger:real',
    'test:backend:idempotency:real',
    'test:browser:58',
    'test:browser:functional',
    'test:browser:a11y',
    'test:browser:contrast'
  ]) assert.ok(workflow.includes(command), `falta gate ${command}`);
});

test('Quality Gate conserva evidencia por SHA y falla cerrado', () => {
  assert.match(workflow, /CANDIDATE_SHA/);
  assert.match(workflow, /upload-artifact@v4/);
  assert.match(workflow, /Final fail-closed Quality Gate/);
  assert.match(workflow, /needs\.static-contract\.result/);
  assert.match(workflow, /needs\.backend-real\.result/);
  assert.match(workflow, /needs\.browser-runtime\.result/);
  assert.match(workflow, /needs\.pwa-security\.result/);
});

test('Vercel no se usa como sustituto de QA determinista', () => {
  assert.match(workflow, /vercelPreviewRequired/);
  assert.match(workflow, /BLOCKED_INFRA/);
  assert.doesNotMatch(workflow, /vercel deploy|vercel --prod/i);
});
