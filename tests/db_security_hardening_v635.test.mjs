import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const parse=(relative)=>JSON.parse(read(relative));
const definerSidecar='backend/supabase/migrations/0003_rls_grants_security_definer_hardening.sql';
const grantSidecar='backend/supabase/migrations/0004_backend_only_browser_grants_hardening.sql';

function functionBlock(sql,name){
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=sql.match(new RegExp(`create\\s+or\\s+replace\\s+function\\s+${escaped}\\s*\\([^)]*\\)[\\s\\S]*?\\$\\$;`,'i'));
  assert.ok(match,`missing function ${name}`);
  return match[0];
}

test('v635 policy sidecars are classified and applied in order after legacy 0002',()=>{
  const manifest=parse('config/database-authority-67-75.json');
  assert.ok(manifest.policyAuthority?.sql?.includes(definerSidecar),'v635 definer sidecar must be policy authority');
  assert.ok(manifest.policyAuthority?.sql?.includes(grantSidecar),'v635 grant sidecar must be policy authority');
  const apply=read('backend/scripts/apply-rls.mjs');
  const legacyIndex=apply.indexOf('0002_rls_policies.sql');
  const definerIndex=apply.indexOf('0003_rls_grants_security_definer_hardening.sql');
  const grantIndex=apply.indexOf('0004_backend_only_browser_grants_hardening.sql');
  assert.ok(legacyIndex>=0,'legacy 0002 must remain explicit');
  assert.ok(definerIndex>legacyIndex,'v635 definer sidecar must execute after 0002');
  assert.ok(grantIndex>definerIndex,'v635 grant sidecar must execute after 0003');
  assert.match(apply,/contagest_runtime/,'policy DDL must fail closed for the runtime role');
});

test('public tenant/profile compatibility helpers are SECURITY INVOKER only',()=>{
  const sql=read(definerSidecar);
  for(const name of ['public.current_tenant_id','public.current_profile_id']){
    const block=functionBlock(sql,name);
    assert.match(block,/security\s+invoker/i,`${name} must be invoker`);
    assert.doesNotMatch(block,/security\s+definer/i,`${name} must not be definer`);
    assert.match(block,/set\s+search_path\s*=\s*pg_catalog\s*,\s*private\s*,\s*public/i,`${name} search_path must be closed`);
  }
});

test('private helpers are closed definers with explicit execution grants',()=>{
  const sql=read(definerSidecar);
  for(const name of ['private.current_tenant_id','private.current_profile_id']){
    const block=functionBlock(sql,name);
    assert.match(block,/security\s+definer/i,`${name} must remain a controlled definer`);
    assert.match(block,/set\s+search_path\s*=\s*pg_catalog\s*,\s*private\s*,\s*public/i,`${name} search_path must be closed`);
  }
  assert.match(sql,/revoke\s+all\s+on\s+function\s+private\.current_tenant_id\(\)\s+from\s+public\s*,\s*anon/i);
  assert.match(sql,/revoke\s+all\s+on\s+function\s+private\.current_profile_id\(\)\s+from\s+public\s*,\s*anon/i);
  assert.match(sql,/grant\s+execute\s+on\s+function\s+private\.current_tenant_id\(\)\s+to\s+authenticated/i);
  assert.match(sql,/grant\s+execute\s+on\s+function\s+private\.current_profile_id\(\)\s+to\s+authenticated/i);
});

test('v635 hardens only ContaGest-owned definers in the shared database',()=>{
  const sql=read(definerSidecar);
  assert.match(sql,/revoke\s+create\s+on\s+schema\s+public\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i);
  assert.doesNotMatch(sql,/from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role/i,'shared service_role schema privileges are out of scope');
  assert.doesNotMatch(sql,/from\s+pg_proc/i,'sidecar must not blanket-mutate every function in shared schemas');
  for(const name of [
    'private.enforce_subscription_tenant_limit()',
    'private.enforce_license_subscription_tenant()',
    'private.enforce_subscription_user_limit()',
    'private.sync_license_permissions()'
  ]) assert.ok(sql.includes(name),`missing explicit hardening target ${name}`);
});

test('backend-only grant sidecar revokes browser DML only from PascalCase tenant tables',()=>{
  const sql=read(grantSidecar);
  assert.match(sql,/attname\s*=\s*'tenantId'/i);
  assert.match(sql,/relname\s*~\s*'\^\[A-Z\]'/i);
  assert.match(sql,/revoke\s+all\s+privileges\s+on\s+table/i);
  assert.match(sql,/from\s+anon/i);
  assert.match(sql,/from\s+authenticated/i);
  assert.doesNotMatch(sql,/hipico_/i,'shared Hípico authority must not be enumerated or mutated here');
  assert.doesNotMatch(sql,/budgetwallet_/i,'shared BudgetWallet authority must not be enumerated or mutated here');
});
