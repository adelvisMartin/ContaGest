#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const CLASSIFICATION=Object.freeze({
  INTENTIONAL_CHILD_CASCADE:'INTENTIONAL_CHILD_CASCADE',
  RETENTION_RISK:'RETENTION_RISK',
  PLATFORM_CLEANUP:'PLATFORM_CLEANUP',
  TENANT_DELETION_POLICY:'TENANT_DELETION_POLICY',
});
const VALUES=new Set(Object.values(CLASSIFICATION));

export function validatePolicy(policy){
  if(policy?.sourceManifestIssue!==633)throw new Error('SOURCE_MANIFEST_ISSUE_MUST_BE_633');
  if(!Array.isArray(policy.sourceTablePatterns)||!policy.sourceTablePatterns.length)throw new Error('SOURCE_TABLE_PATTERNS_REQUIRED');
  if(!Array.isArray(policy.classifications)||!policy.classifications.length)throw new Error('CASCADE_CLASSIFICATIONS_REQUIRED');
  const seen=new Set();
  for(const row of policy.classifications){
    if(!row?.key||seen.has(row.key))throw new Error(`INVALID_OR_DUPLICATE_CASCADE_KEY:${row?.key||''}`); seen.add(row.key);
    if(!VALUES.has(row.classification))throw new Error(`INVALID_CASCADE_CLASSIFICATION:${row.key}`);
    if(String(row.reason||'').trim().length<12||String(row.recovery||'').trim().length<12)throw new Error(`CASCADE_RATIONALE_REQUIRED:${row.key}`);
  }
  return true;
}

export function deriveHistoricalCascades(manifest,patterns){
  if(manifest?.schemaVersion!==633)throw new Error(`UNSUPPORTED_MANIFEST_VERSION:${manifest?.schemaVersion}`);
  const regexes=(patterns||[]).map(x=>new RegExp(x,'i'));
  return (manifest.tables||[]).filter(t=>regexes.some(r=>r.test(t.table))).flatMap(t=>(t.foreignKeys||[])
    .filter(fk=>String(fk.onDelete).toUpperCase()==='CASCADE')
    .map(fk=>({key:`${t.table}.${fk.name}`,table:t.table,constraint:fk.name,fk}))).sort((a,b)=>a.key.localeCompare(b.key));
}

export function classifyHistoricalCascades(manifest,policy){
  validatePolicy(policy);
  const candidates=deriveHistoricalCascades(manifest,policy.sourceTablePatterns);
  const byKey=new Map(policy.classifications.map(row=>[row.key,row]));
  const classifications=candidates.map(candidate=>{
    const decision=byKey.get(candidate.key); if(!decision)throw new Error(`UNCLASSIFIED_HISTORICAL_CASCADE:${candidate.key}`);
    return {...candidate,...decision};
  });
  const present=new Set(candidates.map(x=>x.key));
  for(const row of policy.classifications)if(!present.has(row.key))throw new Error(`STALE_HISTORICAL_CASCADE_POLICY:${row.key}`);
  const ddlRelations=classifications.filter(x=>x.classification===CLASSIFICATION.RETENTION_RISK);
  return {sourceManifestIssue:633,summary:{candidateCount:classifications.length,retentionRiskCount:ddlRelations.length},classifications,ddlRelations};
}

async function cli(){
  const manifestPath=process.argv[2];
  if(!manifestPath)throw new Error('USAGE: node scripts/historical-cascade-policy-v685.mjs <manifest.json>');
  const [manifest,policy]=await Promise.all([
    readFile(manifestPath,'utf8').then(JSON.parse),
    readFile(new URL('../config/historical-cascade-policy-v685.json',import.meta.url),'utf8').then(JSON.parse),
  ]);
  process.stdout.write(`${JSON.stringify(classifyHistoricalCascades(manifest,policy),null,2)}\n`);
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)cli().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
