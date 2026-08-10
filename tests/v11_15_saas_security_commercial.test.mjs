import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('browser session moves secrets out of localStorage into HttpOnly cookies',()=>{
  const session=read('frontend/src/services/authSession.js');
  const api=read('frontend/src/services/backendApi.js');
  const cookies=read('backend/src/shared/auth/sessionCookies.ts');
  assert.match(session,/Never persist a production bearer\/access token/);
  assert.match(session,/token: _discardedToken/);
  assert.match(session,/token\(\) \{\s*return null;/s);
  assert.match(api,/credentials:'include'/);
  assert.match(api,/x-csrf-token/);
  assert.match(cookies,/httpOnly/);
  assert.match(cookies,/sameSite: 'lax'/);
  assert.match(cookies,/__Host-cg_access/);
  assert.match(cookies,/__Host-cg_refresh/);
  assert.match(cookies,/__Host-cg_csrf/);
});

test('access JWT is short lived and refresh sessions are persisted server-side',()=>{
  const jwt=read('backend/src/shared/auth/jwt.ts');
  const cookies=read('backend/src/shared/auth/sessionCookies.ts');
  const migration=read('backend/prisma/migrations/20260809174500_v11_15_saas_security_commercial/migration.sql');
  assert.match(jwt,/ACCESS_TOKEN_TTL_SECONDS = 15 \* 60/);
  assert.match(jwt,/sid\?: string/);
  assert.match(cookies,/rotationCounter/);
  assert.match(cookies,/refreshHash/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\."UserSession"/);
});

test('license hash uses one independent secret and license routes no longer contain unsafe raw SQL',()=>{
  const guard=read('backend/src/shared/licensing/licenseGuard.ts');
  const routes=read('backend/src/modules/licenses/licenses.routes.ts');
  assert.match(guard,/hashLicenseKey/);
  assert.match(guard,/env\.LICENSE_HASH_SECRET/);
  assert.match(routes,/hashLicenseKey\(rawKey\)/);
  assert.doesNotMatch(routes,/\$queryRawUnsafe|\$executeRawUnsafe/);
  assert.doesNotMatch(guard,/\$queryRawUnsafe|\$executeRawUnsafe/);
});

test('server issued device credential prevents license plus cloned deviceId from reissuing an activation',()=>{
  const guard=read('backend/src/shared/licensing/licenseGuard.ts');
  const cookies=read('backend/src/shared/auth/sessionCookies.ts');
  assert.match(guard,/cgdc_/);
  assert.match(guard,/existing\?\.credentialHash && existing\.status === 'active'/);
  assert.match(guard,/Este dispositivo ya fue activado/);
  assert.match(guard,/hashDeviceCredential/);
  assert.match(cookies,/__Host-cg_device/);
  assert.match(cookies,/sameSite:'strict'/);
});

test('multi-company identity and commercial subscription are separate from technical licenses',()=>{
  const migration=read('backend/prisma/migrations/20260809174500_v11_15_saas_security_commercial/migration.sql');
  const identity=read('backend/src/shared/identity/accountMembership.ts');
  const commercial=read('backend/src/modules/commercial/commercial.routes.ts');
  for(const table of ['AccountUser','TenantMembership','CustomerAccount','Subscription','SubscriptionTenant','ModuleEntitlement','SubscriptionPayment','SalesAgent','Commission'])assert.match(migration,new RegExp(`"${table}"`));
  assert.match(migration,/enforce_subscription_tenant_limit/);
  assert.match(migration,/enforce_license_subscription_tenant/);
  assert.match(identity,/resolveTenantSwitch/);
  assert.match(identity,/La cuenta no tiene membresía activa/);
  assert.match(commercial,/requirePermission\('platform\.manage'\)/);
  assert.match(commercial,/additionalTenantUnitPriceUsd:12/);
  assert.match(commercial,/Contador Multiempresa/);
});

test('v11.15 migration is scoped away from Budget Wallet and Hipico tables',()=>{
  const migration=read('backend/prisma/migrations/20260809174500_v11_15_saas_security_commercial/migration.sql');
  assert.doesNotMatch(migration,/budgetwallet_/i);
  assert.doesNotMatch(migration,/hipico_/i);
});

test('runtime DB configuration can use a lower-privilege connection independently from migrations',()=>{
  const env=read('backend/src/config/env.ts');
  const prisma=read('backend/src/database/prisma.ts');
  assert.match(env,/DATABASE_RUNTIME_URL/);
  assert.match(prisma,/process\.env\.DATABASE_RUNTIME_URL/);
});
