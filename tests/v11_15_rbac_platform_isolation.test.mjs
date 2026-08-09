import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('tenant RBAC uses an explicit permission allowlist and rejects platform namespace',()=>{
  const rbac=read('backend/src/modules/rbac/rbac.routes.ts');
  assert.match(rbac,/TENANT_PERMISSION_KEYS/);
  assert.match(rbac,/PLATFORM_PERMISSION_PREFIX = 'platform\.'/);
  assert.match(rbac,/assertTenantPermissionKeys/);
  assert.match(rbac,/Los roles de plataforma no pueden modificarse/);
  assert.match(rbac,/Permisos reservados o no administrables por el tenant/);
  assert.doesNotMatch(rbac,/MODULE_PERMISSIONS.*platform\.manage/s);
});

test('platform.manage is provisioned only by the dedicated platform migration, not tenant bootstrap',()=>{
  const migration=read('backend/prisma/migrations/20260809175500_v11_15_platform_permission/migration.sql');
  const rbac=read('backend/src/modules/rbac/rbac.routes.ts');
  assert.match(migration,/Administrador Global/);
  assert.match(migration,/t\."rif" = '00000000'/);
  assert.match(migration,/platform\.manage/);
  assert.doesNotMatch(rbac,/permissions:\s*\[[^\]]*platform\.manage/s);
});
