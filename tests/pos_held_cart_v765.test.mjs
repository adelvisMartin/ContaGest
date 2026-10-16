import test from 'node:test';
import assert from 'node:assert/strict';
import { holdPosCart, resumePosCart, discardHeldPosCart, PosHoldError } from '../frontend/src/services/posHeldCartPolicy.mjs';
import { PosCartError, addPosCartItem, setPosCartQuantity } from '../frontend/src/services/posCartPolicy.mjs';

const A='a5b468dc-347d-416a-80a7-8184e657db61';
const B='b5b468dc-347d-416a-80a7-8184e657db61';
const id=(n)=>`${String(n).padStart(8,'0')}-134d-4c86-a116-884e04d6c82a`;
const cart=(q='1.000')=>addPosCartItem([],A,q);
const names=()=>({[A]:{sku:'SKU-001',name:'Producto prueba'}});
const expectError=(fn,code)=>assert.throws(fn, e=>(e instanceof PosHoldError || e instanceof PosCartError)&&e.code===code);
const one=()=>holdPosCart([],cart(),names(),id(1));

test('hold snapshots exact immutable 18,3 quantity and product identity',()=>{
  const active=cart('2.125'), records=holdPosCart([],active,names(),id(1));
  assert.equal(records.length,1);
  assert.deepEqual(records[0].lines,[{productId:A,quantity:'2.125'}]);
  assert.equal(Object.isFrozen(records),true);
  assert.equal(Object.isFrozen(records[0]),true);
  assert.equal(Object.isFrozen(records[0].lines),true);
  assert.equal(Object.isFrozen(records[0].names[A]),true);
});
test('original mutable names cannot edit a held snapshot',()=>{
  const source=names(), records=holdPosCart([],cart(),source,id(1));
  source[A].name='Manipulado';
  assert.equal(records[0].names[A].name,'Producto prueba');
});
test('normalizes UUID and quantity; never includes price/stock or fiscal props',()=>{
  const rows=holdPosCart([], [{productId:A.toUpperCase(),quantity:'01.5',price:'99',tax:16}], names(),id(1).toUpperCase());
  assert.equal(rows[0].id,id(1));
  assert.deepEqual(rows[0].lines,[{productId:A,quantity:'1.500'}]);
  assert.equal('price' in rows[0].lines[0],false);
});
test('rejects holding an empty draft',()=>expectError(()=>holdPosCart([],[],{},id(1)),'INVALID_LINES'));
test('rejects invalid or duplicate hold IDs',()=>{
  expectError(()=>holdPosCart([],cart(),names(),'bad'),'INVALID_ID');
  expectError(()=>holdPosCart(one(),cart(),names(),id(1)),'DUPLICATE_HOLD');
});
test('at most five held carts',()=>{
  let held=[];
  for(let i=1;i<=5;i++)held=holdPosCart(held,cart(),names(),id(i));
  assert.equal(held.length,5);
  expectError(()=>holdPosCart(held,cart(),names(),id(6)),'LIMIT');
});
test('fail-closed for extra hold records or invalid record type',()=>{
  expectError(()=>holdPosCart(Array(6).fill(null),cart(),names(),id(7)),'INVALID_HELD');
  expectError(()=>resumePosCart([null],id(1),[]),'INVALID_HELD');
});
test('invalid product id and quantity never enter hold',()=>{
  expectError(()=>holdPosCart([],[{productId:'bad',quantity:'1.000'}],{},id(1)),'INVALID_PRODUCT');
  expectError(()=>holdPosCart([],[{productId:A,quantity:'-1'}],names(),id(1)),'INVALID_QUANTITY');
});
test('rejects repeated product IDs rather than merging without operator action',()=>{
  expectError(()=>holdPosCart([],[{productId:A,quantity:'1.000'},{productId:A,quantity:'2.000'}],names(),id(1)),'DUPLICATE_LINE');
});
test('missing, invalid, or excessive labels fail closed',()=>{
  expectError(()=>holdPosCart([],cart(),{},id(1)),'INVALID_NAMES');
  expectError(()=>holdPosCart([],cart(),{[A]:{sku:'',name:'P'}},id(1)),'INVALID_NAMES');
  expectError(()=>holdPosCart([],cart(),{[A]:{sku:'K',name:'P'.repeat(161)}},id(1)),'INVALID_NAMES');
});
test('resume requires empty active cart and never overwrites a live draft',()=>{
  const held=one();
  expectError(()=>resumePosCart(held,id(1),cart()),'ACTIVE_CART_NOT_EMPTY');
  assert.equal(held.length,1);
});
test('resume removes only chosen hold and preserves remaining records',()=>{
  const held=holdPosCart(one(),cart('4.125'),names(),id(2));
  const result=resumePosCart(held,id(2),[]);
  assert.deepEqual(result.cart,[{productId:A,quantity:'4.125'}]);
  assert.equal(result.names[A].sku,'SKU-001');
  assert.deepEqual(result.held.map(x=>x.id),[id(1)]);
  assert.equal(held.length,2);
  assert.equal(Object.isFrozen(result),true);
});
test('unknown or wrong hold id is not resumable',()=>{
  expectError(()=>resumePosCart(one(),id(3),[]),'NOT_FOUND');
  expectError(()=>resumePosCart(one(),'invalid',[]),'INVALID_ID');
});
test('discard removes only selected draft without modifying active cart',()=>{
  const held=holdPosCart(one(),cart(),names(),id(2));
  const remainder=discardHeldPosCart(held,id(1));
  assert.equal(held.length,2);
  assert.deepEqual(remainder.map(x=>x.id),[id(2)]);
  expectError(()=>discardHeldPosCart(remainder,id(1)),'NOT_FOUND');
});
test('tampered held entries fail closed on resume',()=>{
  const broken=[{id:id(1),lines:[{productId:A,quantity:'0.000'}],names:names()}];
  assert.throws(()=>resumePosCart(broken,id(1),[]),/POS_CART_ZERO_QUANTITY/);
});
test('resume data remains compatible with exact quantity editing policy',()=>{
  const result=resumePosCart(holdPosCart([],cart('1.001'),names(),id(1)),id(1),[]);
  assert.equal(setPosCartQuantity(result.cart,A,'2.123')[0].quantity,'2.123');
});
test('safe handling of unknown active-cart input',()=>{
  expectError(()=>resumePosCart(one(),id(1),null),'ACTIVE_CART_NOT_EMPTY');
});
