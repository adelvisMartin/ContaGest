import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');
const workflow=()=>read('.github/workflows/release-candidate-v5151.yml');

test('51/51 release candidate is exact-SHA and runs on release/candidate branches',()=>{
  const source=workflow();
  assert.match(source,/CANDIDATE_SHA:\s*\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(source,/release\/candidate-\*/);
  assert.ok((source.match(/git rev-parse HEAD/g)||[]).length>=5);
});

test('51/51 source gate covers install prisma types lint tests builds bundle and high audit',()=>{
  const source=workflow();
  for(const token of [
    'npm ci --no-audit --no-fund',
    'npm --workspace backend run db:validate',
    'npm run typecheck',
    'npm run lint',
    'npm test',
    'npm run build',
    'npm run check:bundle',
    'npm audit --omit=dev --audit-level=high'
  ]) assert.ok(source.includes(token),token);
  const block=source.slice(source.indexOf('source-build-security:'),source.indexOf('postgres-real:'));
  assert.doesNotMatch(block,/continue-on-error:\s*true/);
});

test('51/51 real PostgreSQL gate reuses canonical 48/51 vertical E2E with tenant-safe auth',()=>{
  const source=workflow();
  for(const token of [
    'postgres:17-alpine',
    "ALLOW_DEV_TENANT_HEADER: 'false'",
    "SUPABASE_AUTH_FALLBACK: 'false'",
    'prepare-supabase-ephemeral.sql',
    'prisma:deploy',
    'prisma migrate status',
    'npm run seed',
    'npm run test:backend:verticals:real',
    'qa48_care_patients',
    'qa48_gym_members'
  ]) assert.ok(source.includes(token),token);
});

test('51/51 browser gate includes Chromium, WCAG, Firefox and WebKit over canonical 49/50 suites',()=>{
  const source=workflow();
  assert.match(source,/npm run test:browser:58:core/);
  assert.match(source,/accessibility-wcag22-v99\.spec\.mjs/);
  assert.match(source,/contrast-v15\.spec\.mjs/);
  assert.match(source,/project: firefox/);
  assert.match(source,/project: webkit-safari/);
  assert.match(source,/erp-visual-overlap-v4951\.spec\.mjs qa\/erp-component-contracts-v5051\.spec\.mjs/);
});

test('51/51 evidence is SHA-bound and Vercel remains separate from automated release truth',()=>{
  const source=workflow();
  for(const token of [
    'release-51-source-${{ env.CANDIDATE_SHA }}',
    'release-51-postgres-${{ env.CANDIDATE_SHA }}',
    'release-51-chromium-${{ env.CANDIDATE_SHA }}',
    'release-51-wcag-${{ env.CANDIDATE_SHA }}',
    'release-51-${{ matrix.project }}-${{ env.CANDIDATE_SHA }}',
    'release-51-final-${{ env.CANDIDATE_SHA }}',
    "vercel:'NOT_EXECUTED'",
    'SEPARATE_REQUIRED_FOR_DEPLOYMENT_SIGNOFF',
    'GitHub main SHA == deployment source SHA == /api/health buildCommit'
  ]) assert.ok(source.includes(token),token);
});

test('51/51 verdict fails closed unless every automated gate actually succeeds',()=>{
  const source=workflow();
  for(const job of ['source-build-security','postgres-real','chromium-ui','wcag','cross-browser']) assert.ok(source.includes(job),job);
  for(const variable of ['SOURCE_RESULT','POSTGRES_RESULT','CHROMIUM_RESULT','WCAG_RESULT','CROSS_BROWSER_RESULT']){
    assert.ok(source.includes('test "$'+variable+'" = "success"'),variable);
  }
  assert.doesNotMatch(source,/\|\|\s*true/);
  assert.doesNotMatch(source,/continue-on-error:\s*true/);
});

test('51/51 does not replace canonical 48-50 owners',()=>{
  assert.ok(fs.existsSync('qa/verticals-backend-real-v4851.test.ts'));
  assert.ok(fs.existsSync('qa/erp-visual-overlap-v4951.spec.mjs'));
  assert.ok(fs.existsSync('qa/erp-component-contracts-v5051.spec.mjs'));
  assert.ok(fs.existsSync('tests/erp_ui_component_contracts_50_51.test.mjs'));
});
