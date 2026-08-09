import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('internal SaaS tables are RLS enabled and not granted to anon/authenticated',()=>{
  const migration=read('backend/prisma/migrations/20260809210000_v11_15_internal_saas_rls/migration.sql');
  for(const table of ['AccountUser','TenantMembership','CustomerAccount','SalesAgent','Subscription','SubscriptionTenant','ModuleEntitlement','SubscriptionPayment','Commission','UserSession'])assert.match(migration,new RegExp(table));
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
  assert.match(migration,/REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM anon, authenticated/);
  assert.match(migration,/TO service_role USING \(true\) WITH CHECK \(true\)/);
  assert.doesNotMatch(migration,/budgetwallet_/i);
  assert.doesNotMatch(migration,/hipico_/i);
});
