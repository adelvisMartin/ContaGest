import test from 'node:test';import assert from 'node:assert/strict';
import {nextPeriodizationVersion as next} from '../backend/src/modules/verticals/gym-program-version.ts';
test('latest revision increases by exactly one',()=>{assert.equal(next(1,1),2);assert.equal(next(7,7),8)});
test('stale source cannot fork the sequence',()=>{assert.throws(()=>next(3,4),/STALE_VERSION/);assert.throws(()=>next(5,4),/STALE_VERSION/)});
test('last allowed positive postgres int creates max version',()=>{assert.equal(next(2147483646,2147483646),2147483647)});
test('int32 overflow is rejected before SQL insert',()=>{assert.throws(()=>next(2147483647,2147483647),/VERSION_INVALID/)});
test('null, NaN, infinity and floats fail closed',()=>{for(const x of [null,undefined,NaN,Infinity,1.5,-1,0,'1',Number.MAX_SAFE_INTEGER])assert.throws(()=>next(x,x),/VERSION_INVALID/)});
test('mismatched untrusted input fails closed',()=>{assert.throws(()=>next(1,NaN),/VERSION_INVALID/);assert.throws(()=>next(1,0),/VERSION_INVALID/)});
