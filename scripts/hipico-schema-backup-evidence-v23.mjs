import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SHA40=/^[a-f0-9]{40}$/i;
const SHA64=/^[a-f0-9]{64}$/i;
const EXPECTED_SCOPE='hipico-canonical-v12-v27';
const EXPECTED_CHAIN='v12-v27';
const MODES=new Set(['PRE_ROLLOUT','STEADY_STATE']);
const DEFAULT_INVENTORY=path.join(root,'ops/backup/hipico-public-tables.txt');

function normalizeTableList(value){
  if(!Array.isArray(value))return null;
  const tables=value.map((item)=>String(item||'').trim()).filter(Boolean);
  if(!tables.length||new Set(tables).size!==tables.length)return null;
  if(tables.some((table)=>!/^hipico_[a-z0-9_]+$/.test(table)))return null;
  return tables;
}

function normalizeCountsForTables(value,tables){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const expected=[...tables].sort();
  const keys=Object.keys(value).sort();
  if(JSON.stringify(keys)!==JSON.stringify(expected))return null;
  const normalized={};
  for(const table of tables){
    const count=Number(value[table]);
    if(!Number.isSafeInteger(count)||count<0)return null;
    normalized[table]=count;
  }
  return normalized;
}

function sameSet(left,right){
  if(left.length!==right.length)return false;
  const a=[...left].sort();
  const b=[...right].sort();
  return a.every((item,index)=>item===b[index]);
}

function validatePartition(canonical,present,deferred){
  if(!canonical||!present||!deferred)return false;
  if(!present.length)return false;
  const overlap=present.some((table)=>deferred.includes(table));
  if(overlap)return false;
  return sameSet([...present,...deferred],canonical);
}

export async function loadCanonicalTables(file=DEFAULT_INVENTORY){
  const text=await fs.readFile(path.resolve(file),'utf8');
  const tables=text.split(/\r?\n/)
    .map((line)=>line.trim())
    .filter((line)=>line&&!line.startsWith('#'));
  const normalized=normalizeTableList(tables);
  if(!normalized||normalized.length!==25){
    throw new Error(`HIPICO_BACKUP_INVENTORY_INVALID:${normalized?.length||0}`);
  }
  return normalized;
}

export function buildBackupEvidence({
  candidateSha,
  backupId,
  restoreTestId,
  targetDatabase,
  scope,
  migrationChain,
  tableManifestSha256,
  canonicalTables,
  mode,
  presentTables,
  deferredTables,
  sourceCounts,
  restoredCounts,
  orphanForeignKeys,
  restoreVerified,
  now=new Date()
}={}){
  const inferredCanonical=normalizeTableList(Object.keys(restoredCounts||{}));
  const canonical=normalizeTableList(canonicalTables)||inferredCanonical;
  const inferredPresent=normalizeTableList(Object.keys(sourceCounts||{}));
  const present=normalizeTableList(presentTables)||inferredPresent;
  const inferredDeferred=canonical&&present
    ? canonical.filter((table)=>!present.includes(table))
    : null;
  const deferred=Array.isArray(deferredTables)
    ? (deferredTables.length===0?[]:normalizeTableList(deferredTables))
    : inferredDeferred;
  const requestedMode=String(mode||'').trim().toUpperCase();
  const normalizedMode=requestedMode
    || (canonical&&present&&sameSet(canonical,present)?'STEADY_STATE':'');
  const source=canonical&&present?normalizeCountsForTables(sourceCounts,present):null;
  const restored=canonical?normalizeCountsForTables(restoredCounts,canonical):null;
  const reasons=[];
  const sha=String(candidateSha||'').trim().toLowerCase();
  const tableHash=String(tableManifestSha256||'').trim().toLowerCase();
  const sourceDb=String(targetDatabase||'').trim();
  const backup=String(backupId||'').trim();
  const restore=String(restoreTestId||'').trim();
  const scopeValue=String(scope||'').trim();
  const chainValue=String(migrationChain||'').trim();
  const orphans=Number(orphanForeignKeys);

  if(!SHA40.test(sha))reasons.push('CANDIDATE_SHA_INVALID');
  if(!backup)reasons.push('BACKUP_ID_REQUIRED');
  if(!restore)reasons.push('RESTORE_TEST_ID_REQUIRED');
  if(!sourceDb)reasons.push('TARGET_DATABASE_REQUIRED');
  if(scopeValue!==EXPECTED_SCOPE)reasons.push('BACKUP_SCOPE_MISMATCH');
  if(chainValue!==EXPECTED_CHAIN)reasons.push('MIGRATION_CHAIN_MISMATCH');
  if(!SHA64.test(tableHash))reasons.push('TABLE_MANIFEST_SHA_INVALID');
  if(!canonical||canonical.length!==25)reasons.push('CANONICAL_TABLES_INVALID');
  if(!MODES.has(normalizedMode))reasons.push('BACKUP_MODE_INVALID');
  if(!validatePartition(canonical,present,deferred))reasons.push('TABLE_PARTITION_INVALID');
  if(source===null)reasons.push('SOURCE_COUNTS_SCOPE_MISMATCH');
  if(restored===null)reasons.push('RESTORED_COUNTS_INVALID');
  if(normalizedMode==='STEADY_STATE'&&(
    !canonical||!present||!sameSet(present,canonical)||!deferred||deferred.length!==0
  ))reasons.push('STEADY_STATE_REQUIRES_FULL_SCOPE');
  if(!Number.isSafeInteger(orphans)||orphans<0)reasons.push('ORPHAN_FK_COUNT_INVALID');
  else if(orphans!==0)reasons.push('ORPHAN_FOREIGN_KEYS');
  if(restoreVerified!==true)reasons.push('RESTORE_NOT_VERIFIED');

  if(source&&restored&&present){
    for(const table of present){
      if(source[table]!==restored[table])reasons.push(`COUNT_MISMATCH:${table}`);
    }
  }

  const validTime=now instanceof Date&&!Number.isNaN(now.getTime());
  if(!validTime)reasons.push('CHECKED_AT_INVALID');

  return {
    schema:'hipico-schema-backup-evidence.v17',
    candidateSha:SHA40.test(sha)?sha:null,
    status:reasons.length?'FAIL':'PASS',
    restoreVerified:reasons.length?false:true,
    backupId:backup||null,
    restoreTestId:restore||null,
    targetDatabase:sourceDb||null,
    checkedAt:validTime?now.toISOString():null,
    scope:scopeValue||null,
    migrationChain:chainValue||null,
    tableManifestSha256:SHA64.test(tableHash)?tableHash:null,
    mode:MODES.has(normalizedMode)?normalizedMode:null,
    canonicalTableCount:canonical?.length||null,
    sourceTableCount:present?.length||null,
    tableCount:canonical?.length||null,
    presentTables:present||[],
    deferredTables:deferred||[],
    orphanForeignKeys:Number.isSafeInteger(orphans)&&orphans>=0?orphans:null,
    reasons
  };
}

