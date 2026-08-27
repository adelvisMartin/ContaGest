import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { commercialCsv, commercialPdfBytes, sanitizeSpreadsheetCell } from '../frontend/src/utils/commercialExport.js';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const backend=read('backend/src/modules/commercial/commercial.routes.ts');
const governance=read('backend/src/modules/commercial/service-restrictions.routes.ts');
const moduleIndex=read('backend/src/modules/index.ts');
const page=read('frontend/src/pages/LicensesPage.js');
const service=read('frontend/src/services/commercialService.js');
const enhancer=read('frontend/src/services/commercialAccessEnhancer.js');
const licenseService=read('frontend/src/services/licenseService.js');

test('commercial routes stay platform-only and expose the complete governed lifecycle',()=>{
  assert.match(backend,/router\.use\(requireTenant,requirePermission\('platform\.manage'\)\)/);
  assert.match(governance,/router\.use\(requireTenant,requirePermission\('platform\.manage'\)\)/);
  assert.match(backend,/router\.patch\('\/subscriptions\/:id'/);
  assert.match(governance,/router\.post\('\/subscriptions\/:id\/suspend'/);
  assert.match(governance,/router\.post\('\/subscriptions\/:id\/reactivate'/);
  assert.match(governance,/router\.post\('\/subscriptions\/:id\/terminate'/);
  assert.match(backend,/router\.get\('\/payments'/);
  assert.match(backend,/router\.post\('\/commissions\/:id\/status'/);
  assert.match(backend,/router\.get\('\/activity'/);
  assert.match(backend,/tenantId:ctx\.tenantId,action:\{startsWith:'commercial\.'/);
  const governed=moduleIndex.indexOf("router.use('/commercial', serviceRestrictionRoutes)");
  const legacy=moduleIndex.indexOf("router.use('/commercial', commercialRoutes)");
  assert.ok(governed>=0&&legacy>governed,'governance router must intercept commercial mutations before the historical router');
});

test('summary and templates reflect pricing matrix v1 operational limits without a migration',()=>{
  assert.match(backend,/vendedor:\{[\s\S]*?maxTenants:1,maxUsers:3/);
  assert.match(backend,/contador:\{[\s\S]*?maxTenants:3,maxUsers:3/);
  assert.match(backend,/pyme:\{[\s\S]*?maxTenants:1,maxUsers:5/);
  assert.match(backend,/profesional:\{[\s\S]*?maxTenants:1,maxUsers:2/);
  assert.match(backend,/maxTenants:z\.coerce\.number\(\)[\s\S]*?\.optional\(\),maxUsers:z\.coerce\.number\(\)[\s\S]*?\.optional\(\)/);
  assert.match(backend,/const customerSegment=b\.customerSegment\?\?template\?\.segment\?\?'smb'/);
  assert.match(backend,/const maxTenants=b\.maxTenants\?\?template\?\.maxTenants\?\?1/);
  assert.match(backend,/const maxUsers=b\.maxUsers\?\?template\?\.maxUsers\?\?3/);
  assert.match(backend,/AS "renew15"/);
  assert.match(backend,/AS expired/);
  assert.match(backend,/AS "activeCustomers"/);
});

test('subscription restriction fails closed through durable governed cases instead of free-text status mutation',()=>{
  assert.match(governance,/endpoint genérico de estado fue retirado/);
  assert.match(governance,/Subscription\.status no puede modificarse por PATCH/);
  assert.match(governance,/ServiceRestrictionCase/);
  assert.match(governance,/commercial\.subscription\.suspend/);
  assert.match(governance,/commercial\.subscription\.reactivate/);
  assert.match(governance,/commercial\.subscription\.terminate/);
  assert.match(service,/suspendSubscription/);
  assert.match(service,/reactivateSubscription/);
  assert.match(service,/terminateSubscription/);
  assert.match(service,/transición genérica fue retirada/);
  assert.doesNotMatch(page,/updateSubscription\([^)]*\{\s*status\s*:/);
  assert.match(enhancer,/oldButton\.replaceWith\(clone\)/);
  assert.match(enhancer,/data-governance-bound|governanceBound/);
});

test('commercial console exposes filters, exports, contract/module/tenant/payment and audit workflows',()=>{
  for(const marker of ['commercialFilterForm','btnCommercialCsv','btnCommercialPdf','data-sub-edit','data-sub-modules','data-sub-tenant','data-sub-pay','data-commission-paid','Actividad comercial auditable'])assert.ok(page.includes(marker),`missing ${marker}`);
  assert.match(service,/payments\(limit=250\)/);
  assert.match(service,/updateCommissionStatus/);
  assert.match(service,/activity\(limit=80\)/);
});

test('commercial load errors render once and wait for explicit refresh instead of retry-looping',()=>{
  assert.match(page,/!Store\.get\(\)\.commercial\?\.loaded&&!Store\.get\(\)\.commercial\?\.error/);
  assert.match(page,/loaded:false,error:error\.message/);
  assert.match(page,/!c\.loaded&&!c\.error/);
});

test('license activation inventory uses the existing tenant-scoped device router',()=>{
  assert.match(licenseService,/devices\(licenseId\)/);
  assert.match(licenseService,/\/license-devices\/\$\{encodeURIComponent\(licenseId\)\}/);
  assert.match(page,/data-license-devices/);
  assert.match(page,/LicenseService\.revokeDevice/);
});

test('CSV export neutralizes spreadsheet formula injection and quotes values',()=>{
  assert.equal(sanitizeSpreadsheetCell('=HYPERLINK("https://evil.invalid")'),'\'=HYPERLINK("https://evil.invalid")');
  assert.equal(sanitizeSpreadsheetCell('@SUM(A1:A2)'),"'@SUM(A1:A2)");
  assert.equal(sanitizeSpreadsheetCell('Cliente CA'),'Cliente CA');
  const csv=commercialCsv([{customerName:'=2+2',amount:10}],[{key:'customerName',label:'Cliente'},{key:'amount',label:'Importe'}]);
  assert.ok(csv.startsWith('\uFEFF"Cliente","Importe"'));
  assert.ok(csv.includes('"\'=2+2"'));
});

test('PDF export produces a self-contained PDF document without external libraries',()=>{
  const bytes=commercialPdfBytes({title:'ContaGest comercial',rows:[{customerName:'Cliente CA',amount:19}],columns:[{key:'customerName',label:'Cliente'},{key:'amount',label:'Importe'}]});
  const text=Buffer.from(bytes).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.match(text,/xref\n0 \d+/);
  assert.match(text,/\/Type \/Page/);
  assert.match(text,/startxref\n\d+\n%%EOF/);
});
