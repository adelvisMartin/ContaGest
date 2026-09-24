import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(file)=>fs.readFileSync(file,'utf8');

const auth=read('backend/src/modules/auth/auth.routes.ts');
const context=read('backend/src/shared/middleware/context.ts');
const access=read('backend/src/shared/identity/platformAccess.ts');
const subscription=read('backend/src/shared/commercial/subscriptionMiddleware.ts');
const membership=read('backend/src/shared/identity/accountMembership.ts');
const legal=read('backend/src/shared/legal/legalAcceptanceMiddleware.ts');
const migration=read('backend/prisma/migrations/20260827043000_issue_27_platform_identity_normalization/migration.sql');
const prismaSchema=read('backend/prisma/schema.prisma');

test('Role.system no identifica operador interno ni evita validateUserLicense',()=>{
  assert.doesNotMatch(auth,/isInternalUser\s*\(/);
  assert.doesNotMatch(auth,/role\?\.system|role\.system|system\s*===\s*true/);
  assert.match(auth,/platformOperator=await hasPlatformAccess/);
  assert.match(auth,/if\(!platformOperator\)\{[\s\S]*?validateUserLicense/);
});

test('platform.manage exige scope platform, tenant interno y permiso explícito',()=>{
  assert.match(access,/r\."scope"\s*=\s*\$\{PLATFORM_ROLE_SCOPE\}/);
  assert.match(access,/t\."rif"\s*=\s*\$\{PLATFORM_TENANT_RIF\}/);
  assert.match(access,/p\."key"\s*=\s*\$\{permission\}/);
  assert.match(access,/startsWith\('platform\.'\)/);
});

test('requirePermission separa permisos globales del RBAC tenant',()=>{
  assert.match(context,/isPlatformPermission\(permission\)/);
  assert.match(context,/hasPlatformAccess\(ctx, permission\)/);
  assert.match(context,/Permiso de plataforma requerido/);
  assert.doesNotMatch(context,/permission:\{key:'platform\.manage'/);
});

test('licencia, suscripción, legal y tenant switch usan la misma identidad de plataforma',()=>{
  assert.match(context,/if \(await hasPlatformAccess\(ctx\)\) return;/);
  assert.match(subscription,/hasPlatformAccess\(ctx\)/);
  assert.match(legal,/hasPlatformAccess\(ctx\)/);
  assert.match(membership,/r\."scope"='platform'/);
  assert.match(membership,/PLATFORM_TENANT_RIF/);
  assert.match(membership,/hasPlatformAccess\(\{userId:target\.userProfileId,tenantId:target\.tenantId\}\)/);
});

test('normalización revoca bindings inválidos sin conceder privilegios nuevos',()=>{
  assert.match(migration,/DELETE FROM public\."RolePermission"/);
  assert.match(migration,/t\."rif" <> '00000000'/);
  assert.match(migration,/platform_permission_requires_internal_tenant/);
  assert.match(migration,/platform_role_requires_internal_tenant/);
  assert.doesNotMatch(migration,/INSERT\s+INTO\s+public\."RolePermission"/i);
});

test('Role.system puede seguir existiendo como metadata sin autoridad',()=>{
  assert.match(prismaSchema,/model Role \{[\s\S]*?system\s+Boolean\s+@default\(false\)/);
  for(const source of [auth,context,access,subscription,membership,legal]){
    assert.doesNotMatch(source,/role\?*\.system|\.system\s*===\s*true|system\s*&&/);
  }
  assert.match(auth,/platformOperator=await hasPlatformAccess/);
});
