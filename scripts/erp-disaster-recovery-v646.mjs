#!/usr/bin/env node
// #646: fail-closed, synthetic-only PostgreSQL restore drill. No provider writes.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withEphemeralDatabase } from './local-verification-runner-v630.mjs';
import { verifyNativePostgres17 } from './zero-cost-bootstrap-v668.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SHA=/^[a-f0-9]{40}$/;
const STAGES=Object.freeze(['prerequisites','migrate-source','seed-source','rls-source',
  'fixtures','backup','fault-injection','migrate-target','rls-target','restore','api-smoke','integrity','cleanup']);
export function stagePlan(){return [...STAGES];}

export function checkAdmin(env={}){
  if (['production','preview'].includes(String(env.NODE_ENV||'').toLowerCase()) || env.VERCEL_ENV || env.CI_PRODUCTION==='true')
    throw new Error('DR646_PRODUCTION_DENIED');
  if(!env.LOCAL_VERIFY_DATABASE_ADMIN_URL)throw new Error('DR646_LOCAL_ADMIN_REQUIRED');
  let u;try{u=new URL(env.LOCAL_VERIFY_DATABASE_ADMIN_URL);}catch{throw new Error('DR646_BAD_URL');}
  if(!['postgres:','postgresql:'].includes(u.protocol) ||
     !['localhost','127.0.0.1','[::1]'].includes(u.hostname) ||
     u.pathname!=='/postgres' || u.search || u.hash || !u.username || !u.password)
    throw new Error('DR646_REMOTE_OR_NONADMIN_DENIED');
  return u;
}

export function childEnv(parent,url,sha){
  const allowed={};
  for(const k of ['PATH','Path','HOME','USERPROFILE','SystemRoot','SYSTEMROOT',
    'TEMP','TMP','TMPDIR','npm_config_cache','CI'])if(parent[k])allowed[k]=parent[k];
  return {...allowed,NODE_ENV:'test',VERCEL_ENV:'',DATABASE_URL:url,
    DIRECT_DATABASE_URL:url,DATABASE_RUNTIME_URL:url,GIT_COMMIT_SHA:sha,
    JWT_SECRET:randomBytes(32).toString('hex'),
    LICENSE_HASH_SECRET:randomBytes(32).toString('hex'),
    SEED_LEGACY_DEMO:'false',ALLOW_PUBLIC_REGISTER:'false'};
}
function execute(cmd,args,env,timeout=900000){
  const exe=process.platform==='win32' && cmd==='npm'?'npm.cmd':cmd;
  const p=spawnSync(exe,args,{cwd:ROOT,env,encoding:'utf8',shell:false,
    maxBuffer:4*1024*1024,timeout});
  // Never emit args, connection URLs, stderr or fixture records.
  if(p.error||p.status!==0)throw new Error('DR646_COMMAND_FAILED_'+cmd.toUpperCase().replace(/[^A-Z]/g,''));
  return String(p.stdout||'').trim();
}
function sql(env,statement){return execute('psql',['--dbname',env.DATABASE_URL,
  '-v','ON_ERROR_STOP=1','-Atqc',statement],env,60000);}
