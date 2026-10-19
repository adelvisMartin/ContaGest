import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGymMemberQuery as parse} from '../backend/src/modules/verticals/gym-member-query.ts';
const id='130849ad-a46d-5adb-a286-2774fd36bfac';
test('performance accepts normal single member plus canonical dates',()=>{
  assert.deepEqual(parse({memberId:id,from:'2026-01-01',to:'2026-10-16'},{requireMember:true,allowDates:true}),{memberId:id,from:'2026-01-01',to:'2026-10-16'});
});
test('performance requires explicit member, unlike optional nutrition filter',()=>{
  assert.throws(()=>parse({},{requireMember:true,allowDates:true}),/ID_INVALID/);
  assert.deepEqual(parse({}),{memberId:''});
});
test('untrusted array and object member ID do not coerce to another member',()=>{
  for(const memberId of [[id],{id},null,1])assert.throws(()=>parse({memberId},{requireMember:true}),/ID_INVALID/);
});
test('unknown query keys and implicit tenant override fail closed',()=>{
  for(const k of ['tenantId','userId','limit','where','__proto__']){const o=Object.create(null);o.memberId=id;o[k]='x';assert.throws(()=>parse(o,{requireMember:true,allowDates:true}),/UNKNOWN_KEY/);}
});
test('non plain query objects fail closed',()=>{
  assert.throws(()=>parse(new Date(),{requireMember:true}),/QUERY_INVALID/);
  assert.throws(()=>parse([id],{requireMember:true}),/QUERY_INVALID/);
  assert.throws(()=>parse(null,{requireMember:true}),/QUERY_INVALID/);
});
test('property getter never executes at request boundary',()=>{
  const o={};Object.defineProperty(o,'memberId',{enumerable:true,get(){throw Error('GETTER_CALLED')}});
  assert.throws(()=>parse(o,{requireMember:true}),/QUERY_INVALID/);
});
test('invalid or repeated date forms are not silently coerced',()=>{
  for(const val of [['2026-10-16'],{x:1},'10/16/2026','2026-1-01',' '])assert.throws(()=>parse({memberId:id,from:val},{allowDates:true,requireMember:true}),/DATE_INVALID/);
});
test('empty optional dates preserve route defaults and read-only shape',()=>{
 const o=parse({memberId:id,from:'',to:''},{requireMember:true,allowDates:true});
 assert.deepEqual(o,{memberId:id});assert.equal(Object.isFrozen(o),true);
});
test('oversize, whitespace padded and too short member IDs reject',()=>{
 for(const memberId of ['a',' '.repeat(15),id+' ', 'x'.repeat(129)])assert.throws(()=>parse({memberId},{requireMember:true}),/ID_INVALID/);
});
test('plain null-prototype objects from query parser are supported',()=>{
 const o=Object.create(null);o.memberId=id;
 assert.deepEqual(parse(o,{requireMember:true}),{memberId:id});
});
