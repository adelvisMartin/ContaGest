import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { summarizePhysicalOutbound, STOCK_MOVEMENT_ACTIVITY_VERSION } from '../backend/src/modules/reports/stock-movement-activity.ts';

const now = new Date('2026-10-15T12:00:00.000Z');
const move = (id, type, quantity, daysAgo) => ({ id, type, quantity, createdAt: new Date(now.getTime() - daysAgo*86_400_000) });
const summarize = (stockExact, movements, inactivityDays=90) => summarizePhysicalOutbound({stockExact, movements, inactivityDays, asOf:now, reconciled:true});

test('marks recent physical outbound as active at the exact cutoff day',()=>{
 const r=summarize('5.250',[move('one','in','6.250',200),move('two','out','1.000',90)]);
 assert.equal(r.status,'recent_outbound');
 assert.equal(r.outboundQuantityWindowExact,'1.000');
 assert.equal(r.outboundCountWindow,1);
 assert.equal(r.lastOutboundAt,'2026-07-17T12:00:00.000Z');
});
test('reports inactivity after window without pretending zero demand',()=>{
 const r=summarize('4.000',[move('one','in','5.000',365),move('two','out','1.000',91)]);
 assert.equal(r.status,'outbound_inactive');
 assert.equal(r.outboundCountWindow,0);
 assert.equal(r.interpretation,'PHYSICAL_OUTBOUND_ONLY_NOT_SALES_OR_DEMAND');
});
test('no outbound history is not mislabeled slow-moving',()=>{
 const r=summarize('2.125',[move('one','in','2.125',1)]);
 assert.equal(r.status,'no_outbound_recorded');
 assert.equal(r.lastOutboundAt,null);
});
test('out of stock is not classified as inactivity even if last movement is old',()=>{
 const r=summarize('0',[move('one','in','2',200),move('two','out','2',190)]);
 assert.equal(r.status,'out_of_stock');
});
test('reservations and releases never count as physical outbound',()=>{
 const r=summarize('3',[move('one','in','3',300),move('two','reservation','2',2),move('three','release','2',1)]);
 assert.equal(r.outboundCountWindow,0);
 assert.equal(r.status,'no_outbound_recorded');
});
test('negative adjustments do not count as sale or outbound',()=>{
 const r=summarize('2',[move('one','in','3',100),move('two','adjustment','-1',5)]);
 assert.equal(r.outboundCountWindow,0);
});
test('preserves very large precise quantities beyond safe JS integers',()=>{
 const r=summarize('900719925474099.000', [move('one','out','900719925474099.000',1)]);
 assert.equal(r.outboundQuantityWindowExact,'900719925474099.000');
});
test('rejects malformed or negative outbound quantity',()=>{
 for(const n of ['NaN','1e5','1.0001','-1','0']) assert.throws(
   ()=>summarize('1',[move('x','out',n,1)]),/OUTBOUND_QUANTITY_INVALID/);
});
test('invalid window, missing reconciliation or future date cannot be claimed reliable',()=>{
 assert.throws(()=>summarize('1',[],0),/OUTBOUND_ACTIVITY_INPUT_INVALID/);
 assert.throws(()=>summarize('1',[],3651),/OUTBOUND_ACTIVITY_INPUT_INVALID/);
 assert.throws(()=>summarizePhysicalOutbound({stockExact:'1',movements:[],asOf:now,inactivityDays:90,reconciled:false}),/OUTBOUND_ACTIVITY_INPUT_INVALID/);
 assert.throws(()=>summarize('1',[move('future','out','1',-1)]),/OUTBOUND_MOVEMENT_INVALID/);
});
test('source proof: route enforces tenant, RBAC, full bounded history and reconciliation',()=>{
 const s=readFileSync(new URL('../backend/src/modules/reports/reports.routes.ts',import.meta.url),'utf8');
 assert.match(s,/router\.use\(requireTenant, requirePermission\('reports.view'\)\)/);
 assert.match(s,/router\.get\('\/inventory\/slow-moving'/);
 assert.match(s,/tenantId: ctx\.tenantId/);
 assert.match(s,/take: STOCK_AGEING_MAX_MOVEMENTS \+ 1/);
 assert.match(s,/calculateStockAgeing\(/);
 assert.match(s,/reconciled: true/);
 assert.match(s,/Prisma\.TransactionIsolationLevel\.RepeatableRead/);
});
test('never includes automatic purchase authorization',()=>{
 const r=summarize('0',[]);
 assert.equal(r.noAutomaticProcurement,true);
 assert.equal(r.authority,'InventoryMovement.type=out');
 assert.equal(r.version,STOCK_MOVEMENT_ACTIVITY_VERSION);
});
