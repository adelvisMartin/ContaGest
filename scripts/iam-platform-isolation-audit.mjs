import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const executableSource = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|\s)\/\/.*$/gm, '$1');
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const sensitiveFiles = [
  'backend/src/modules/auth/auth.routes.ts',
  'backend/src/shared/middleware/context.ts',
  'backend/src/shared/commercial/subscriptionMiddleware.ts',
  'backend/src/shared/identity/accountMembership.ts',
  'backend/src/shared/legal/legalAcceptanceMiddleware.ts'
];

for (const file of sensitiveFiles) {
  const source = executableSource(read(file));
  assert(!/role\?*\.system|role\?\.system|role\.system|system\s*===\s*true/i.test(source), `${file}: Role.system no puede decidir autorización o bypass`);
  assert(!/permissions\s*:\s*\{\s*some\s*:\s*\{\s*permission\s*:\s*\{\s*key\s*:\s*['"]platform\.manage['"]/s.test(source), `${file}: platform.manage debe resolverse mediante platformAccess.ts`);
}

const platformAccess = read('backend/src/shared/identity/platformAccess.ts');
assert(platformAccess.includes('r."scope" = ${PLATFORM_ROLE_SCOPE}'), 'platformAccess debe exigir Role.scope=platform');
assert(platformAccess.includes('t."rif" = ${PLATFORM_TENANT_RIF}'), 'platformAccess debe exigir tenant interno');
assert(platformAccess.includes('p."key" = ${permission}'), 'platformAccess debe exigir permiso platform.* explícito');
assert(platformAccess.includes("startsWith('platform.')"), 'platformAccess debe rechazar permisos tenant como autoridad global');

const auth = read('backend/src/modules/auth/auth.routes.ts');
assert(auth.includes("import { hasPlatformAccess }"), 'auth login debe consumir la identidad explícita de plataforma');
assert(auth.includes('const platformOperator=await hasPlatformAccess'), 'auth login debe resolver platformOperator antes del bypass de licencia');
assert(auth.includes('if(!platformOperator){'), 'auth login sólo puede omitir licencia para platformOperator verificado');
assert(!executableSource(auth).includes('isInternalUser('), 'auth no debe conservar el atajo isInternalUser basado en system');

const context = read('backend/src/shared/middleware/context.ts');
assert(context.includes('if (isPlatformPermission(permission))'), 'requirePermission debe separar permisos globales de permisos tenant');
assert(context.includes('hasPlatformAccess(ctx, permission)'), 'requirePermission debe validar scope+tenant+permiso global');
assert(context.includes('if (await hasPlatformAccess(ctx)) return;'), 'bypass de licencia debe usar identidad explícita de plataforma');

const subscription = read('backend/src/shared/commercial/subscriptionMiddleware.ts');
assert(subscription.includes('if(await hasPlatformAccess(ctx))return next();'), 'suscripción sólo puede omitir gate para platformOperator verificado');

const legal = read('backend/src/shared/legal/legalAcceptanceMiddleware.ts');
assert(legal.includes('if(await hasPlatformAccess(ctx))return next();'), 'aceptación legal sólo puede omitir gate para platformOperator verificado');

const membership = read('backend/src/shared/identity/accountMembership.ts');
assert(membership.includes('r."scope"=\'platform\''), 'selector multiempresa debe exigir scope platform');
assert(membership.includes('t."rif"=${PLATFORM_TENANT_RIF}'), 'selector multiempresa debe exigir tenant interno');
assert(membership.includes('hasPlatformAccess({userId:target.userProfileId,tenantId:target.tenantId})'), 'tenant switch debe validar identidad explícita');

const migration = read('backend/prisma/migrations/20260827043000_issue_27_platform_identity_normalization/migration.sql');
assert(migration.includes("p.\"key\" LIKE 'platform.%'"), 'migración debe identificar bindings globales');
assert(migration.includes("t.\"rif\" <> '00000000'"), 'migración debe revocar bindings globales de tenants cliente');
assert(migration.includes('DELETE FROM public."RolePermission"'), 'normalización debe revocar, no promover, bindings inválidos');
assert(migration.includes('platform_permission_requires_internal_tenant'), 'DB debe bloquear platform.* fuera del tenant interno');
assert(!/INSERT\s+INTO\s+public\."RolePermission"/i.test(migration), 'migración #27 no puede conceder nuevos permisos');

if (failures.length) {
  console.error('[iam-platform-isolation][FAIL]');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[iam-platform-isolation][PASS] ${sensitiveFiles.length} superficies de autorización + DB normalizadas`);
