import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runDriftCheck } from './hipico-schema-drift-v15.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifestPath=path.join(root,'ops/roadmap/hipico-schema-rollout-v17.json');
const chainPath=path.join(root,'scripts/hipico-apply-e2e-schema-v290.mjs');
const SHA40=/^[a-f0-9]{40}$/i;
const CHANGE_TICKET=/^(?:#\d+|[A-Z][A-Z0-9_-]{2,63})$/i;
const READY=new Set(['NO_CHANGES','READY_FOR_MANUAL_APPLY']);
const DEFAULT_MAX_BACKUP_AGE_HOURS=24;

function normalizeSha(value){
  const sha=String(value||'').trim().toLowerCase();
  return SHA40.test(sha)?sha:null;
}

function parseMigrationOrder(chainSource){
  const marker='const migrations = [';
  const start=chainSource.indexOf(marker);
  if(start<0)return [];
  const end=chainSource.indexOf('];',start+marker.length);
  if(end<0)return [];
  const block=chainSource.slice(start,end);
  return [...block.matchAll(/'((?:supabase\/sql\/hipico_v[^']+\.sql))'/g)].map((match)=>match[1]);
}

export function validateMigrationOrder(manifest,chainSource){
  const manifestOrder=Array.isArray(manifest?.migrations)
    ? manifest.migrations.map((item)=>String(item?.path||''))
    : [];
  const canonical=parseMigrationOrder(String(chainSource||''));
  if(!canonical.length)return {ok:false,reason:'CANONICAL_MIGRATION_ORDER_NOT_FOUND',canonical,manifestOrder};
  if(manifestOrder.length!==canonical.length){
    return {ok:false,reason:'MIGRATION_ORDER_MISMATCH',canonical,manifestOrder};
  }
  const mismatch=manifestOrder.findIndex((item,index)=>item!==canonical[index]);
  if(mismatch>=0)return {ok:false,reason:'MIGRATION_ORDER_MISMATCH',canonical,manifestOrder,mismatch};
  return {ok:true,reason:null,canonical,manifestOrder};
}

export async function loadMigrationUnits(manifest,{rootDir=root}={}){
  if(!Array.isArray(manifest?.migrations))throw new Error('HIPICO_SCHEMA_ROLLOUT_MANIFEST_INVALID');
  const units=[];
  for(const entry of manifest.migrations){
    const relative=String(entry?.path||'').trim();
    if(!relative.startsWith('supabase/sql/hipico_v')||!relative.endsWith('.sql')){
      throw new Error(`HIPICO_SCHEMA_ROLLOUT_PATH_INVALID:${relative}`);
    }
    const bytes=await fs.readFile(path.resolve(rootDir,relative));
    units.push({
      path:relative,
      sha256:createHash('sha256').update(bytes).digest('hex'),
      risk:String(entry?.risk||'HIGH').toUpperCase(),
      manualReviewRequired:entry?.manualReviewRequired!==false,
      autoApply:false,
      provides:Array.isArray(entry?.provides)?[...entry.provides]:[]
    });
  }
  return units;
}

export async function loadBackupScopeContract({rootDir=root}={}){
  const manifest=JSON.parse(await fs.readFile(path.resolve(rootDir,'ops/roadmap/hipico-schema-rollout-v17.json'),'utf8'));
  const scope=String(manifest?.backupScope||'').trim();
  const migrationChain=String(manifest?.chain||'').trim();
  const tableInventory=String(manifest?.backupTableInventory||'').trim();
  if(!scope||!migrationChain||!tableInventory){
    throw new Error('HIPICO_BACKUP_SCOPE_CONTRACT_INVALID');
  }
  if(!tableInventory.startsWith('ops/backup/')||!tableInventory.endsWith('.txt')){
    throw new Error('HIPICO_BACKUP_TABLE_INVENTORY_INVALID');
  }
  const bytes=await fs.readFile(path.resolve(rootDir,tableInventory));
  const tableManifestSha256=createHash('sha256').update(bytes).digest('hex');
  return {scope,migrationChain,tableInventory,tableManifestSha256};
}

