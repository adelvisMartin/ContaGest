import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalPageInteger} from '../backend/src/shared/http-query-pagination.mjs';

test('#849/#852 canonical page integers preserve defaults and strict query-string boundaries',()=>{
  assert.equal(canonicalPageInteger(undefined),undefined);
  for(const [raw,number] of [['0',0],['1',1],['10',10],['100000',100000]])
    assert.equal(canonicalPageInteger(raw),number,raw);
  for(const raw of [
    '', '01','00','+1','-1','1.0','1e2',' 2 ','2 ','-0',
    '9007199254740992','Infinity','NaN','12%20',null,1,0,true,
    ['1'],['1','2'],{value:'1'},new Date()
  ])assert.equal(Number.isNaN(canonicalPageInteger(raw)),true,String(raw));
});

test('#849 catalog all paginated endpoints use the same strict schema',()=>{
  const file=readFileSync(new URL('../backend/src/modules/service-catalog/service-catalog.routes.ts',import.meta.url),'utf8');
  assert.match(file,/import \{ canonicalPageInteger \} from '\.\.\/\.\.\/shared\/http-query-pagination\.mjs'/);
  assert.equal((file.match(/take:z\.preprocess\(canonicalPageInteger,z\.number\(\)\.int\(\)\.min\(1\)\.max\(100\)/g)||[]).length,2);
  assert.equal((file.match(/skip:z\.preprocess\(canonicalPageInteger,z\.number\(\)\.int\(\)\.min\(0\)\.max\(100000\)/g)||[]).length,2);
  assert.match(file,/const pagination=listQuery\.parse\(req\.query\)/);
  assert.match(file,/const \{take,skip,status,search\}=categoryListQuery\.parse\(req\.query\)/);
  assert.match(file,/const \{take,skip,status,categoryId,search\}=serviceListQuery\.parse\(req\.query\)/);
  assert.doesNotMatch(file,/z\.coerce\.number\(\)/);
  assert.match(file,/setPageHeaders\(res,rows\.length,/);
});

test('#852 benefit and customer rights routes reject polluted page shapes before querying',()=>{
  const file=readFileSync(new URL('../backend/src/modules/entitlements/customer-entitlement.routes.ts',import.meta.url),'utf8');
  assert.match(file,/import \{ canonicalPageInteger \} from '\.\.\/\.\.\/shared\/http-query-pagination\.mjs'/);
  assert.match(file,/take:z\.preprocess\(canonicalPageInteger,z\.number\(\)\.int\(\)\.min\(1\)\.max\(100\)\.default\(100\)\)/);
  assert.match(file,/skip:z\.preprocess\(canonicalPageInteger,z\.number\(\)\.int\(\)\.min\(0\)\.max\(100000\)\.default\(0\)\)/);
  assert.equal((file.match(/rightsPagination\.parse\(req\.query\)/g)||[]).length,2);
  assert.doesNotMatch(file,/z\.coerce\.number\(\)/);
  assert.match(file,/Cache-Control','private, no-store'/);
});
