import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=(relative)=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');

test('issue 370 promotes the isolated PostgreSQL migration chain through v26',async()=>{
  const schema=await read('scripts/hipico-apply-e2e-schema-v290.mjs');
  const v24=schema.indexOf("'supabase/sql/hipico_v24_shadow_metrics.sql'");
  const v25=schema.indexOf("'supabase/sql/hipico_v25_observability.sql'");
  const v26=schema.indexOf("'supabase/sql/hipico_v26_audit_rpc_integrity.sql'");
  assert.ok(v24>=0 && v25>v24 && v26>v25,'v25/v26 must follow v24');

  assert.match(schema,/CREATE ROLE service_role NOLOGIN/);
  assert.match(schema,/hipico_observability_events/);
  assert.match(schema,/hipico_observability_no_mutation/);
  assert.match(schema,/hipico_audit_idempotency_guard/);
  for(const column of ['idempotency_key','source','authority']) assert.match(schema,new RegExp(column));
  for(const constraint of ['hipico_audit_events_source_check','hipico_audit_events_authority_check']) {
    assert.match(schema,new RegExp(constraint));
  }
  for(const assertion of [
    'observabilityAppendOnlyTriggerPresent',
    'auditV26ColumnsPresent',
    'auditV26ConstraintsPresent',
    'auditRpcAnonExecuteDenied',
    'auditRpcAuthenticatedExecuteAllowed',
    'auditRpcServiceRoleExecuteAllowed'
  ]) assert.match(schema,new RegExp(assertion));
  assert.match(schema,/v12-v26 RLS\/RBAC evidence executed/);
});

test('issue 370 release evidence requires v25/v26 on the exact candidate',async()=>{
  const [guard,verifier,report,workflow]=await Promise.all([
    read('scripts/hipico-release-guard-v290.mjs'),
    read('scripts/hipico-verify-evidence-v290.mjs'),
    read('scripts/hipico-release-report-v290.mjs'),
    read('.github/workflows/hipico-production-gates-v290.yml')
  ]);
  assert.match(guard,/currentPostgresChain:\s*'v12-v26'/);
  assert.match(guard,/hipico_v25_observability\.sql/);
  assert.match(guard,/hipico_v26_audit_rpc_integrity\.sql/);
  assert.match(verifier,/currentPostgresChain === 'v12-v26'/);
  assert.match(verifier,/hipico_v25_observability\.sql/);
  assert.match(verifier,/hipico_v26_audit_rpc_integrity\.sql/);
  assert.match(verifier,/auditV26ColumnsPresent/);
  assert.match(verifier,/observabilityAppendOnlyTriggerPresent/);
  assert.match(verifier,/postgresChain:\s*'v12-v26'/);
  assert.match(report,/postgresChain:\s*'v12-v26'/);
  assert.match(report,/PostgreSQL chain: \*\*v12-v26\*\*/);
  assert.match(workflow,/v12-v26/);
});

test('issue 370 keeps production deployment out of the E2E chain',async()=>{
  const [schema,workflow]=await Promise.all([
    read('scripts/hipico-apply-e2e-schema-v290.mjs'),
    read('.github/workflows/hipico-production-gates-v290.yml')
  ]);
  assert.match(schema,/127\.0\.0\.1|localhost/);
  assert.match(schema,/hipico_e2e_/);
  assert.doesNotMatch(schema,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|PRODUCTION_DATABASE_URL/);
  assert.doesNotMatch(workflow,/SUPABASE_SERVICE_ROLE_KEY|PRODUCTION_DATABASE_URL/);
});


test('issue 370 bootstraps Supabase Auth prerequisites before Prisma deploy',async()=>{
  const [schema,workflow]=await Promise.all([
    read('scripts/hipico-apply-e2e-schema-v290.mjs'),
    read('.github/workflows/hipico-production-gates-v290.yml')
  ]);
  assert.match(schema,/--phase=prisma-prereqs/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS auth\.users/i);
  for(const column of ['raw_user_meta_data','raw_app_meta_data','encrypted_password']) {
    assert.match(schema,new RegExp(column));
  }
  assert.match(schema,/CREATE OR REPLACE FUNCTION auth\.uid\(\)/i);
  assert.match(schema,/CREATE OR REPLACE FUNCTION auth\.jwt\(\)/i);
  assert.match(schema,/CREATE OR REPLACE FUNCTION public\.hipico_set_updated_at\(\)/i);
  assert.match(schema,/prisma-prereqs/);
  assert.match(schema,/phase === 'final'/);

  const prereq=workflow.indexOf('hipico-apply-e2e-schema-v290.mjs --phase=prisma-prereqs');
  const prisma=workflow.indexOf('npm --workspace backend run prisma:deploy');
  const final=workflow.indexOf('hipico-apply-e2e-schema-v290.mjs --phase=final');
  assert.ok(prereq>=0 && prisma>prereq && final>prisma,'prerequisites → Prisma → final chain order required');
});