async function readJson(file){
  return JSON.parse(await fs.readFile(path.resolve(file),'utf8'));
}

async function main(){
  const sourceCounts=await readJson(process.env.HIPICO_BACKUP_SOURCE_COUNTS_FILE||'');
  const restoredCounts=await readJson(process.env.HIPICO_BACKUP_RESTORED_COUNTS_FILE||'');
  const canonicalTables=await loadCanonicalTables(process.env.HIPICO_BACKUP_TABLE_FILE||DEFAULT_INVENTORY);
  const presentTables=JSON.parse(String(process.env.HIPICO_BACKUP_PRESENT_TABLES_JSON||'[]'));
  const deferredTables=JSON.parse(String(process.env.HIPICO_BACKUP_DEFERRED_TABLES_JSON||'[]'));
  const evidence=buildBackupEvidence({
    candidateSha:process.env.HIPICO_CANDIDATE_SHA,
    backupId:process.env.HIPICO_BACKUP_ID,
    restoreTestId:process.env.HIPICO_RESTORE_TEST_ID,
    targetDatabase:process.env.HIPICO_BACKUP_TARGET_DATABASE,
    scope:process.env.HIPICO_BACKUP_SCOPE,
    migrationChain:process.env.HIPICO_BACKUP_MIGRATION_CHAIN,
    tableManifestSha256:process.env.HIPICO_BACKUP_TABLE_MANIFEST_SHA256,
    canonicalTables,
    mode:process.env.HIPICO_BACKUP_MODE,
    presentTables,
    deferredTables,
    sourceCounts,
    restoredCounts,
    orphanForeignKeys:Number(process.env.HIPICO_RESTORE_ORPHAN_FOREIGN_KEYS),
    restoreVerified:String(process.env.HIPICO_RESTORE_VERIFIED||'').toLowerCase()==='true'
  });
  const output=path.resolve(process.env.HIPICO_BACKUP_EVIDENCE_OUTPUT||'backup-evidence.json');
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.writeFile(output,`${JSON.stringify(evidence,null,2)}\n`,'utf8');
  console.log(JSON.stringify(evidence));
  if(evidence.status!=='PASS')process.exitCode=2;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  await main();
}

export const __test__={
  EXPECTED_SCOPE,
  EXPECTED_CHAIN,
  MODES,
  normalizeTableList,
  normalizeCountsForTables,
  validatePartition
};