function shaContext(env){
  const s=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
  if(!SHA.test(s) || (env.CANDIDATE_SHA && s!==env.CANDIDATE_SHA))throw new Error('DR646_SHA_MISMATCH');
  if(execFileSync('git',['status','--porcelain'],{cwd:ROOT,encoding:'utf8'}).trim())
    throw new Error('DR646_DIRTY_TREE');
  return s;
}
export function fixtureSql(ids){
  assert.equal(ids.length,2);
  for(const id of ids)assert.match(id,/^[0-9a-f-]{36}$/i);
  return ids.map((tenant,i)=>{
    const client=randomUUID(),entry=randomUUID(),audit=randomUUID(),tax=randomUUID();
    const amount=i?'25.50':'100.00';
    return [
      'INSERT INTO public."Tenant" ("id","rif","name","status") VALUES (\''+tenant+'\',\'DR646_'+tenant.replaceAll('-','')+'\',\'Synthetic DR tenant\',\'active\');',
      'INSERT INTO public."Client" ("id","tenantId","rif","name") VALUES (\''+client+'\',\''+tenant+'\',\'DR646_'+i+'\',\'Synthetic DR client\');',
      'INSERT INTO public."LedgerEntry" ("id","tenantId","fiscalPeriod","description","posted","postedAt") VALUES (\''+entry+'\',\''+tenant+'\',\'2097-10\',\'Synthetic balanced entry\',true,now());',
      'INSERT INTO public."LedgerLine" ("id","entryId","accountCode","accountName","debit","credit") VALUES (\''+randomUUID()+'\',\''+entry+'\',\'DR646.D\',\'Synthetic Debit\','+amount+',0),(\''+randomUUID()+'\',\''+entry+'\',\'DR646.C\',\'Synthetic Credit\',0,'+amount+');',
      'INSERT INTO public."TaxPeriod" ("id","tenantId","period","status") VALUES (\''+tax+'\',\''+tenant+'\',\'2097-10\',\'open\');',
      'INSERT INTO public."AuditLog" ("id","tenantId","action","entity","entityId") VALUES (\''+audit+'\',\''+tenant+'\',\'dr.synthetic\',\'LedgerEntry\',\''+entry+'\');'
    ].join('\n');
  }).join('\n');
}
function snapshotQuery(ids){
  const scope="'"+ids.join("','")+"'";
  return "SELECT json_build_object("+
   "'tenantIds',(SELECT COALESCE(json_agg(id ORDER BY id),'[]'::json) FROM public.\"Tenant\" WHERE id IN ("+scope+")),"+
   "'clients',(SELECT COALESCE(json_agg(json_build_object('id',id,'owner',\"tenantId\") ORDER BY id),'[]'::json) FROM public.\"Client\" WHERE \"tenantId\" IN ("+scope+")),"+
   "'entries',(SELECT COALESCE(json_agg(json_build_object('id',id,'owner',\"tenantId\",'posted',posted) ORDER BY id),'[]'::json) FROM public.\"LedgerEntry\" WHERE \"tenantId\" IN ("+scope+")),"+
   "'lines',(SELECT COALESCE(json_agg(json_build_object('id',l.id,'entry',l.\"entryId\",'debit',l.debit::text,'credit',l.credit::text) ORDER BY l.id),'[]'::json) FROM public.\"LedgerLine\" l JOIN public.\"LedgerEntry\" e ON e.id=l.\"entryId\" WHERE e.\"tenantId\" IN ("+scope+")),"+
   "'taxes',(SELECT COALESCE(json_agg(json_build_object('id',id,'owner',\"tenantId\") ORDER BY id),'[]'::json) FROM public.\"TaxPeriod\" WHERE \"tenantId\" IN ("+scope+")),"+
   "'audit',(SELECT COALESCE(json_agg(json_build_object('id',id,'owner',\"tenantId\") ORDER BY id),'[]'::json) FROM public.\"AuditLog\" WHERE \"tenantId\" IN ("+scope+")),"+
   "'unbalanced',(SELECT count(*) FROM (SELECT e.id FROM public.\"LedgerEntry\" e JOIN public.\"LedgerLine\" l ON l.\"entryId\"=e.id WHERE e.\"tenantId\" IN ("+scope+") AND e.posted=true GROUP BY e.id HAVING sum(l.debit)<>sum(l.credit)) q))::text";
}
export function verifySnapshots(before,after){
  // Check both sides independently. Equal snapshots are not proof if the
  // fixture was already cross-tenant, unposted or financially invalid.
  const minorUnits=(value)=>{
    if(typeof value!=='string'||!/^(0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(value))
      throw new Error('DR646_DECIMAL_INVALID');
    const [whole,fraction='']=value.split('.');
    return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  };
  for(const snapshot of [before,after]){
    if(snapshot.tenantIds?.length!==2 || snapshot.clients?.length!==2
      || snapshot.entries?.length!==2 || snapshot.lines?.length!==4
      || snapshot.taxes?.length!==2 || snapshot.audit?.length!==2
      || Number(snapshot.unbalanced)!==0)throw new Error('DR646_INVARIANTS_FAILED');
    const tenants=new Set(snapshot.tenantIds),entries=new Set(snapshot.entries.map(x=>x.id));
    if(tenants.size!==2||entries.size!==2)throw new Error('DR646_INVARIANTS_FAILED');
    for(const row of [...snapshot.clients,...snapshot.entries,...snapshot.taxes,...snapshot.audit])
      if(!tenants.has(row.owner))throw new Error('DR646_TENANT_BOUNDARY_FAILED');
    for(const group of [snapshot.clients,snapshot.entries,snapshot.taxes,snapshot.audit]){
      const counts=new Map([...tenants].map(tenant=>[tenant,0]));
      for(const row of group)counts.set(row.owner,counts.get(row.owner)+1);
      if([...counts.values()].some(count=>count!==1))
        throw new Error('DR646_TENANT_DISTRIBUTION_FAILED');
    }
    const totals=new Map(snapshot.entries.map(entry=>{
      if(entry.posted!==true)throw new Error('DR646_POSTED_LEDGER_REQUIRED');
      return [entry.id,{lines:0,debit:0n,credit:0n}];
    }));
    for(const row of snapshot.lines){
      const entry=totals.get(row.entry);
      if(!entry)throw new Error('DR646_LEDGER_ORPHAN');
      const debit=minorUnits(row.debit),credit=minorUnits(row.credit);
      if((debit===0n)===(credit===0n))
        throw new Error('DR646_LEDGER_LINE_INVALID');
      entry.lines+=1;entry.debit+=debit;entry.credit+=credit;
    }
    for(const {lines,debit,credit} of totals.values()){
      if(lines!==2)throw new Error('DR646_LEDGER_LINE_DISTRIBUTION_FAILED');
      if(debit===0n||debit!==credit)throw new Error('DR646_LEDGER_IMBALANCE');
    }
  }
  assert.deepEqual(after,before,'DR646_RESTORED_SNAPSHOT_DIVERGED');
  return createHash('sha256').update(JSON.stringify(before)).digest('hex');
}
function scrubCode(error){
  const candidate=String(error?.message||'DR646_UNKNOWN').split(':')[0];
  return /^[A-Z0-9_]{4,96}$/.test(candidate)?candidate:'DR646_UNKNOWN';
}
export async function runDrill(env=process.env){
  const start=Date.now();
  const report={schema:'contagest-dr-v646',status:'BLOCKED',candidateSha:null,
    scope:'local-synthetic-pg17',ci:'NOT_EXECUTED',provider:'NOT_EXECUTED',stages:[],
    measuredSyntheticRpoMs:null,measuredSyntheticRtoMs:null};
  let dir=null,sha=null;
  const pass=id=>report.stages.push({id,status:'PASS'});
  try {
    const admin=checkAdmin(env);
    sha=shaContext(env);report.candidateSha=sha;
    verifyNativePostgres17({adminUrl:admin.toString()});pass('prerequisites');
    dir=await mkdtemp(path.join(os.tmpdir(),'cg-dr646-'));
    const ids=[randomUUID(),randomUUID()];
    let snapshot,backupAt,incidentAt,archiveSha;
    await withEphemeralDatabase({candidateSha:sha,cwd:ROOT,env},async(_ignored,config)=>{
      const src=childEnv(env,config.databaseUrl,sha);
      execute('npm',['--workspace','backend','run','migration:test:from-zero'],src);pass('migrate-source');
      execute('npm',['--workspace','backend','run','prisma:seed'],src);pass('seed-source');
      execute('npm',['--workspace','backend','run','db:rls'],src);pass('rls-source');
      sql(src,fixtureSql(ids));
      snapshot=JSON.parse(sql(src,snapshotQuery(ids)));
      verifySnapshots(snapshot,snapshot);pass('fixtures');
      const archive=path.join(dir,'synthetic.data.dump');
      execute('pg_dump',['--dbname',src.DATABASE_URL,'--format=custom','--data-only',
        '--no-owner','--no-acl','--schema=public',
        '--exclude-table-data=public._prisma_migrations','--file',archive],src);
      execute('pg_restore',['--list',archive],src,60000);
      archiveSha=createHash('sha256').update(await readFile(archive)).digest('hex');
      backupAt=Date.now();pass('backup');
      incidentAt=Date.now();
      sql(src,'DELETE FROM public."Tenant" WHERE id IN (\''+ids.join("','")+'\')');
      const lost=JSON.parse(sql(src,snapshotQuery(ids)));
      if(lost.tenantIds.length||lost.entries.length)throw new Error('DR646_FAULT_INJECTION_FAILED');
      pass('fault-injection');
      await new Promise(resolve=>setTimeout(resolve,25));
      await withEphemeralDatabase({candidateSha:sha,cwd:ROOT,env},async(_unused,targetConfig)=>{
        if(targetConfig.databaseName===config.databaseName)throw new Error('DR646_DATABASE_NAME_COLLISION');
        const dest=childEnv(env,targetConfig.databaseUrl,sha);
        execute('npm',['--workspace','backend','run','migration:test:from-zero'],dest);pass('migrate-target');
        execute('npm',['--workspace','backend','run','db:rls'],dest);pass('rls-target');
        // Never use dangerous ALLOW_* overrides. Only a fresh managed ephemeral target.
        const clear='DO $$ DECLARE names text; BEGIN SELECT string_agg(format(\'%I.%I\',schemaname,tablename),\', \') INTO names FROM pg_catalog.pg_tables WHERE schemaname=\'public\' AND tablename<>\'_prisma_migrations\'; IF names IS NOT NULL THEN EXECUTE \'TRUNCATE TABLE \'||names||\' RESTART IDENTITY CASCADE\'; END IF; END $$;';
        sql(dest,clear);
        execute('pg_restore',['--dbname',dest.DATABASE_URL,'--data-only','--no-owner',
          '--no-acl','--single-transaction','--exit-on-error','--disable-triggers',archive],dest);
        pass('restore');
        const smokeEnv={...dest,DR646_TENANT_IDS:ids.join(',')};
        execute('npm',['--workspace','backend','exec','--','tsx','--test',
          '../qa/erp-restore-smoke-v646.test.ts'],smokeEnv,180000);
        pass('api-smoke');
        const recovered=JSON.parse(sql(dest,snapshotQuery(ids)));
        report.syntheticDigestSha256=verifySnapshots(snapshot,recovered);
        if(createHash('sha256').update(await readFile(archive)).digest('hex')!==archiveSha)
          throw new Error('DR646_BACKUP_CHECKSUM_CHANGED');
        report.archiveSha256=archiveSha;
        report.syntheticCounts={tenants:2,clients:2,entries:2,lines:4,taxes:2,audit:2};
        pass('integrity');
      });
    });
    pass('cleanup');
    report.measuredSyntheticRpoMs=Math.max(0,incidentAt-backupAt);
    report.measuredSyntheticRtoMs=Date.now()-incidentAt;
    report.status='PASS';
  } catch(error){
    report.status=report.stages.length?'FAIL':'BLOCKED';
    report.errorCode=scrubCode(error);
  } finally {
    if(dir)try{await rm(dir,{recursive:true,force:true});}
      catch{report.status='FAIL';report.errorCode='DR646_ARCHIVE_CLEANUP_FAILED';}
    report.durationMs=Date.now()-start;
    if(sha){
      const location=path.join(ROOT,'artifacts','drill-v646',sha);
      try{await mkdir(location,{recursive:true});await writeFile(path.join(location,'report.json'),
        JSON.stringify(report,null,2)+'\n',{mode:0o600});}
      catch{report.status='FAIL';report.errorCode='DR646_EVIDENCE_WRITE_FAILED';}
    }
  }
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=await runDrill();
  console.log(JSON.stringify(result));
  if(result.status!=='PASS')process.exitCode=1;
}
