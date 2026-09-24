import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('runner recovery keeps AppSec client-secret checks on browser surfaces only',()=>{
  const source=read('scripts/security-audit.mjs');
  assert.match(source,/function isBrowserFrontendPath/);
  for(const path of ["frontend/src/","frontend/public/","frontend/soluciones/","frontend/portal/"]) assert.ok(source.includes(path),path);
  assert.doesNotMatch(source,/if \(rel\.startsWith\('frontend\/'\)\)/);
  assert.match(source,/if \(isBrowserFrontendPath\(rel\)\)/);
  assert.match(source,/SUPABASE_SERVICE_ROLE_KEY\|OPENAI_API_KEY\|JWT_SECRET/);
});

test('ephemeral PostgreSQL deployment is baseline-aware and production-safe',()=>{
  const deploy=read('backend/scripts/prisma-deploy-safe.mjs');
  const bootstrap=read('ops/database/prepare-supabase-ephemeral.sql');
  const pkg=JSON.parse(read('backend/package.json'));

  assert.match(deploy,/EPHEMERAL_DATABASE_PATTERN = \/\(_e2e\|_drill\|_restore\)\$\//);
  for(const migration of ['0001_init','0003_accounting_hr_fiscal_hardening','0004_analytics_qr_barcode','0005_food_orders_notifications_ai_demo']) {
    assert.ok(deploy.includes(migration),migration);
  }
  assert.match(deploy,/EPHEMERAL_BASELINE_INCOMPLETE/);
  assert.match(deploy,/migrate', 'resolve', '--applied'/);
  assert.match(deploy,/migrate', 'deploy'/);
  assert.doesNotMatch(deploy,/migrate reset|db push/);
  assert.equal(pkg.scripts['prisma:deploy'],'npm run prisma:sync-schema && node scripts/prisma-deploy-safe.mjs');

  assert.match(bootstrap,/contagest_full_bootstrap_v8_5\.sql/);
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS auth\.users/);
  assert.match(bootstrap,/CREATE TABLE IF NOT EXISTS public\.hipico_profiles/);
  assert.match(bootstrap,/CREATE OR REPLACE FUNCTION public\.hipico_set_updated_at/);
  assert.match(bootstrap,/CREATE SCHEMA IF NOT EXISTS storage/);
});

test('exact-SHA gates checkout the PR head instead of the GitHub merge ref',()=>{
  for(const path of [
    '.github/workflows/erp-verticals-real-e2e-v4851.yml',
    '.github/workflows/erp-verticals-visual-v4951.yml'
  ]){
    const source=read(path);
    assert.match(source,/CANDIDATE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
    assert.match(source,/uses: actions\/checkout@v7[\s\S]{0,120}ref: \$\{\{ env\.CANDIDATE_SHA \}\}/);
    assert.match(source,/git rev-parse HEAD/);
  }

  const release=read('.github/workflows/release-candidate-v5151.yml');
  const checkouts=(release.match(/uses: actions\/checkout@v7/g)||[]).length;
  const exactRefs=(release.match(/ref: \$\{\{ env\.CANDIDATE_SHA \}\}/g)||[]).length;
  assert.equal(checkouts,5);
  assert.equal(exactRefs,checkouts);
  assert.ok((release.match(/git rev-parse HEAD/g)||[]).length>=5);
  assert.match(release,/POSTGRES_DB: contagest_release_51_e2e/);
});

test('WCAG workflow invokes declared Chromium browser scripts',()=>{
  const pkg=JSON.parse(read('package.json'));
  const workflow=read('.github/workflows/accessibility-wcag22-v99.yml');
  assert.equal(pkg.scripts['test:browser:a11y'],'npx playwright test qa/accessibility-wcag22-v99.spec.mjs --project=chromium --workers=1');
  assert.equal(pkg.scripts['test:browser:contrast'],'npx playwright test qa/contrast-v15.spec.mjs --project=chromium --workers=1');
  assert.match(workflow,/run: npm run test:browser:a11y/);
  assert.match(workflow,/run: npm run test:browser:contrast/);
  assert.doesNotMatch(workflow,/test:browser:contrast -- --project/);
});

test('stateless app bootstrap does not resolve a Prisma CRUD delegate at module import time',()=>{
  const source=read('backend/src/modules/crud.factory.ts');
  assert.match(source,/import type \{ PrismaClient \} from '@prisma\/client'/);
  assert.doesNotMatch(source,/import \{ prisma \} from '\.\.\/database\/prisma\.js'/);
  assert.match(source,/const delegate = async \(\) =>/);
  assert.match(source,/await import\('\.\.\/database\/prisma\.js'\)/);
  assert.ok((source.match(/await \(await delegate\(\)\)/g)||[]).length>=6);
});