export function validateBackupEvidence(evidence,{
  candidateSha,
  targetDatabase,
  expectedScope,
  expectedMigrationChain,
  expectedTableManifestSha256,
  now=new Date(),
  maxAgeHours=DEFAULT_MAX_BACKUP_AGE_HOURS
}={}){
  const sha=normalizeSha(candidateSha);
  if(!evidence||typeof evidence!=='object')return {ok:false,reason:'BACKUP_RESTORE_EVIDENCE_REQUIRED'};
  if(evidence.schema!=='hipico-schema-backup-evidence.v17')return {ok:false,reason:'BACKUP_EVIDENCE_SCHEMA_INVALID'};
  if(!sha||normalizeSha(evidence.candidateSha)!==sha)return {ok:false,reason:'BACKUP_EVIDENCE_SHA_MISMATCH'};
  if(String(evidence.status||'').toUpperCase()!=='PASS')return {ok:false,reason:'BACKUP_EVIDENCE_NOT_PASS'};
  if(evidence.restoreVerified!==true)return {ok:false,reason:'BACKUP_RESTORE_EVIDENCE_INVALID'};
  if(!String(evidence.backupId||'').trim()||!String(evidence.restoreTestId||'').trim()){
    return {ok:false,reason:'BACKUP_RESTORE_IDENTIFIERS_REQUIRED'};
  }
  if(targetDatabase&&String(evidence.targetDatabase||'')!==String(targetDatabase)){
    return {ok:false,reason:'BACKUP_TARGET_MISMATCH'};
  }
  if(expectedScope&&String(evidence.scope||'').trim()!==String(expectedScope)){
    return {ok:false,reason:'BACKUP_SCOPE_MISMATCH'};
  }
  if(expectedMigrationChain&&String(evidence.migrationChain||'').trim()!==String(expectedMigrationChain)){
    return {ok:false,reason:'BACKUP_MIGRATION_CHAIN_MISMATCH'};
  }
  const evidenceTableManifestSha256=String(evidence.tableManifestSha256||'').trim().toLowerCase();
  if(expectedTableManifestSha256&&(
    !/^[a-f0-9]{64}$/.test(evidenceTableManifestSha256)
    || evidenceTableManifestSha256!==String(expectedTableManifestSha256).trim().toLowerCase()
  )){
    return {ok:false,reason:'BACKUP_TABLE_MANIFEST_MISMATCH'};
  }
  const checkedAt=new Date(String(evidence.checkedAt||''));
  if(Number.isNaN(checkedAt.getTime()))return {ok:false,reason:'BACKUP_EVIDENCE_TIME_INVALID'};
  const maxAge=Math.max(1,Math.min(168,Number(maxAgeHours)||DEFAULT_MAX_BACKUP_AGE_HOURS))*60*60*1000;
  const age=now.getTime()-checkedAt.getTime();
  if(age<0||age>maxAge)return {ok:false,reason:'BACKUP_EVIDENCE_STALE'};
  return {
    ok:true,
    reason:null,
    sanitized:{
      backupId:String(evidence.backupId),
      restoreTestId:String(evidence.restoreTestId),
      restoreVerified:true,
      targetDatabase:String(evidence.targetDatabase||targetDatabase||''),
      scope:String(evidence.scope||expectedScope||''),
      migrationChain:String(evidence.migrationChain||expectedMigrationChain||''),
      tableManifestSha256:evidenceTableManifestSha256,
      checkedAt:checkedAt.toISOString()
    }
  };
}

function basePlan({candidateSha,driftReport,migrationUnits,changeTicket,now}){
  return {
    schema:'hipico-schema-rollout-plan.v17',
    candidateSha:normalizeSha(candidateSha),
    generatedAt:now.toISOString(),
    status:'BLOCKED',
    reason:null,
    autoApply:false,
    manualApplyRequired:true,
    changeTicket:CHANGE_TICKET.test(String(changeTicket||'').trim())?String(changeTicket).trim():null,
    target:{
      database:String(driftReport?.target?.database||'')||null,
      remote:driftReport?.target?.remote===true
    },
    driftStatus:String(driftReport?.status||'NOT_EXECUTED'),
    missingCapabilities:Array.isArray(driftReport?.missing)?[...driftReport.missing]:[],
    backup:null,
    migrations:migrationUnits.map((unit)=>({
      path:unit.path,
      sha256:unit.sha256,
      risk:unit.risk,
      manualReviewRequired:unit.manualReviewRequired!==false,
      autoApply:false,
      provides:Array.isArray(unit.provides)?[...unit.provides]:[]
    }))
  };
}

