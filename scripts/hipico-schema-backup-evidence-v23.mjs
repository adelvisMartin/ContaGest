import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA40=/^[a-f0-9]{40}$/i;
const SHA64=/^[a-f0-9]{64}$/i;
const EXPECTED_SCOPE='hipico-canonical-v12-v27';
const EXPECTED_CHAIN='v12-v27';
const EXPECTED_TABLES=Object.freeze([
  'hipico_agent_evaluations','hipico_audit_events','hipico_automation_transition_events',
  'hipico_bot_channels','hipico_document_events','hipico_document_sources','hipico_documents',
  'hipico_domain_aggregates','hipico_domain_events','hipico_group_automation','hipico_ledger_entries',
  'hipico_meetings','hipico_messages','hipico_observability_events','hipico_operation_events',
  'hipico_outbox','hipico_outbox_receipts','hipico_profiles','hipico_provider_evidence',
  'hipico_race_events','hipico_races','hipico_reconciliations','hipico_shadow_evaluations',
  'hipico_users','hipico_workspaces'
]);

function normalizeCounts(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const keys=Object.keys(value).sort();
  const expected=[...EXPECTED_TABLES].sort();
  if(JSON.stringify(keys)!==JSON.stringify(expected))return null;
  const normalized={};
  for(const table of EXPECTED_TABLES){
    const count=Number(value[table]);
    if(!Number.isSafeInteger(count)||count<0)return null;
    normalized[table]=count;
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
  sourceCounts,
  restoredCounts,
  orphanForeignKeys,
  restoreVerified,
  now=new Date()
}={}){
  const source=normalizeCounts(sourceCounts);
  const restored=normalizeCounts(restoredCounts);
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
  if(!source)reasons.push('SOURCE_COUNTS_INVALID');
  if(!restored)reasons.push('RESTORED_COUNTS_INVALID');
  if(!Number.isSafeInteger(orphans)||orphans<0)reasons.push('ORPHAN_FK_COUNT_INVALID');
  else if(orphans!==0)reasons.push('ORPHAN_FOREIGN_KEYS');
  if(restoreVerified!==true)reasons.push('RESTORE_NOT_VERIFIED');

  if(source&&restored){
    for(const table of EXPECTED_TABLES){
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
    tableCount:EXPECTED_TABLES.length,
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
  const evidence=buildBackupEvidence({
    candidateSha:process.env.HIPICO_CANDIDATE_SHA,
    backupId:process.env.HIPICO_BACKUP_ID,
    restoreTestId:process.env.HIPICO_RESTORE_TEST_ID,
    targetDatabase:process.env.HIPICO_BACKUP_TARGET_DATABASE,
    scope:process.env.HIPICO_BACKUP_SCOPE,
    migrationChain:process.env.HIPICO_BACKUP_MIGRATION_CHAIN,
    tableManifestSha256:process.env.HIPICO_BACKUP_TABLE_MANIFEST_SHA256,
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

export const __test__={EXPECTED_SCOPE,EXPECTED_CHAIN,EXPECTED_TABLES,normalizeCounts};
