import test from 'node:test';
import assert from 'node:assert/strict';
import {previewPosStock} from '../backend/src/modules/pos/pos-stock-preview.ts';
const P='a5b468dc-347d-416a-80a7-8184e657db61';
const make=(stock='2.000',reserved='0.000',requested='1.000')=>
  previewPosStock([{productId:P,quantity:requested}],[{id:P,stock,reserved}]);
test('#765 ready means only global stock check, never checkout authorization',()=>{
  const r=make();
  assert.equal(r.ready,true);
  assert.equal(r.readOnly,true);
  assert.equal(r.authoritativeForCheckout,false);
  assert.equal(r.stockReserved,false);
});
test('#765 a shortage likewise cannot claim stock reservation',()=>{
  const r=make('1.000','0.900','1.000');
  assert.equal(r.ready,false);
  assert.equal(r.stockReserved,false);
  assert.equal(r.authoritativeForCheckout,false);
});
test('#765 no client-provided flag can turn read-only proof into checkout authorization',()=>{
  const r=previewPosStock([{productId:P,quantity:'1.000',authoritativeForCheckout:true}],
    [{id:P,stock:'2.000',reserved:'0.000',stockReserved:true}]);
  assert.equal(r.authoritativeForCheckout,false);
  assert.equal(r.stockReserved,false);
});
test('#765 projection stays immutable and requires separate transactional checkout',()=>{
  const r=make();
  assert.ok(Object.isFrozen(r));
  assert.ok(Object.isFrozen(r.lines));
  assert.equal('checkoutId' in r,false);
});
