import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('67/75 database authority manifest is explicit and exhaustive',()=>{
  const manifest=JSON.parse(read('config/database-authority-67-75.json'));
  assert.equal(manifest.version,1);
  assert.equal(manifest.structuralAuthority.prismaSchema,'backend/prisma/schema.prisma');
  assert.equal(manifest.structuralAuthority.migrationsDirectory,'backend/prisma/migrations');
  assert.equal(manifest.structuralAuthority.deployEntrypoint,'backend/scripts/prisma-deploy-safe.mjs');
  assert.equal(manifest.historicalEphemeralBaseline.bootstrapEntrypoint,'ops/database/prepare-supabase-ephemeral.sql');
  assert.deepEqual(manifest.historicalEphemeralBaseline.allowedDatabaseSuffixes,['_e2e','_drill','_restore']);
  assert.ok(manifest.legacyCompatibilitySql.length>0);
});

test('67/75 executable authority audit passes against the checked-in tree',()=>{
  const result=spawnSync(process.execPath,['scripts/database-authority-audit-v6775.mjs'],{
    cwd:process.cwd(),
    encoding:'utf8',
    env:process.env,
    shell:false
  });
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout,/\[database-authority\]\[PASS\]/);
});

test('67/75 production migration scripts cannot silently switch to db push/reset',()=>{
  const deploy=read('backend/scripts/prisma-deploy-safe.mjs');
  const pkg=JSON.parse(read('backend/package.json'));
  assert.match(pkg.scripts['prisma:deploy'],/prisma-deploy-safe\.mjs/);
  assert.match(pkg.scripts['db:create:safe'],/prisma:deploy/);
  assert.doesNotMatch(pkg.scripts['db:create:safe'],/supabase:db:push/);
  assert.doesNotMatch(deploy,/migrate\s+reset|db\s+push/);
});

test('67/75 policy SQL remains non-structural and historical baseline remains ephemeral-only',()=>{
  const manifest=JSON.parse(read('config/database-authority-67-75.json'));
  for(const file of manifest.policyAuthority.sql){
    assert.doesNotMatch(read(file),/\bCREATE\s+TABLE\b/i,file);
  }
  const bootstrap=read(manifest.historicalEphemeralBaseline.bootstrapEntrypoint);
  for(const suffix of manifest.historicalEphemeralBaseline.allowedDatabaseSuffixes)assert.ok(bootstrap.includes(suffix),suffix);
  assert.match(bootstrap,/Refusing Supabase compatibility stubs in non-ephemeral database/);
});
