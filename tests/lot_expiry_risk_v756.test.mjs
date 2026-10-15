import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOT_EXPIRY_RISK_VERSION, LOT_EXPIRY_MAX_DAYS, expiryUtcBounds, projectLotExpiryRisk } from '../backend/src/modules/reports/lot-expiry-risk.ts';

const time = new Date('2026-10-15T23:50:00-05:00'); // UTC date is 2026-10-16
const lot = (id, expires, received = '2026-09-01T08:00:00Z') => ({
  id, productId: 'p1', lotNumber: 'L-'+id,
  expiresAt: new Date(expires), receivedAt: new Date(received),
  product: { sku: 'SKU1', name: 'Artículo', unit: 'UND' }
});

test('versions and boundaries are UTC calendar dates, not browser local clock', () => {
  assert.equal(LOT_EXPIRY_RISK_VERSION, 'lot-expiry-risk-v1');
  assert.equal(LOT_EXPIRY_MAX_DAYS, 365);
  const bounds = expiryUtcBounds(time, 30);
  assert.equal(bounds.today.toISOString(), '2026-10-16T00:00:00.000Z');
  assert.equal(bounds.start.toISOString(), '2026-10-16T00:00:00.000Z');
  assert.equal(bounds.endExclusive.toISOString(), '2026-11-16T00:00:00.000Z');
});

test('expired backfill is optional, while due-today and future classify distinctly', () => {
  assert.equal(expiryUtcBounds(time,0,true).start,null);
  const result = projectLotExpiryRisk([
    lot('1','2026-10-15'), lot('2','2026-10-16'), lot('3','2026-10-17')
  ],time,1);
  assert.deepEqual(result.map(x=>[x.risk,x.daysUntilExpiry]),[
    ['expired',-1],['due_today',0],['near_expiry',1]
  ]);
});

test('expiry is a warning only and does not fabricate stock on hand', () => {
  const [item] = projectLotExpiryRisk([lot('4','2026-10-20')],time,30);
  assert.equal(item.onHandExact,null);
  assert.equal(item.allocatableQuantityExact,null);
  assert.equal(item.allocationAllowed,false);
  assert.equal(item.requiresManualVerification,true);
  assert.equal(item.evidence,'LOT_CATALOG_DATE_ONLY');
});

test('projection does not expose lot notes, tenant identifiers or private vendor fields',()=>{
  const extra={...lot('4','2026-10-20'), notes:'private',tenantId:'foreign',supplierId:'secret'};
  const [item] = projectLotExpiryRisk([extra],time,30);
  assert.equal('tenantId' in item,false);
  assert.equal('supplierId' in item,false);
  assert.equal('notes' in item,false);
  assert.equal(item.productName,'Artículo');
});

test('window supports day-zero / 365 and rejects invalid sizes or timestamps', () => {
  assert.equal(expiryUtcBounds(time,365).endExclusive.toISOString(),'2027-10-17T00:00:00.000Z');
  for (const n of [-1,366,0.5,NaN,Infinity]) assert.throws(
    ()=>expiryUtcBounds(time,n),/EXPIRY_WINDOW_INVALID/
  );
  assert.throws(()=>expiryUtcBounds(new Date('invalid'),30),/EXPIRY_DATE_INVALID/);
});

test('rejects mismatched future rows after the requested UTC window', () => {
  assert.throws(()=>projectLotExpiryRisk([lot('5','2026-11-17')],time,30),/EXPIRY_OUTSIDE_WINDOW/);
});

test('rejects lot received in the future or invalid expiry date', () => {
  assert.throws(()=>projectLotExpiryRisk([lot('6','2026-11-01','2026-10-17T00:00:00Z')],time,30),/EXPIRY_RECEIPT_IN_FUTURE/);
  assert.throws(()=>projectLotExpiryRisk([lot('7','invalid')],time,30),/EXPIRY_DATE_INVALID/);
});

test('rejects incomplete identity, no silent invalid rows',()=>{
  assert.throws(()=>projectLotExpiryRisk([lot('','2026-10-17')],time,30),/EXPIRY_LOT_INVALID/);
});

test('real report route requires tenant and permission and never assumes lot allocations',()=>{
  const routes = (await import('node:fs')).readFileSync(
    new URL('../backend/src/modules/reports/reports.routes.ts', import.meta.url),'utf8');
  assert.match(routes,/router\.use\(requireTenant, requirePermission\('reports.view'\)\)/);
  assert.match(routes,/router\.get\('\/inventory\/expiry'/);
  assert.match(routes,/tenantId: ctx\.tenantId/);
  assert.match(routes,/product: \{ tenantId: ctx\.tenantId, active: true \}/);
  assert.match(routes,/mode: 'REVIEW_ONLY'/);
  assert.match(routes,/stockEvidence: 'NOT_AVAILABLE_WITHOUT_LOT_ALLOCATION_AUTHORITY'/);
  assert.match(routes,/take: take \+ 1/);
});
