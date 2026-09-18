import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source=await readFile(new URL('../scripts/hipico-apply-e2e-schema-v290.mjs',import.meta.url),'utf8');

test('v19 PostgreSQL role bootstrap uses valid dollar-quoted DO blocks',()=>{
  for(const role of ['anon','authenticated','service_role']){
    const pattern=new RegExp(`DO \\\$\\\\$ BEGIN CREATE ROLE ${role} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \\\$\\\\$`);
    assert.match(source,pattern,`${role} bootstrap must use DO $$ ... END $$`);
  }
});

test('v19 rejects the malformed single-dollar role bootstrap regression',()=>{
  assert.doesNotMatch(source,/DO \$ BEGIN CREATE ROLE (?:anon|authenticated|service_role) NOLOGIN;/);
});

test('v19 keeps all role creation blocks idempotent',()=>{
  const blocks=[...source.matchAll(/DO \$\$ BEGIN CREATE ROLE (anon|authenticated|service_role) NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$/g)];
  assert.equal(blocks.length,3);
  assert.deepEqual(blocks.map((match)=>match[1]).sort(),['anon','authenticated','service_role']);
});
