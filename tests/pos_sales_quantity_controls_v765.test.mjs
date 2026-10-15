import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PosCartError, addPosCartItem, decrementPosCartItem, removePosCartItem, setPosCartQuantity
} from '../frontend/src/services/posCartPolicy.mjs';

const A='a5b468dc-347d-416a-80a7-8184e657db61';
const B='b5b468dc-347d-416a-80a7-8184e657db61';
const cart=(amount='1.000')=>addPosCartItem([],A,amount);
const error=(fn,code)=>assert.throws(fn,(e)=>e instanceof PosCartError&&e.code===code);

test('decrement subtracts one exactly',()=>{
  assert.deepEqual(decrementPosCartItem(cart('3.125'),A),[{productId:A,quantity:'2.125'}]);
});
test('quantity equal to one is removed, not set to zero',()=>{
  assert.deepEqual(decrementPosCartItem(cart('1.000'),A),[]);
});
test('fractional quantity smaller than one is explicitly removed by decrement',()=>{
  assert.deepEqual(decrementPosCartItem(cart('0.001'),A),[]);
  assert.deepEqual(decrementPosCartItem(cart('0.999'),A),[]);
});
test('one thousandth survives a decrement without float rounding',()=>{
  assert.equal(decrementPosCartItem(cart('1.001'),A)[0].quantity,'0.001');
});
test('large representable Decimal18,3 quantity subtracts without float overflow',()=>{
  assert.equal(decrementPosCartItem(cart('999999999999999.999'),A)[0].quantity,'999999999999998.999');
});
test('existing cart invariants still reject invalid and duplicate lines',()=>{
  error(()=>decrementPosCartItem([],A),'UNKNOWN_PRODUCT');
  error(()=>decrementPosCartItem([{productId:A,quantity:'1.000'},{productId:A,quantity:'2.000'}],A),'DUPLICATE_PRODUCT');
  error(()=>decrementPosCartItem([{productId:A,quantity:'-1'}],A),'INVALID_QUANTITY');
});
test('immutable cart is not mutated by quantity operations',()=>{
  const original=cart('2.001');
  const result=decrementPosCartItem(original,A);
  assert.equal(Object.isFrozen(original),true);
  assert.equal(Object.isFrozen(result),true);
  assert.equal(Object.isFrozen(result[0]),true);
  assert.equal(original[0].quantity,'2.001');
  assert.equal(result[0].quantity,'1.001');
});
test('preserves unrelated product and original line order',()=>{
  const before=addPosCartItem(cart('2'),B,'4');
  const after=decrementPosCartItem(before,A);
  assert.deepEqual(after,[{productId:A,quantity:'1.000'},{productId:B,quantity:'4.000'}]);
});
test('repeated decrement to zero removes; further decrement fails closed',()=>{
  const one=decrementPosCartItem(cart('3'),A);
  const two=decrementPosCartItem(one,A);
  const empty=decrementPosCartItem(two,A);
  assert.deepEqual(empty,[]);
  error(()=>decrementPosCartItem(empty,A),'UNKNOWN_PRODUCT');
});
test('manual set reuses precision/zero/overflow policy',()=>{
  const result=setPosCartQuantity(cart('1'),A,'3.125');
  assert.equal(result[0].quantity,'3.125');
  for(const invalid of ['0','0.000','3.1234','-1','1e3',2]){
    error(()=>setPosCartQuantity(result,A,invalid),invalid==='0'||invalid==='0.000'?'ZERO_QUANTITY':'INVALID_QUANTITY');
  }
});
test('incrementing and decrementing preserve thousandth quantities',()=>{
  const plus=addPosCartItem(cart('0.123'),A,'1.000');
  assert.equal(plus[0].quantity,'1.123');
  assert.equal(decrementPosCartItem(plus,A)[0].quantity,'0.123');
});
test('decrement of unknown identifier is rejected rather than modifying a line',()=>{
  error(()=>decrementPosCartItem(cart(),B),'UNKNOWN_PRODUCT');
  error(()=>decrementPosCartItem(cart(),'not-a-uuid'),'INVALID_PRODUCT');
});
