import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');
test('Business Location is a single tenant-scoped authority with safe boundaries',()=>{
  const schema=read('backend/prisma/schema.prisma');
  const migration=read('backend/prisma/migrations/20260930174500_issue_857_business_location_authority/migration.sql');
  const routes=read('backend/src/modules/business-locations/business-locations.routes.ts');
  const policy=read('backend/src/modules/business-locations/business-location.policy.ts');
  const manifest=read('backend/src/modules/route-manifest.ts');
  assert.match(schema,/model BusinessLocation\s*\{/);
  assert.match(schema,/@@unique\(\[tenantId, code\]\)/);
  assert.match(schema,/timezone\s+String/);
  assert.match(schema,/addressGeocodeId\s+String\?/);
  assert.doesNotMatch(schema,/model BusinessLocation[\s\S]*?(businessHours|stock|resources|pricing)\s+Json/);
  assert.match(migration,/CHECK \("status" IN \('active','inactive','closed'\)\)/);
  assert.match(migration,/pg_timezone_names/);
  assert.match(migration,/BUSINESS_LOCATION_ADDRESS_TENANT_MISMATCH/);
  assert.match(migration,/ON DELETE SET NULL/);
  assert.match(routes,/requirePermission\('admin\.manage'\)/);
  assert.match(routes,/confirmTimezoneChange/);
  assert.doesNotMatch(routes,/router\.delete\s*\(/i);
  assert.match(policy,/Intl\.DateTimeFormat/);
  assert.match(manifest,/business-locations/);
});

test('frontend exposes a reusable selector and management surface without duplicating location state',()=>{
  const registry=read('frontend/src/data/pageRegistry.js');
  const page=read('frontend/src/pages/BusinessLocationsPage.js');
  const selector=read('frontend/src/components/businessLocationSelector.js');
  const service=read('frontend/src/services/businessLocationsService.js');
  assert.match(registry,/sedes: \['\.\/pages\/BusinessLocationsPage\.js'/);
  assert.match(page,/BusinessLocationsService/);
  assert.match(page,/confirmTimezoneChange/);
  assert.match(page,/data-location-deactivate/);
  assert.match(selector,/BusinessLocationSelector/);
  assert.match(selector,/location\.id/);
  assert.doesNotMatch(service,/tenantId\s*:/);
  assert.match(service,/\/business-locations/);
});
