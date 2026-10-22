import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const schema=readFileSync(new URL('../backend/prisma/schema.prisma',import.meta.url),'utf8');
const sql=readFileSync(new URL('../backend/prisma/migrations/20261022171000_issue_849_service_catalog_foundation/migration.sql',import.meta.url),'utf8');
test('#849 one cross-tenant-proof relational Service definition bridges the existing Product authority',()=>{
  for(const n of ['ServiceCatalogCategory','ServiceDefinition','ServiceStep',
    'ServiceDefinitionRevision','ServiceStaffCapability','ServiceLocationEligibility']){
    assert.match(schema,new RegExp('model '+n+' \\{'));
    assert.match(sql,new RegExp('CREATE TABLE public\\."'+n+'"'));
  }
  assert.match(schema,/product\s+Product\? @relation\(fields: \[tenantId, productId\], references: \[tenantId, id\]/);
  assert.match(schema,/employee\s+Employee @relation\(fields: \[tenantId, employeeId\], references: \[tenantId, id\]/);
  assert.match(schema,/location\s+BusinessLocation @relation\(fields: \[tenantId, locationId\], references: \[tenantId, id\]/);
});
test('#849 database blocks foreign tenant refs and duplicate staff/location/steps',()=>{
  for(const fields of ['tenantId","productId','tenantId","employeeId','tenantId","locationId','tenantId","serviceId']){
    assert.ok(sql.includes(fields),'composite tenant reference missing: '+fields);
  }
  assert.match(sql,/"ServiceStep_tenantId_serviceId_position_key" UNIQUE/);
  assert.match(sql,/"ServiceStaffCapability_tenantId_serviceId_employeeId_key" UNIQUE/);
  assert.match(sql,/"ServiceLocationEligibility_tenantId_serviceId_locationId_key" UNIQUE/);
  assert.match(sql,/FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql,/CREATE POLICY.*USING \(true\)/);
});
test('#849 revisions preserve immutable historical plan versions as independent rows',()=>{
  assert.match(sql,/CONSTRAINT "ServiceDefinitionRevision_tenantId_serviceId_version_key" UNIQUE/);
  assert.match(schema,/snapshot\s+Json/);
  assert.match(schema,/version\s+Int/);
});
