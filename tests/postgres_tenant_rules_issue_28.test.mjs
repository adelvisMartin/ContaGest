import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(file)=>fs.readFileSync(file,'utf8');
const workflow=read('.github/workflows/postgres-tenant-rules-v28.yml');
const sql=read('qa/postgres-tenant-rules-v28.sql');
const runner=read('scripts/run-postgres-tenant-rules-v28.sh');
const helper=read('ops/database/prepare-supabase-ephemeral.sql');

test('workflow usa PostgreSQL 17 efímero y migración canónica',()=>{
  assert.match(workflow,/image:\s*postgres:17-alpine/);
  assert.match(workflow,/POSTGRES_DB:\s*contagest_rules_e2e/);
  assert.match(workflow,/prepare-supabase-ephemeral\.sql/);
  assert.match(workflow,/npm --workspace backend run prisma:deploy/);
  assert.match(workflow,/prisma migrate status --schema backend\/prisma\/schema\.prisma/);
  assert.doesNotMatch(workflow,/supabase\.co|SUPABASE_SERVICE_ROLE|DATABASE_RUNTIME_URL/);
});

test('runner rechaza cualquier base que no termine en _e2e',()=>{
  assert.match(runner,/DB_NAME=.*current_database/);
  assert.match(runner,/! \"\$DB_NAME\" =~ _e2e\$/);
  assert.match(runner,/PRIMARY_DATABASE_HOST/);
  assert.match(sql,/current_database\(\) !~ '_e2e\$'/);
});

test('runner adapta la URL Prisma para psql sin relajar el guard efímero',()=>{
  assert.match(runner,/PSQL_DATABASE_URL=/);
  assert.match(runner,/searchParams\.delete\('schema'\)/);
  assert.match(runner,/DB_NAME=.*PSQL_DATABASE_URL.*current_database/);
  assert.match(runner,/psql "\$PSQL_DATABASE_URL"/);
  assert.doesNotMatch(runner,/psql "\$DATABASE_URL"/);
});

test('SQL prueba físicamente RIF inmutable',()=>{
  assert.match(sql,/UPDATE public\."Tenant" SET "rif"/);
  assert.match(sql,/SQLSTATE='23514'/);
  assert.match(sql,/tenant_rif_immutable/);
});

test('SQL prueba maxTenants con segundo tenant/RIF',()=>{
  assert.match(sql,/"maxTenants","maxUsers"/);
  assert.match(sql,/qa28-tenant-a/);
  assert.match(sql,/qa28-tenant-b/);
  assert.match(sql,/subscription_tenant_limit_reached/);
  assert.match(sql,/expected_second_tenant_rejection/);
});

test('SQL prueba maxUsers con segundo email distinto',()=>{
  assert.match(sql,/qa28-user-a@example\.test/);
  assert.match(sql,/qa28-user-b@example\.test/);
  assert.match(sql,/subscription_user_limit_reached/);
  assert.match(sql,/count\(DISTINCT lower\("userEmail"\)\)/);
});

test('SQL prueba licencia vinculada a tenant no cubierto',()=>{
  assert.match(sql,/qa28-license-uncovered/);
  assert.match(sql,/subscription_not_entitled_for_tenant/);
  assert.match(sql,/expected_uncovered_tenant_license_rejection/);
});

test('SQL prueba privacidad y versionado de aceptación legal',()=>{
  assert.match(sql,/relrowsecurity/);
  assert.match(sql,/has_table_privilege\('anon','public\."LegalAcceptance"','SELECT'\)/);
  assert.match(sql,/has_table_privilege\('authenticated','public\."CookiePreference"','SELECT'\)/);
  assert.match(sql,/qa28-legal-v1/);
  assert.match(sql,/qa28-legal-v2/);
  assert.match(sql,/unique_violation/);
});

test('fixtures se ejecutan en transacción y terminan en rollback verificable',()=>{
  assert.match(sql,/\bBEGIN;[\s\S]*\bROLLBACK;/);
  assert.match(sql,/qa28_transaction_cleanup_failed/);
});

test('gate no toca tablas auxiliares de Hípico o Budget Wallet',()=>{
  const forbidden=['hipico_','budget','budgetwallet','wallet_'];
  const lower=sql.toLowerCase();
  for(const token of forbidden)assert.equal(lower.includes(token),false,`SQL #28 no debe contener ${token}`);
});

test('helper efímero ya está protegido contra ejecución productiva',()=>{
  assert.match(helper,/_e2e|_drill|_restore/);
  assert.match(helper,/auth\.uid/);
  assert.match(helper,/auth\.jwt/);
});

test('workflow conserva logs aun cuando una regla falle',()=>{
  assert.match(workflow,/if: always\(\)/);
  assert.match(workflow,/actions\/upload-artifact@v7/);
  assert.match(workflow,/migration-v28\.log/);
  assert.match(workflow,/tenant-rules-v28\.log/);
  assert.match(workflow,/db-inventory-v28\.log/);
});
