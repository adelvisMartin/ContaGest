import test from 'node:test';
import assert from 'node:assert/strict';
import { addPosFavorite, removePosFavorite, matchesPosFavorite, PosFavoriteError } from '../frontend/src/services/posFavoritePolicy.mjs';

const A='a5b468dc-347d-416a-80a7-8184e657db61';
const B='b5b468dc-347d-416a-80a7-8184e657db61';
const uuid=(n)=>`${String(n).padStart(8,'0')}-134d-4c86-a116-884e04d6c82a`;
const product=(id=A,sku='SKU-001')=>({id,sku,name:`Producto ${sku}`,barcode:'000123',price:'99',stock:100});
const error=(fn,code)=>assert.throws(fn,e=>e instanceof PosFavoriteError && e.code===code);

test('keeps only product identity and public label, no stock/price/fiscal data',()=>{
  assert.deepEqual(addPosFavorite([],product()),[{id:A,sku:'SKU-001',name:'Producto SKU-001'}]);
});
test('canonical UUID preserving exact SKU and its leading zeros',()=>{
  assert.deepEqual(addPosFavorite([],product(A.toUpperCase(),'000000123'))[0],{id:A,sku:'000000123',name:'Producto 000000123'});
});
test('returns frozen array and frozen objects',()=>{
  const favorites=addPosFavorite([],product());
  assert.ok(Object.isFrozen(favorites));
  assert.ok(Object.isFrozen(favorites[0]));
});
test('favorite snapshot cannot be mutated through original product',()=>{
  const source=product(); const favorites=addPosFavorite([],source);
  source.name='Otro'; assert.equal(favorites[0].name,'Producto SKU-001');
});
test('repeated favorite add is idempotent and does not consume another slot',()=>{
  const favorites=addPosFavorite([],product());
  assert.equal(addPosFavorite(favorites,product()).length,1);
});
test('different products with same SKU cannot silently coexist',()=>{
  error(()=>addPosFavorite(addPosFavorite([],product()),product(B,'SKU-001')),'SKU_COLLISION');
});
test('rejects duplicate list entries from untrusted state',()=>{
  const row=product(); error(()=>addPosFavorite([{id:A,sku:row.sku,name:row.name},{id:A,sku:row.sku,name:row.name}],product(B,'X')),'DUPLICATE');
});
test('up to twelve, thirteenth fails without replacing entries',()=>{
  let favorites=[]; for(let n=1;n<=12;n++)favorites=addPosFavorite(favorites,product(uuid(n),`SKU-${n}`));
  assert.equal(favorites.length,12); error(()=>addPosFavorite(favorites,product(uuid(13),'SKU-13')),'LIMIT');
});
test('rejects invalid list input and oversized prior state',()=>{
  error(()=>addPosFavorite(null,product()),'INVALID_LIST');
  error(()=>addPosFavorite(Array(13).fill({}),product()),'INVALID_LIST');
});
test('rejects invalid UUID, SKU, name, and data types',()=>{
  for(const value of [null,42,[],{}, {...product(),id:'invalid'}, {...product(),sku:'bad sku'}, {...product(),sku:'X'.repeat(65)}, {...product(),name:' '}, {...product(),name:'A'.repeat(161)}]){
    error(()=>addPosFavorite([],value),'INVALID_PRODUCT');
  }
});
test('removal targets only specified identity and preserves other favorites',()=>{
  const previous=addPosFavorite(addPosFavorite([],product(A,'SKU-A')),product(B,'SKU-B'));
  const result=removePosFavorite(previous,A);
  assert.deepEqual(result,[{id:B,sku:'SKU-B',name:'Producto SKU-B'}]);
  assert.equal(previous.length,2);
});
test('removal is idempotent on missing existing ID',()=>{
  assert.deepEqual(removePosFavorite([],A),[]);
});
test('removal requires valid UUID',()=>{
  error(()=>removePosFavorite([], '???'),'INVALID_ID');
});
test('server re-confirmation must match both product ID and exact SKU',()=>{
  assert.equal(matchesPosFavorite(product(A,'SKU-1'),product(A,'SKU-1')),true);
  assert.equal(matchesPosFavorite(product(A,'SKU-1'),product(B,'SKU-1')),false);
  assert.equal(matchesPosFavorite(product(A,'SKU-1'),product(A,'SKU-2')),false);
});
test('server re-confirmation rejects invalid response instead of guessing',()=>{
  for(const value of [null,{},[],{id:'invalid',sku:'SKU-1',name:'X'},product(A,'SKU 1')]){
    assert.equal(matchesPosFavorite(product(A,'SKU-1'),value),false);
  }
});
test('server re-confirmation tolerates label rename without changing identity',()=>{
  const changed={...product(A,'SKU-1'),name:'Nombre nuevo'};
  assert.equal(matchesPosFavorite(product(A,'SKU-1'),changed),true);
});
test('rejects dirty SKU whitespace and unsafe punctuation',()=>{
  for(const sku of ['A B','A\nB','A<script>',' A','A ','A\\B','']) error(()=>addPosFavorite([],product(A,sku)),'INVALID_PRODUCT');
});
