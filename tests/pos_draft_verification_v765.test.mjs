import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyPosDraftCart } from '../frontend/src/services/posDraftVerification.mjs';

const A='a5b468dc-347d-416a-80a7-8184e657db61';
const B='b5b468dc-347d-416a-80a7-8184e657db61';
const lines=[{productId:A,quantity:'2.125'},{productId:B,quantity:'1.000'}];
const labels={[A]:{sku:'00001',name:'Producto uno'},[B]:{sku:'SKU-2',name:'Producto dos'}};
const products={'00001':{id:A,sku:'00001',name:'Producto uno',price:'10',stock:77},'SKU-2':{id:B,sku:'SKU-2',name:'Producto dos'}};
const base=(override={})=>({
  lines,labels,
  resolve:async (sku)=>products[sku],
  isCurrent:()=>true,
  ...override
});
const kind=async (options)=> (await verifyPosDraftCart(options)).kind;
test('two line cart verified with canonical identity, not price or stock',async()=>{
  const result=await verifyPosDraftCart(base());
  assert.deepEqual(result,{kind:'verified',count:2});
  assert.equal(Object.isFrozen(result),true);
});
test('preserves leading zero SKU and queries all lines in order',async()=>{
  const codes=[];
  const result=await verifyPosDraftCart(base({resolve:async sku=>{codes.push(sku);return products[sku];}}));
  assert.deepEqual(codes,['00001','SKU-2']);
  assert.deepEqual(result,{kind:'verified',count:2});
});
test('server product UUID reassigned fails closed',async()=>{
  assert.equal(await kind(base({resolve:async sku=>sku==='00001'?{...products[sku],id:B}:products[sku]})),'changed');
});
test('server SKU changed for same product fails closed',async()=>{
  assert.equal(await kind(base({resolve:async sku=>sku==='00001'?{...products[sku],sku:'SKU-NEW'}:products[sku]})),'changed');
});
test('malformed server product does not yield verified',async()=>{
  for(const response of [null,{},[],{id:'bad',sku:'00001',name:'X'}]) {
    assert.equal(await kind(base({resolve:async()=>response})),'changed');
  }
});
test('rejects network errors with no partial success',async()=>{
  let calls=0;
  const result=await verifyPosDraftCart(base({resolve:async sku=>{calls++;if(sku==='SKU-2')throw Error('offline');return products[sku];}}));
  assert.deepEqual(result,{kind:'unavailable',count:0});
  assert.equal(calls,2);
});
test('rejects empty or excessive cart',async()=>{
  assert.equal(await kind(base({lines:[]})),'invalid');
  assert.equal(await kind(base({lines:Array(101).fill(lines[0])})),'invalid');
});
test('rejects invalid quantity',async()=>{
  for(const quantity of ['0','-1','1.2345','1e3',55]) {
    assert.equal(await kind(base({lines:[{productId:A,quantity}]})),'invalid');
  }
});
test('rejects duplicate product line instead of merging',async()=>{
  assert.equal(await kind(base({lines:[lines[0],lines[0]]})),'invalid');
});
test('missing or malicious SKU labels fail closed',async()=>{
  for(const sku of [null,'bad sku','<script>',' A','A'.repeat(65)]) {
    assert.equal(await kind(base({lines:[lines[0]],labels:{[A]:{sku,name:'P'}}})),'invalid');
  }
  assert.equal(await kind(base({labels:{[A]:labels[A]}})),'invalid');
});
test('rejects incorrect structures and unavailable dependencies',async()=>{
  for(const value of [null,[],{},'carrito'])assert.equal(await kind(base({lines:value})),'invalid');
  assert.equal(await kind(base({labels:[]})),'invalid');
  assert.equal(await kind(base({resolve:null})),'invalid');
  assert.equal(await kind(base({isCurrent:null})),'invalid');
});
test('detects stale tenant or cart revision before any request',async()=>{
  let calls=0;
  assert.equal(await kind(base({isCurrent:()=>false,resolve:async()=>{calls++;return null;}})),'stale');
  assert.equal(calls,0);
});
test('detects mutation after a server request resolves',async()=>{
  let version=1;
  const answer=await kind(base({resolve:async sku=>{version=2;return products[sku];},isCurrent:()=>version===1}));
  assert.equal(answer,'stale');
});
test('detects mutation after an API failure',async()=>{
  let current=true;
  assert.equal(await kind(base({resolve:async()=>{current=false;throw Error('network');},isCurrent:()=>current})),'stale');
});
test('requires every identity before reporting verified',async()=>{
  let calls=0;
  const answer=await kind(base({resolve:async sku=>{calls++;return sku==='SKU-2'?null:products[sku];}}));
  assert.equal(answer,'changed');assert.equal(calls,2);
});
test('single line valid cart works',async()=>{
  assert.deepEqual(await verifyPosDraftCart(base({lines:[lines[0]]})),{kind:'verified',count:1});
});
const page=readFileSync(new URL('../frontend/src/pages/SalesPage.jsx',import.meta.url),'utf8');
test('Sales verification calls authorized backend endpoint for each SKU',()=>{
  assert.match(page,/verifyPosDraftCart\(\{/);
  assert.match(page,/resolve:\(sku\)=>BackendApi\.get\(\x60\/sales\/pos\/product-lookup\?code=/);
  assert.match(page,/encodeURIComponent\(sku\)/);
  assert.match(page,/if\(!isCurrent\(\)\)return;/);
});
test('UI invalidates check on mutations and tenant switch',()=>{
  assert.match(page,/function invalidatePosVerification\(\)/);
  assert.match(page,/posCartRevisionRef\.current\+=1/);
  assert.match(page,/const visiblePosVerification=posTenantRef\.current===posTenantId\?posVerification:null/);
  assert.match(page,/onClick=\{\(\)=>void verifyCurrentPosDraft\(\)\}/);
  assert.match(page,/No confirma precio, existencias, impuestos ni disponibilidad para cobrar/);
});
