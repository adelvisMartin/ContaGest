import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { commercialCsv, commercialPdfBytes, sanitizeSpreadsheetCell } from '../frontend/src/utils/commercialExport.js';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const backend=read('backend/src/modules/commercial/commercial.routes.ts');
const page=read('frontend/src/pages/LicensesPage.js');
const service=read('frontend/src/services/commercialService.js');
const licenseService=read('frontend/src/services/licenseService.js');


test('commercial routes stay platform-only and expose the complete lifecycle',()=>{
  assert.match(backend,/router\.use\(requireTenant,requirePermission\('platform\.manage'\)\)/);
  assert.match(backend,/router\.patch\('\/subscriptions\/:id'/);
  assert.match(backend,/planCode:z\.string\(\).*optional\(\)/s);
  assert.match(backend,/router\.post\('\/subscriptions\/:id\/status'/);
  assert.match(backend,/router\.get\('\/payments'/);
  assert.match(backend,/router\.post\('\/commissions\/:id\/status'/);
  assert.match(backend,/router\.get\('\/activity'/);
  assert.match(backend,/tenantId:ctx\.tenantId,action:\{startsWith:'commercial\.'/);
});


test('summary and templates reflect pricing matrix v1 operational limits without a migration',()=>{
  assert.match(backend,/vendedor:\{[\s\S]*?maxTenants:1,maxUsers:3/);
  assert.match(backend,/contador:\{[\s\S]*?maxTenants:3,maxUsers:3/);
  assert.match(backend,/pyme:\{[\s\S]*?maxTenants:1,maxUsers:5/);
  assert.match(backend,/profesional:\{[\s\S]*?maxTenants:1,maxUsers:2/);
  assert.match(backend,/AS "renew15"/);
  assert.match(backend,/AS expired/);
  assert.match(backend,/AS "activeCustomers"/);
});


test('subscription suspension uses audited status transitions instead of mass assignment',()=>{
  assert.match(page,/CommercialService\.transitionSubscription\(sub\.id,next,f\.reason\.value\)/);
  assert.doesNotMatch(page,/updateSubscription\([^)]*\{\s*status\s*:/);
  assert.match(backend,/ALLOWED_SUBSCRIPTION_TRANSITIONS/);
  assert.match(backend,/commercial\.subscription\.status/);
  assert.match(backend,/statusReason:b\.reason/);
});


test('commercial console exposes filters, exports, contract/module/tenant/payment and audit workflows',()=>{
  for(const marker of ['commercialFilterForm','btnCommercialCsv','btnCommercialPdf','data-sub-edit','data-sub-modules','data-sub-tenant','data-sub-pay','data-commission-paid','Actividad comercial auditable'])assert.ok(page.includes(marker),`missing ${marker}`);
  assert.match(service,/payments\(limit=250\)/);
  assert.match(service,/updateCommissionStatus/);
  assert.match(service,/activity\(limit=80\)/);
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
