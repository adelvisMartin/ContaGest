import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('v845 sidecar owns a UUID-validated transaction tenant helper and removes legacy all-tenant policy', async () => {
  const sql = await read('ops/database/runtime-rls-policy-v845.sql');
  assert.match(sql, /contagest_runtime_tenant_id/i);
  assert.match(sql, /current_setting\s*\(\s*'contagest\.tenant_id'\s*,\s*true\s*\)/i);
  assert.match(sql, /::uuid/i);
  assert.match(sql, /SET\s+search_path\s*=\s*pg_catalog/i);
  assert.match(sql, /DROP POLICY IF EXISTS contagest_runtime_backend_all/i);
  assert.doesNotMatch(sql, /CREATE\s+POLICY\s+contagest_runtime_backend_all/i);
});

test('v845 direct tenant policy is catalog-driven and fail-closed, not USING(true)', async () => {
  const sql = await read('ops/database/runtime-rls-policy-v845.sql');
  assert.match(sql, /attname\s*=\s*'tenantId'/i);
  assert.match(sql, /contagest_runtime_tenant_scope/i);
  assert.match(sql, /"tenantId"\s*=\s*private\.contagest_runtime_tenant_id\(\)/i);
  assert.doesNotMatch(sql, /contagest_runtime_tenant_scope[^;]+USING\s*\(\s*true\s*\)/is);
});

test('v845 derives child isolation from tenant-owned parent foreign keys', async () => {
  const sql = await read('ops/database/runtime-rls-policy-v845.sql');
  assert.match(sql, /pg_constraint/i);
  assert.match(sql, /contype\s*=\s*'f'/i);
  assert.match(sql, /contagest_runtime_parent_scope/i);
  assert.match(sql, /EXISTS\s*\(/i);
});

test('v845 keeps shared/global treatment explicit and versioned', async () => {
  const sql = await read('ops/database/runtime-rls-policy-v845.sql');
  for (const table of ['Permission','AccountUser','AuthLoginAttempt','CustomerAccount','SalesAgent','Subscription','SubscriptionTenant','ModuleEntitlement','SubscriptionPayment','Commission']) {
    assert.match(sql, new RegExp(`['\"]${table}['\"]`), `${table} must be explicitly classified`);
  }
  assert.match(sql, /SHARED_CATALOG_V845/i);
  assert.match(sql, /PLATFORM_TENANT_TABLES_V845/i);
});

test('provisioning delegates to v845 and never recreates the runtime all-tenant policy', async () => {
  const sql = await read('ops/database/provision-security-roles.sql');
  assert.match(sql, /runtime-rls-policy-v845\.sql/i);
  assert.doesNotMatch(sql, /CREATE POLICY contagest_runtime_backend_all/i);
  assert.match(sql, /NOBYPASSRLS/i);
  assert.match(sql, /REVOKE CREATE ON SCHEMA public FROM contagest_runtime/i);
});

test('verification fails if a tenant-owned runtime policy becomes unconditional', async () => {
  const sql = await read('ops/database/verify-security-roles.sql');
  assert.match(sql, /RUNTIME_ALL_TENANT_POLICY/i);
  assert.match(sql, /contagest_runtime_tenant_id/i);
  assert.match(sql, /rolbypassrls/i);
});

test('multi-company identity uses narrow database helpers rather than an all-tenant Prisma read', async () => {
  const source = await read('backend/src/shared/identity/accountMembership.ts');
  assert.match(source, /contagest_runtime_list_accessible_tenants/i);
  assert.match(source, /contagest_runtime_resolve_tenant_switch/i);
  assert.match(source, /runWithRuntimeTenant\s*\(\s*row\.tenantId/i);
});
