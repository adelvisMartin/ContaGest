import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const routes=readFileSync(new URL('../backend/src/modules/service-catalog/service-catalog.routes.ts',import.meta.url),'utf8');
const service=readFileSync(new URL('../backend/src/modules/service-catalog/service-catalog.service.ts',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../backend/src/modules/route-manifest.ts',import.meta.url),'utf8');
test('#849 one authenticated tenant-scoped API entry point, no unauthenticated public catalog',()=>{
  assert.match(manifest,/path: '\/service-catalog'/);
  assert.match(routes,/router\.use\(requireTenant\)/);
  assert.match(routes,/router\.use\(requirePermission\('admin\.manage'\)\)/);
  assert.match(routes,/projectPublicServiceCatalog\(\{tenantId,rows\}\)/);
  assert.match(routes,/private, no-store/);
  assert.match(routes,/status:'active',visibility:'public'/);
  assert.doesNotMatch(routes,/tenantId:\s*req\.body\.tenantId/);
});
test('#849 service command owns auditable writes and historical snapshots',()=>{
  assert.match(service,/prisma\.\$transaction\(async tx=>/);
  assert.match(service,/tx\.serviceDefinitionRevision\.create/);
  assert.match(service,/tx\.auditLog\.create/);
  assert.match(service,/FOR UPDATE/);
  assert.match(service,/before\.version!==expectedVersion/);
  assert.match(service,/buildServiceStepPlan\(/);
  assert.match(service,/await tx\.serviceStep\.createMany\(/);
});
test('#849 categories, services and staff/location use server scoped relation reads',()=>{
  assert.match(service,/tx\.product\.findFirst\(\{where:\{tenantId,id:productId,active:true\}/);
  assert.match(service,/tx\.employee\.findFirst\(\{where:\{tenantId:ctx\.tenantId,id:employeeId,active:true\}/);
  assert.match(service,/tx\.businessLocation\.findFirst\(\{where:\{tenantId:ctx\.tenantId,id:locationId,status:'active'\}/);
  for(const path of ['/services/:id/steps','/services/:id/staff/:employeeId','/services/:id/locations/:locationId','/staff/:employeeId/services']){
    assert.ok(routes.includes(path),'missing endpoint '+path);
  }
});
