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
  assert.match(routes,/projectPublicServiceCatalog\(\{tenantId,rows:rows\.slice\(0,pagination\.take\)\}\)/);
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
  assert.match(service,/tx\.employee\.findFirst\(\{\s*where:\{tenantId:ctx\.tenantId,id:employeeId,\.\.\.\(enabled\?\{active:true\}:\{\}\)/);
  assert.match(service,/tx\.businessLocation\.findFirst\(\{\s*where:\{tenantId:ctx\.tenantId,id:locationId,\.\.\.\(enabled\?\{status:'active'\}:\{\}\)/);
  for(const path of ['/services/:id/steps','/services/:id/staff/:employeeId','/services/:id/locations/:locationId','/staff/:employeeId/services']){
    assert.ok(routes.includes(path),'missing endpoint '+path);
  }
});

test('#849 changed staff/location assignment increments service version and immutable snapshot',()=>{
  const staff=service.split('export async function assignServiceStaff(')[1].split('export async function assignServiceLocation(')[0];
  const place=service.split('export async function assignServiceLocation(')[1].split('export async function setServiceStatus(')[0];
  for(const body of [staff,place]){
    assert.match(body,/data:\{version:\{increment:1\},updatedBy:actor\(ctx\)\}/);
    assert.match(body,/await snapshotRevision\(tx,ctx,updated\)/);
    assert.match(body,/if\(Boolean\(exists\)!==enabled\)/);
  }
  assert.match(service,/staff:staff\.map\(item=>item\.employeeId\),locations:locations\.map\(item=>item\.locationId\)/);
});

test('#849 category status mutation requires tenant/RBAC and strict request body',()=>{
  assert.match(routes,/router\.use\(requireTenant\)/);
  assert.match(routes,/router\.use\(requirePermission\('admin\.manage'\)\)/);
  assert.match(routes,/const categoryStatus=z\.object\(\{\s*status:z\.enum\(\['active','archived'\]\)\s*\}\)\.strict\(\)/);
  assert.match(routes,/router\.patch\('\/categories\/:id\/status',validateBody\(categoryStatus\)/);
  assert.match(routes,/setServiceCategoryStatus\(ctx\(req\),id\.data,req\.body\.status\)/);
  assert.doesNotMatch(routes,/tenantId:req\.body\.tenantId/);
});
test('#849 category archival must serialize against service creation and preserve revisions',()=>{
  const category=service.split('export async function setServiceCategoryStatus(')[1]
    .split('export async function createCatalogService(')[0];
  const refs=service.split('async function validateRefs(')[1]
    .split('async function snapshotRevision(')[0];
  assert.match(service,/async function lockedCategory\(/);
  assert.match(service,/FROM public\."ServiceCatalogCategory"/);
  assert.match(service,/FOR UPDATE/);
  assert.match(refs,/await lockedCategory\(tx,tenantId,categoryId\)/);
  assert.match(category,/prisma\.\$transaction\(async tx=>/);
  assert.match(category,/await lockedCategory\(tx,ctx\.tenantId,categoryId\)/);
  assert.match(category,/status:\{not:'archived'\}/);
  assert.match(category,/SERVICE_CATEGORY_IN_USE/);
  assert.match(category,/if\(before\.status===status\)/);
  assert.match(category,/await audit\(tx,ctx,'service-category\.status'/);
  assert.doesNotMatch(category,/serviceStep\.delete|serviceDefinitionRevision\.delete|serviceDefinition\.delete/);
});

test('#849 active onsite/hybrid services never lose their final eligible location',()=>{
  const body=service.split('export async function assignServiceLocation(')[1]
    .split('export async function setServiceStatus(')[0];
  assert.match(body,/await lockService\(tx,ctx\.tenantId,serviceId\)/);
  assert.match(body,/if\(service\.status==='active'&&service\.modality!=='remote'\)/);
  assert.match(body,/await tx\.serviceLocationEligibility\.count\(\{\s*where:\{tenantId:ctx\.tenantId,serviceId\}/);
  assert.match(body,/locationCount<=1\)denied\('SERVICE_LOCATION_REQUIRED'/);
  assert.ok(body.indexOf('locationCount<=1') < body.indexOf('await tx.serviceLocationEligibility.deleteMany('));
});
