import test from 'node:test';
import assert from 'node:assert/strict';
import {customerRightsPage} from '../backend/src/modules/entitlements/customer-rights-pagination.mjs';

test('#852 101st entitlement is discoverable without changing array response',()=>{
  const records=Array.from({length:101},(_,index)=>({id:`entitlement-${index}`}));
  const first=customerRightsPage(records,{skip:0,take:100});
  assert.equal(first.items.length,100);
  assert.equal(first.hasMore,true);
  assert.equal(first.nextSkip,100);
  assert.deepEqual(first.items[0],records[0]);
  const last=customerRightsPage(records.slice(100),{skip:100,take:100});
  assert.deepEqual(last.items,[records[100]]);
  assert.equal(last.hasMore,false);
  assert.equal(last.nextSkip,null);
  assert.equal(records.length,101,'source cannot be truncated or mutated');
});

test('#852 exact-page and smaller-page boundaries',()=>{
  for (const [count,take,more] of [[0,100,false],[1,1,false],[2,1,true],[100,100,false]]){
    const result=customerRightsPage(Array.from({length:count},(_,i)=>i),{skip:0,take});
    assert.equal(result.items.length,Math.min(count,take));
    assert.equal(result.hasMore,more);
  }
});

test('#852 rejects invalid page bounds before DB fetch',()=>{
  for(const page of [{skip:-1,take:20},{skip:100001,take:20},{skip:0,take:0},
    {skip:0,take:101},{skip:0,take:1.5},{skip:0,take:Infinity},{skip:'0',take:20}])
    assert.throws(()=>customerRightsPage([] ,page),/ENTITLEMENT_PAGINATION_INVALID/);
});
