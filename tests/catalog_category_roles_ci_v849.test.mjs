import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/catalog-category-v849.yml', import.meta.url), 'utf8');
const STEP_PROVISION = 'Provision least-privilege QA roles and canonical tenant RLS policies';

test('#849 role provisioning follows canonical migrations and precedes tenant QA', () => {
  const migrate = workflow.indexOf('npm --workspace backend run prisma:deploy');
  const provision = workflow.indexOf('ops/database/provision-security-roles.sql');
  const verify = workflow.indexOf('ops/database/verify-security-roles.sql');
  const e2e = workflow.indexOf('npm run test:backend:service-catalog:real');
  assert.ok(migrate > 0 && provision > migrate && verify > provision && e2e > verify);
  assert.match(workflow, /postgres:17-alpine/);
  assert.match(workflow, /contagest_catalog_v849_e2e/);
  assert.doesNotMatch(workflow, /-f ops\/database\/runtime-rls-policy-v845\.sql/,
    'The sidecar must only be applied by the canonical role provisioner');
});

test('#849 disposable role credentials are per-run, nonlogged and least-privilege verifier is mandatory', () => {
  const start = workflow.indexOf(`- name: ${STEP_PROVISION}`);
  const end = workflow.indexOf('- name: Seed isolated authorization fixtures', start);
  assert.ok(start > 0 && end > start);
  const step = workflow.slice(start, end);
  assert.match(step, /set -euo pipefail/);
  for (const role of ['RUNTIME', 'BACKUP', 'MONITOR']) {
    assert.match(step, new RegExp(`export CONTAGEST_${role}_PASSWORD="\\$\\(node -e`));
  }
  assert.equal((step.match(/randomBytes\(32\)/g) ?? []).length, 3);
  assert.match(step, /PGPASSWORD: catalog-ci-only/);
  assert.doesNotMatch(step, /(?:echo|printf|tee)\s+.*(?:PASSWORD|randomBytes)/);
  assert.ok(step.includes('ops/database/verify-security-roles.sql'));
});

test('#849 exact-head workflow keeps checks active and artifacts attributable to same SHA', () => {
  assert.match(workflow, /github\.event\.pull_request\.head\.sha \|\| github\.sha/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$CANDIDATE_SHA"/);
  assert.match(workflow, /Catalog API\/PG17 tenant and concurrency regressions/);
  assert.match(workflow, /if: always\(\)/);
  assert.doesNotMatch(workflow, /continue-on-error: true|test\.skip\(|waitForTimeout/);
});

test('#849 PostgreSQL 17 PUBLIC function grant verifier uses ACL pseudo-grantee, not a nonexistent login role',()=>{
  const sql=readFileSync(new URL('../ops/database/verify-security-roles.sql',import.meta.url),'utf8');
  assert.doesNotMatch(sql,/IF has_function_privilege\('PUBLIC',helper_oid,'EXECUTE'\)/,
    'PUBLIC must never be passed to role-name privilege APIs');
  assert.match(sql,/aclexplode\(/);
  assert.match(sql,/acldefault\('f',\s*function_acl\.proowner\)/);
  assert.match(sql,/privilege\.grantee=0/);
  assert.match(sql,/privilege\.privilege_type='EXECUTE'/);
  assert.match(sql,/IF NOT has_function_privilege\('contagest_runtime',helper_oid,'EXECUTE'\)/);
});
