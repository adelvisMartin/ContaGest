#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const fail=(message)=>{console.error(`[database-authority][FAIL] ${message}`);process.exitCode=1;};
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const exists=(relative)=>fs.existsSync(path.join(root,relative));
const manifest=JSON.parse(read('config/database-authority-67-75.json'));

const walkSql=(relative)=>{
  const absolute=path.join(root,relative);
  if(!fs.existsSync(absolute))return [];
  return fs.readdirSync(absolute,{withFileTypes:true}).flatMap((entry)=>{
    const child=path.posix.join(relative,entry.name);
    return entry.isDirectory()?walkSql(child):(entry.isFile()&&entry.name.endsWith('.sql')?[child]:[]);
  });
};

const classification=[
  ...(manifest.policyAuthority?.sql||[]),
  ...(manifest.historicalEphemeralBaseline?.sql||[]),
  ...(manifest.legacyCompatibilitySql||[])
];
const counts=new Map();
for(const file of classification)counts.set(file,(counts.get(file)||0)+1);
for(const [file,count] of counts)if(count!==1)fail(`SQL classification duplicated: ${file} x${count}`);

const actualSql=[
  ...walkSql('supabase/sql'),
  ...walkSql('backend/supabase/migrations')
].sort();
const classified=[...counts.keys()].sort();
for(const file of actualSql)if(!counts.has(file))fail(`unclassified SQL surface: ${file}`);
for(const file of classified)if(!actualSql.includes(file))fail(`classified SQL file missing: ${file}`);

const structural=manifest.structuralAuthority||{};
for(const key of ['prismaSchema','migrationsDirectory','deployEntrypoint']){
  if(!structural[key]||!exists(structural[key]))fail(`missing structural authority ${key}: ${structural[key]||'(unset)'}`);
}

const migrationDirectory=path.join(root,structural.migrationsDirectory||'');
if(fs.existsSync(migrationDirectory)){
  const directories=fs.readdirSync(migrationDirectory,{withFileTypes:true}).filter((entry)=>entry.isDirectory()).map((entry)=>entry.name);
  const unique=new Set(directories);
  if(unique.size!==directories.length)fail('duplicate Prisma migration directory name');
  for(const directory of directories){
    const migration=path.posix.join(structural.migrationsDirectory,directory,'migration.sql');
    if(!exists(migration))fail(`Prisma migration directory without migration.sql: ${directory}`);
  }
  if(!directories.length)fail('no Prisma migrations found');
}

const deploy=read(structural.deployEntrypoint);
if(!/migrate['",\s]+['"]deploy/.test(deploy)&&!deploy.includes("'migrate', 'deploy'"))fail('canonical deploy entrypoint must execute prisma migrate deploy');
if(/migrate\s+reset|db\s+push/.test(deploy))fail('canonical deploy entrypoint must not reset or db push');
if(!deploy.includes('EPHEMERAL_DATABASE_PATTERN'))fail('canonical deploy must keep explicit ephemeral baseline guard');

const backendPackage=JSON.parse(read('backend/package.json'));
if(!String(backendPackage.scripts?.['prisma:deploy']||'').includes('prisma-deploy-safe.mjs'))fail('backend prisma:deploy must use prisma-deploy-safe.mjs');
if(!String(backendPackage.scripts?.['db:create:safe']||'').includes('prisma:deploy'))fail('db:create:safe must flow through prisma:deploy');
if(String(backendPackage.scripts?.['db:create:safe']||'').includes('supabase:db:push'))fail('db:create:safe must not use supabase db push');

const policySql=manifest.policyAuthority?.sql||[];
for(const file of policySql){
  const sql=read(file);
  if(/\bCREATE\s+TABLE\b/i.test(sql))fail(`policy SQL must not create structural tables: ${file}`);
}
const policyEntrypoint=manifest.policyAuthority?.applyEntrypoint;
if(!policyEntrypoint||!exists(policyEntrypoint))fail('policy apply entrypoint missing');
else{
  const source=read(policyEntrypoint);
  const rlsPolicy='backend/supabase/migrations/0002_rls_policies.sql';
  if(policySql.includes(rlsPolicy)&&!source.includes('0002_rls_policies.sql'))fail('RLS apply entrypoint must execute the classified RLS policy file');
}

const baseline=manifest.historicalEphemeralBaseline||{};
if(!baseline.bootstrapEntrypoint||!exists(baseline.bootstrapEntrypoint))fail('ephemeral baseline entrypoint missing');
else{
  const source=read(baseline.bootstrapEntrypoint);
  for(const suffix of baseline.allowedDatabaseSuffixes||[]){
    if(!source.includes(suffix))fail(`ephemeral bootstrap missing database suffix guard ${suffix}`);
  }
  const includes=[...source.matchAll(/\\ir\s+\.\.\/\.\.\/(supabase\/sql\/[^\s]+)/g)].map((match)=>match[1]);
  const expected=[...(baseline.sql||[])];
  if(JSON.stringify(includes)!==JSON.stringify(expected))fail(`ephemeral SQL chain drift: expected ${JSON.stringify(expected)} received ${JSON.stringify(includes)}`);
}

const legacy=new Set(manifest.legacyCompatibilitySql||[]);
for(const file of legacy){
  if(!file.startsWith('supabase/sql/'))fail(`legacy compatibility SQL outside supabase/sql: ${file}`);
}

if(!process.exitCode){
  console.log(`[database-authority][PASS] prismaMigrations=${fs.readdirSync(migrationDirectory,{withFileTypes:true}).filter((entry)=>entry.isDirectory()).length} classifiedSql=${classified.length} legacyCompatibility=${legacy.size}`);
}
