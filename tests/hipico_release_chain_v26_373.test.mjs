import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=(relative)=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');

test('v290 schema chain keeps v25/v26 and applies v27 authority after them',async()=>{
  const source=await read('scripts/hipico-apply-e2e-schema-v290.mjs');
  const p24=source.indexOf("supabase/sql/hipico_v24_shadow_metrics.sql");
  const p25=source.indexOf("supabase/sql/hipico_v25_observability.sql");
  const p26=source.indexOf("supabase/sql/hipico_v26_audit_rpc_integrity.sql");
  const p27=source.indexOf("supabase/sql/hipico_v27_outbox_authority.sql");
  assert.ok(p24>=0&&p25>p24&&p26>p25&&p27>p26,'v25/v26/v27 migration order must follow v24');
  assert.match(source,/hipico_observability_events/);
  assert.match(source,/hipico_observability_no_mutation/);
  assert.match(source,/source['"]?\s*,?\s*['"]?authority|auditColumns/i);
  assert.match(source,/idempotency_key/);
  assert.match(source,/hipico_append_audit/);
  assert.match(source,/securityDefiner|prosecdef/i);
  assert.match(source,/anon.*execute|anonExecute/i);
  assert.match(source,/authenticated.*execute|authenticatedExecute/i);
  assert.match(source,/service.*execute|serviceRoleExecute/i);
  assert.match(source,/v12-v27/);
});

test('v290 release guard retains v25/v26 and advertises v12-v27 with v27 authority',async()=>{
  const source=await read('scripts/hipico-release-guard-v290.mjs');
  assert.match(source,/hipico_v25_observability\.sql/);
  assert.match(source,/hipico_v26_audit_rpc_integrity\.sql/);
  assert.match(source,/hipico_v27_outbox_authority\.sql/);
  assert.match(source,/hipico_v21_production_outbox\.sql/);
  assert.match(source,/hipico_v21_outbox_reconciliation_audit\.sql/);
  assert.match(source,/currentPostgresChain:\s*'v12-v27'/);
  assert.match(source,/observability/i);
  assert.match(source,/audit/i);
  assert.doesNotMatch(source,/currentPostgresChain:\s*'v12-v24'/);
});

test('v290 evidence verifier rejects the obsolete v12-v24 chain',async()=>{
  const source=await read('scripts/hipico-verify-evidence-v290.mjs');
  assert.match(source,/currentPostgresChain\s*===\s*'v12-v27'/);
  assert.match(source,/migrationsInclude\(data,\s*'hipico_v25_observability\.sql'\)/);
  assert.match(source,/migrationsInclude\(data,\s*'hipico_v26_audit_rpc_integrity\.sql'\)/);
  assert.match(source,/migrationsInclude\(data,\s*'hipico_v27_outbox_authority\.sql'\)/);
  assert.match(source,/migrationsInclude\(data,\s*'hipico_v21_production_outbox\.sql'\)/);
  assert.match(source,/migrationsInclude\(data,\s*'hipico_v21_outbox_reconciliation_audit\.sql'\)/);
  assert.match(source,/data\?\.migrations\s*===\s*'v12-v27'/);
  assert.match(source,/postgresChain:\s*'v12-v27'/);
  assert.doesNotMatch(source,/currentPostgresChain\s*===\s*'v12-v24'/);
});

test('v290 report and workflow expose the same v12-v27 chain',async()=>{
  const [report,workflow]=await Promise.all([
    read('scripts/hipico-release-report-v290.mjs'),
    read('.github/workflows/hipico-production-gates-v290.yml')
  ]);
  assert.match(report,/postgresChain:\s*'v12-v27'/);
  assert.match(report,/PostgreSQL chain:\s*\*\*v12-v27\*\*/);
  assert.match(workflow,/Apply v12-v27 Hípico schema and RLS RBAC probes/);
  assert.match(workflow,/migrations:\s*'v12-v27'/);
  assert.doesNotMatch(workflow,/migrations:\s*'v12-v24'/);
});
