import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const fixtures=[
  {path:'qa/banking-auditable-v93.test.ts',expected:2},
  {path:'qa/import-transactional-v95.test.ts',expected:1}
];

test('PostgreSQL17 audit-failure fixtures use valid paired PL/pgSQL delimiters',()=>{
  for(const {path,expected} of fixtures){
    const src=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    const functions=[...src.matchAll(/CREATE FUNCTION public\.[\s\S]*?RETURNS trigger LANGUAGE plpgsql AS (\$+)[\s\S]*?END;\s*(\$+)`\);/g)];
    assert.equal(functions.length,expected,path+' must preserve each rollback probe');
    for(const [,opening,closing] of functions){
      assert.equal(opening,'$$',path+' PL/pgSQL opening quote');
      assert.equal(closing,'$$',path+' PL/pgSQL closing quote');
    }
    assert.equal((src.match(/DROP FUNCTION IF EXISTS/g)||[]).length,expected,
      path+' must release every synthetic trigger function');
    assert.equal((src.match(/DROP TRIGGER IF EXISTS/g)||[]).length,expected,
      path+' must release every synthetic trigger');
  }
});
