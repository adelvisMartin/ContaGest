import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReorderScanQuery} from '../backend/src/modules/reports/reorder-scan-page.ts';

test('#756 ignores no prototype values; inherited offset is rejected',()=>{
  const polluted=Object.create({skip:'900',onlyNeedsReorder:'true'});
  polluted.take='25';
  assert.throws(()=>parseReorderScanQuery(polluted),/REORDER_SCAN_QUERY_INVALID/);
});
test('#756 an inherited product filter cannot change pagination policy',()=>{
  const raw=Object.create({take:'1'});
  assert.throws(()=>parseReorderScanQuery(raw),/REORDER_SCAN_QUERY_INVALID/);
});
test('#756 query getters never execute during pagination parsing',()=>{
  const obj={};let count=0;
  Object.defineProperty(obj,'take',{enumerable:true,get(){count++;throw Error('sensitive side effect')}});
  assert.throws(()=>parseReorderScanQuery(obj),/REORDER_SCAN_QUERY_INVALID/);
  assert.equal(count,0);
});
test('#756 valid own query data and null-prototype query remain supported',()=>{
  assert.deepEqual(parseReorderScanQuery({take:'25',skip:'0',onlyNeedsReorder:'true'}),
    {take:25,skip:0,onlyNeedsReorder:true});
  const clean=Object.create(null);
  clean.take='5';clean.skip='1';
  assert.deepEqual(parseReorderScanQuery(clean),{take:5,skip:1,onlyNeedsReorder:false});
});
test('#756 plain empty query keeps canonical pagination defaults',()=>{
  const r=parseReorderScanQuery({});
  assert.ok(r.take>0);assert.equal(r.skip,0);assert.equal(r.onlyNeedsReorder,false);
});