export function buildRolloutPlan({
  candidateSha,
  driftReport,
  migrationUnits=[],
  backupEvidence=null,
  changeTicket='',
  backupScopeContract=null,
  orderValidation={ok:true,reason:null},
  now=new Date(),
  maxBackupAgeHours=DEFAULT_MAX_BACKUP_AGE_HOURS
}={}){
  const plan=basePlan({candidateSha,driftReport,migrationUnits,changeTicket,now});
  const sha=normalizeSha(candidateSha);
  if(!sha){
    plan.reason='CANDIDATE_SHA_REQUIRED';
    return plan;
  }
  if(orderValidation?.ok!==true){
    plan.reason=String(orderValidation?.reason||'MIGRATION_ORDER_MISMATCH');
    return plan;
  }
  if(!driftReport||typeof driftReport!=='object'){
    plan.status='NOT_EXECUTED';
    plan.reason='DRIFT_EVIDENCE_REQUIRED';
    return plan;
  }
  if(driftReport.status==='NOT_EXECUTED'){
    plan.status='NOT_EXECUTED';
    plan.reason=String(driftReport.reason||'DRIFT_NOT_EXECUTED');
    return plan;
  }
  if(normalizeSha(driftReport.candidateSha)!==sha){
    plan.reason='DRIFT_SHA_MISMATCH';
    return plan;
  }
  if(driftReport.status==='MATCH'){
    plan.status='NO_CHANGES';
    plan.reason=null;
    return plan;
  }
  if(driftReport.status!=='DRIFT'){
    plan.reason='DRIFT_STATUS_INVALID';
    return plan;
  }
  if(!plan.changeTicket){
    plan.reason='CHANGE_TICKET_REQUIRED';
    return plan;
  }
  if(!backupScopeContract
      || !String(backupScopeContract.scope||'').trim()
      || !String(backupScopeContract.migrationChain||'').trim()
      || !/^[a-f0-9]{64}$/i.test(String(backupScopeContract.tableManifestSha256||'').trim())){
    plan.reason='BACKUP_SCOPE_CONTRACT_REQUIRED';
    return plan;
  }

  const backup=validateBackupEvidence(backupEvidence,{
    candidateSha:sha,
    targetDatabase:plan.target.database,
    expectedScope:backupScopeContract.scope,
    expectedMigrationChain:backupScopeContract.migrationChain,
    expectedTableManifestSha256:backupScopeContract.tableManifestSha256,
    now,
    maxAgeHours:maxBackupAgeHours
  });
  if(!backup.ok){
    plan.reason=backup.reason;
    return plan;
  }

  plan.status='READY_FOR_MANUAL_APPLY';
  plan.reason=null;
  plan.backup=backup.sanitized;
  return plan;
}

async function readJsonIfConfigured(file){
  const configured=String(file||'').trim();
  if(!configured)return null;
  const content=await fs.readFile(path.resolve(configured),'utf8');
  return JSON.parse(content);
}

export async function runPreflight({env=process.env,now=new Date(),driftRunner=runDriftCheck}={}){
  const [manifestText,chainSource]=await Promise.all([
    fs.readFile(manifestPath,'utf8'),
    fs.readFile(chainPath,'utf8')
  ]);
  const manifest=JSON.parse(manifestText);
  const orderValidation=validateMigrationOrder(manifest,chainSource);
  const migrationUnits=await loadMigrationUnits(manifest);
  const backupScopeContract=await loadBackupScopeContract();
  const candidateSha=String(env.HIPICO_CANDIDATE_SHA||env.GITHUB_SHA||'').trim();

  let driftReport;
  try{
    driftReport=await driftRunner({env});
  }catch(error){
    driftReport={
      schema:'hipico-schema-drift-report.v15',
      candidateSha:normalizeSha(candidateSha),
      status:'NOT_EXECUTED',
      reason:String(error?.code||'SCHEMA_DRIFT_CHECK_FAILED').slice(0,120),
      target:{database:null,remote:false},
      missing:[],
      observed:[]
    };
  }

  let backupEvidence=null;
  try{
    backupEvidence=await readJsonIfConfigured(env.HIPICO_SCHEMA_BACKUP_EVIDENCE);
  }catch{
    backupEvidence={schema:'invalid'};
  }

  return buildRolloutPlan({
    candidateSha,
    driftReport,
    migrationUnits,
    backupEvidence,
    changeTicket:String(env.HIPICO_SCHEMA_CHANGE_TICKET||'').trim(),
    backupScopeContract,
    orderValidation,
    now,
    maxBackupAgeHours:Number(env.HIPICO_SCHEMA_BACKUP_MAX_AGE_HOURS||manifest.maxBackupAgeHours||DEFAULT_MAX_BACKUP_AGE_HOURS)
  });
}

async function main(){
  const plan=await runPreflight();
  const output=String(process.env.HIPICO_SCHEMA_ROLLOUT_REPORT||'').trim();
  if(output){
    await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});
    await fs.writeFile(path.resolve(output),`${JSON.stringify(plan,null,2)}\n`,'utf8');
  }
  console.log(JSON.stringify(plan));
  if(plan.status==='NOT_EXECUTED')process.exitCode=3;
  else if(plan.status==='BLOCKED')process.exitCode=4;
  else if(!READY.has(plan.status))process.exitCode=5;
}

const isMain=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(isMain)await main();

export const __test__={
  normalizeSha,
  parseMigrationOrder,
  readJsonIfConfigured
};
