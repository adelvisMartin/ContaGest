import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewPosStock,validatePosStockLines,PosStockPreviewError} from '../backend/src/modules/pos/pos-stock-preview.ts';

const A='a5b468dc-347d-416a-80a7-8184e657db61';
const B='b5b468dc-347d-416a-80a7-8184e657db61';
const line=(productId=A,quantity='1.000')=>({productId,quantity});
const stock=(id=A,qty='8.000',reserved='2.000')=>({id,stock:qty,reserved});
const fail=(fn,code)=>assert.throws(fn,e=>e instanceof PosStockPreviewError&&e.code===code);

test('exact available calculation ignores floats',()=>{
  const result=previewPosStock([line(A,'2.125')],[stock(A,'3.125','1.000')]);
  assert.equal(result.ready,true);assert.equal(result.readOnly,true);
  assert.deepEqual(result.lines[0],{productId:A,requested:'2.125',stock:'3.125',reserved:'1.000',available:'2.125',shortfall:'0.000',status:'available'});
});
test('shortfall exact to one thousandth',()=>{
  const result=previewPosStock([line(A,'1.001')],[stock(A,'1.000','0.000')]);
  assert.equal(result.ready,false);assert.equal(result.lines[0].shortfall,'0.001');
});
test('reserved inventory reduces availability, not physical stock',()=>{
  const result=previewPosStock([line(A,'5.000')],[stock(A,'6.000','2.000')]);
  assert.equal(result.lines[0].available,'4.000');assert.equal(result.lines[0].shortfall,'1.000');
});
test('fully reserved items cannot be listed as available',()=>{
  const result=previewPosStock([line(A,'0.001')],[stock(A,'7.000','7.000')]);
  assert.equal(result.lines[0].available,'0.000');assert.equal(result.lines[0].status,'shortage');
});
test('exact Decimal18,3 boundary has no binary rounding',()=>{
  const result=previewPosStock([line(A,'999999999999999.999')],[stock(A,'999999999999999.999','0.000')]);
  assert.equal(result.ready,true);assert.equal(result.lines[0].available,'999999999999999.999');
});
test('rejects overflow, zero, negatives, exponent, floats and >3 decimals',()=>{
  for(const quantity of ['9999999999999999.999','0','0.000','-1','1e3','3.1234',0.1,'01.000',''])fail(()=>previewPosStock([line(A,quantity)],[stock()]),'INVALID_QUANTITY');
});
test('rejects malformed stock/reservation',()=>{
  for(const invalid of ['-1','NaN','1e3','3.1234',1.5,null,'9999999999999999.999'])fail(()=>previewPosStock([line()],[stock(A,invalid,'0.000')]),'INVALID_STOCK');
});
test('fail closed when reserved > stock',()=>fail(()=>previewPosStock([line()],[stock(A,'0.000','0.001')]),'INVALID_STOCK'));
test('rejects missing product or inactive tenant-filtered row',()=>{
  fail(()=>previewPosStock([line(A),line(B)],[stock(A)]),'MISSING_PRODUCT');
  fail(()=>previewPosStock([line(A)],[]),'MISSING_PRODUCT');
});
test('rejects extraneous product row from any other tenant',()=>fail(()=>previewPosStock([line(A)],[stock(B)]),'INVALID_DATA'));
test('rejects duplicate stock rows',()=>{
  fail(()=>previewPosStock([line(A),line(B)],[stock(A),stock(A)]),'DUPLICATE_STOCK_ROW');
});
test('rejects duplicate product IDs even when casing differs',()=>{
  fail(()=>validatePosStockLines([line(A),line(A.toUpperCase())]),'DUPLICATE_PRODUCT');
});
test('rejects empty, non-array and >100 line carts',()=>{
  for(const item of [[],null,{},'sale',Array(101).fill(line())])fail(()=>validatePosStockLines(item),'INVALID_LINES');
});
test('rejects malformed product identifier',()=>fail(()=>validatePosStockLines([line('bad')]),'INVALID_PRODUCT'));
test('canonicalizes UUID and decimal quantity without changing the input',()=>{
  const entry=Object.freeze(line(A.toUpperCase(),'1.2'));const list=validatePosStockLines(Object.freeze([entry]));
  assert.deepEqual(list,[line(A,'1.200')]);assert.ok(Object.isFrozen(list)&&Object.isFrozen(list[0]));
});
test('multiple lines preserve operator order regardless of database order',()=>{
  const p=previewPosStock([line(B,'1.000'),line(A,'2.000')],[stock(A,'2','0'),stock(B,'1','0')]);
  assert.equal(p.ready,true);assert.deepEqual(p.lines.map(x=>x.productId),[B,A]);
});
test('one shortage makes entire preview not ready',()=>{
  const p=previewPosStock([line(A,'1'),line(B,'6')],[stock(A,'1','0'),stock(B,'5','0')]);
  assert.equal(p.ready,false);assert.deepEqual(p.lines.map(x=>x.status),['available','shortage']);
});
test('immutable result is not an inventory reservation',()=>{
  const list=Object.freeze([Object.freeze(line())]);const rows=Object.freeze([Object.freeze(stock())]);
  const p=previewPosStock(list,rows);assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.lines)&&Object.isFrozen(p.lines[0]));
  assert.equal(rows[0].stock,'8.000');assert.equal(list[0].quantity,'1.000');
});
const route=readFileSync(new URL('../backend/src/modules/sales/sales.routes.ts',import.meta.url),'utf8');
const sales=readFileSync(new URL('../frontend/src/pages/SalesPage.jsx',import.meta.url),'utf8');
test('route uses tenant and RBAC and only reads inventory',()=>{
  assert.match(route,/router\.post\('\/pos\/stock-preview', requirePermission\('sales\.view'\)/);
  const p=route.slice(route.indexOf("router.post('/pos/stock-preview'"),route.indexOf("router.get('/', requirePermission('sales.view')"));
  assert.match(p,/where:\{tenantId,active:true,id:\{in:lines\.map/);
  assert.match(p,/select:\{id:true,stock:true,reserved:true\}/);
  assert.match(p,/Cache-Control', 'private, no-store'/);
  assert.doesNotMatch(p,/\.(?:update|create|delete|upsert|executeRaw)\(/);
});
test('Sales UI sends active lines only and invalidates stale snapshots',()=>{
  assert.match(sales,/BackendApi\.post\('\/sales\/pos\/stock-preview'/);
  assert.match(sales,/posCartRevisionRef\.current===revision/);
  assert.match(sales,/posCartRef\.current===snapshot/);
  assert.match(sales,/setPosStockPreview\(null\)/);
  assert.match(sales,/No bloquea stock, no valida lotes\/sedes y no autoriza el cobro/);
});
