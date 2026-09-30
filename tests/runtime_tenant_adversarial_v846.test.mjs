import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('#846 postgres runner is isolated, PG17-only and reuses one runtime connection',()=>{
  const source=read('backend/scripts/runtime-tenant-adversarial-v846.mjs');
  assert.match(source,/V846_ISOLATED_DATABASE_REQUIRED/);
  assert.match(source,/POSTGRES_17_REQUIRED/);
  assert.match(source,/max:\s*1/);
  assert.match(source,/pg_backend_pid\(\)/);
  assert.match(source,/POOL_CONNECTION_NOT_REUSED/);
  assert.match(source,/contagest_runtime/);
});

test('#846 covers fail-closed, A-B CRUD, child scope and transaction cleanup',()=>{
  const source=read('backend/scripts/runtime-tenant-adversarial-v846.mjs');
  for(const marker of [
    'NO_CONTEXT_MUST_DENY_SELECT',
    'INVALID_CONTEXT_MUST_DENY',
    'STALE_CONTEXT_MUST_DENY',
    'A_TO_B_INSERT_MUST_REJECT',
    'A_TO_B_UPDATE_MUST_BE_ZERO',
    'A_TO_B_DELETE_MUST_BE_ZERO',
    'B_TO_A_UPDATE_MUST_BE_ZERO',
    'CHILD_CROSS_TENANT_INSERT_MUST_REJECT',
    'TRANSACTION_CONTEXT_LEAK_AFTER_COMMIT',
    'TRANSACTION_CONTEXT_LEAK_AFTER_ROLLBACK',
    'TRANSACTION_CONTEXT_LEAK_AFTER_ERROR',
    'TRANSACTION_CONTEXT_LEAK_AFTER_TIMEOUT',
    'TRANSACTION_CONTEXT_LEAK_AFTER_CANCEL'
  ]) assert.match(source,new RegExp(marker));
  assert.match(source,/statement_timeout/);
  assert.match(source,/pg_sleep/);
  assert.match(source,/pg_cancel_backend/);
});

test('#846 runs a real Prisma interactive-transaction probe under #843 authority',()=>{
  const runner=read('backend/scripts/runtime-tenant-adversarial-v846.mjs');
  const probe=read('backend/scripts/runtime-tenant-prisma-v846.ts');
  assert.match(runner,/runtime-tenant-prisma-v846\.ts/);
  assert.match(probe,/runWithRuntimeTenant/);
  assert.match(probe,/\$transaction\s*\(\s*async/);
  assert.match(probe,/current_setting\('contagest\.tenant_id'/);
  assert.match(probe,/PRISMA_CONTEXT_LEAK/);
  assert.match(probe,/PRISMA_CROSS_TENANT_VISIBLE/);
});

test('#846 verifies least privilege, bootstrap authority, exact-SHA artifact and pooler contract docs',()=>{
  const runner=read('backend/scripts/runtime-tenant-adversarial-v846.mjs');
  const provision=read('ops/database/provision-security-roles.sql');
  const docs=read('docs/security/runtime-tenant-adversarial-v846.md');
  const pkg=JSON.parse(read('backend/package.json'));
  assert.match(runner,/rolsuper/);
  assert.match(runner,/rolcreatedb/);
  assert.match(runner,/rolcreaterole/);
  assert.match(runner,/rolbypassrls/);
  assert.match(runner,/contagest_bootstrap_login_identity/);
  assert.match(provision,/contagest_bootstrap_coordinate_challenge_identity\(text\)/);
  assert.match(provision,/GRANT EXECUTE ON FUNCTION private\.contagest_bootstrap_coordinate_challenge_identity\(text\) TO contagest_runtime/);
  assert.match(runner,/RUNTIME_ALL_TENANT_POLICY/);
  assert.match(runner,/CG_CANDIDATE_SHA/);
  assert.match(runner,/artifacts\/qa\/db-security-v846/);
  assert.match(docs,/Supavisor\/PgBouncer/i);
  assert.match(docs,/transaction mode/i);
  assert.match(docs,/BLOCKED_INFRASTRUCTURE\/NOT_EXECUTED/);
  assert.equal(pkg.scripts['test:runtime-tenant-adversarial:postgres'],'node scripts/runtime-tenant-adversarial-v846.mjs');
});
