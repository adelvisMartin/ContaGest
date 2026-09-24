import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const spec=fs.readFileSync('qa/erp-real-browser-v5875.spec.mjs','utf8');
const runner=fs.readFileSync('scripts/erp-real-browser-postgres-v5875.mjs','utf8');
const fixtures=fs.readFileSync('qa/support/real-browser-fixtures-v5875.ts','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const workflow=fs.readFileSync('.github/workflows/release-candidate-v5151.yml','utf8');

test('58/75 real-browser gate is wired without API interception',()=>{
  assert.ok(!spec.includes('page.route('),'real browser spec must not mock API routes');
  for(const route of ['odontologia','veterinaria','gimnasio'])assert.ok(spec.includes(`module=${route}`),route);
  assert.ok(spec.includes("cg_access")&&spec.includes("cg_refresh")&&spec.includes("cg_csrf"),'cookie contract');
  assert.ok(spec.includes('page.reload'),'persistence must be verified after reload');
  assert.ok(spec.includes('FOREIGN-PATIENT')&&spec.includes('FOREIGN-PET')&&spec.includes('FOREIGN-MEMBER'),'tenant isolation fixtures');
  assert.ok(fixtures.includes("NODE_ENV")&&fixtures.includes("production"),'fixture production guard');
  assert.ok(runner.includes('isolated local PostgreSQL')&&runner.includes('finally'),'runner must fail closed and cleanup');
  assert.equal(pkg.scripts['test:browser:verticals:real'],'node scripts/erp-real-browser-postgres-v5875.mjs');
  assert.ok(workflow.includes('test:browser:verticals:real'),'release PostgreSQL job must execute the browser-real gate');
});
