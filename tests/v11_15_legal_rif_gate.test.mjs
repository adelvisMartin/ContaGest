import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('legal acceptance is versioned, explicit and blocks business APIs until current documents are accepted',()=>{
  const migration=read('backend/prisma/migrations/20260809224500_v11_15_legal_acceptance_rif_lock/migration.sql');
  const catalog=read('backend/src/shared/legal/legalCatalog.ts');
  const routes=read('backend/src/modules/legal/legal.routes.ts');
  const middleware=read('backend/src/shared/legal/legalAcceptanceMiddleware.ts');
  const index=read('backend/src/modules/index.ts');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\."LegalAcceptance"/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\."CookiePreference"/);
  for(const code of ['terms','privacy','cookies','acceptable-use','suspension-termination'])assert.match(catalog,new RegExp(`code:'${code}'`));
  assert.match(routes,/necessaryCookiesAcknowledged:z\.literal\(true\)/);
  assert.match(routes,/explicit-checkbox/);
  assert.match(middleware,/new HttpError\(428/);
  assert.ok(index.indexOf("router.use('/legal', legalRoutes)")<index.indexOf('router.use(requireCurrentLegalAcceptance)'));
});

test('company RIF is immutable at database and API levels and tenant CRUD cannot enumerate other companies',()=>{
  const migration=read('backend/prisma/migrations/20260809224500_v11_15_legal_acceptance_rif_lock/migration.sql');
  const tenants=read('backend/src/modules/tenants/tenants.routes.ts');
  const index=read('backend/src/modules/index.ts');
  assert.match(migration,/tenant_rif_immutable/);
  assert.match(migration,/BEFORE UPDATE OF "rif"/);
  assert.match(tenants,/Solo puedes administrar la empresa activa/);
  assert.match(tenants,/El RIF queda bloqueado después del registro/);
  assert.match(tenants,/Plan y estado comercial no son campos autoadministrables/);
  assert.doesNotMatch(index,/entity:'tenant'.*tenantScoped:false/);
});

test('previously implemented device and commercial access modules are actually mounted',()=>{
  const index=read('backend/src/modules/index.ts');
  assert.match(index,/router\.use\('\/license-devices', licenseDeviceRoutes\)/);
  assert.match(index,/router\.use\('\/commercial-access', commercialAccessRoutes\)/);
});

test('legal migration remains scoped away from shared Hipico and Budget Wallet tables',()=>{
  const migration=read('backend/prisma/migrations/20260809224500_v11_15_legal_acceptance_rif_lock/migration.sql');
  assert.doesNotMatch(migration,/hipico_/i);
  assert.doesNotMatch(migration,/budgetwallet_/i);
});
