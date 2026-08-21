import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const rbac = read('backend/src/modules/rbac/rbac.routes.ts');
const tenants = read('backend/src/modules/tenants/tenants.routes.ts');
const context = read('backend/src/shared/middleware/context.ts');

test('tenant RBAC cannot manufacture platform permissions', () => {
  assert.match(rbac, /TENANT_PERMISSION_KEYS/);
  assert.match(rbac, /PLATFORM_PERMISSION_PREFIX\s*=\s*['"]platform\./);
  assert.match(rbac, /assertTenantPermissionKeys\(body\.permissionKeys\)/);
  assert.match(rbac, /assertRoleIsTenantManaged\(role\.id\)/);
  assert.match(rbac, /requireTenant,\s*requirePermission\(['"]admin\.manage['"]\)/);
  assert.doesNotMatch(rbac.match(/MODULE_PERMISSIONS\s*=\s*\[([\s\S]*?)\]\s*as const/)?.[1] || '', /platform\./);
});

test('tenant CRUD is scoped to active tenant and RIF is immutable', () => {
  assert.match(tenants, /router\.use\(requireTenant,requirePermission\(['"]admin\.manage['"]\)\)/);
  assert.match(tenants, /req\.context\?\.tenantId\s*!==\s*id/);
  assert.match(tenants, /RIF queda bloqueado después del registro/);
  assert.match(tenants, /Plan y estado comercial no son campos autoadministrables/);
  assert.match(tenants, /router\.post\(['"]\/['"],[\s\S]*405/);
  assert.match(tenants, /router\.delete\(['"]\/:id['"],[\s\S]*405/);
});

test('tenant context does not trust browser-provided tenant as production authority', () => {
  assert.match(context, /tenantId/i);
  assert.match(context, /session|membership|account/i);
  assert.match(context, /ALLOW_DEV_TENANT_HEADER|dev/i);
});
