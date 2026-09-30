#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const CLASSIFICATION=Object.freeze({
  LOCAL_RELATION:'LOCAL_RELATION',
  EXTERNAL_ID:'EXTERNAL_ID',
  POLYMORPHIC_REFERENCE:'POLYMORPHIC_REFERENCE',
  DERIVED_REFERENCE:'DERIVED_REFERENCE',
});
const VALID_CLASSIFICATIONS=new Set(Object.values(CLASSIFICATION));
const ID_LIKE=/(Id|_id)$/;

function hasPhysicalFk(table,column){
  return (table.foreignKeys||[]).some((fk)=>(fk.columns||[]).includes(column));
}

export function deriveImplicitIdCandidates(manifest){
  if(Number(manifest?.schemaVersion)!==633)throw new Error(`SOURCE_MANIFEST_SCHEMA_REQUIRED:633:actual=${manifest?.schemaVersion??'missing'}`);
  if(!Array.isArray(manifest?.tables))throw new Error('SOURCE_MANIFEST_TABLES_REQUIRED');
  const candidates=[];
  for(const table of manifest.tables){
    for(const column of table.columns||[]){
      if(column.name==='id'||!ID_LIKE.test(String(column.name))||hasPhysicalFk(table,column.name))continue;
      candidates.push({key:`${table.table}.${column.name}`,table:table.table,column:column.name});
    }
  }
  return candidates.sort((a,b)=>a.key.localeCompare(b.key));
}

export function validateClassificationPolicy(policy){
  if(Number(policy?.schemaVersion)!==683)throw new Error('ISSUE_683_POLICY_SCHEMA_INVALID');
  if(Number(policy?.sourceManifestIssue)!==633)throw new Error('ISSUE_683_SOURCE_MANIFEST_MUST_BE_633');
  if(!Array.isArray(policy?.classifications)||policy.classifications.length===0)throw new Error('ISSUE_683_CLASSIFICATIONS_REQUIRED');
  const seen=new Set();
  for(const row of policy.classifications){
    if(typeof row.key!=='string'||!row.key.includes('.'))throw new Error('ISSUE_683_CLASSIFICATION_KEY_INVALID');
    if(seen.has(row.key))throw new Error(`ISSUE_683_CLASSIFICATION_DUPLICATE:${row.key}`);
    seen.add(row.key);
    if(!VALID_CLASSIFICATIONS.has(row.classification))throw new Error(`ISSUE_683_CLASSIFICATION_INVALID:${row.key}:${row.classification}`);
    if(typeof row.reason!=='string'||row.reason.trim().length<12)throw new Error(`ISSUE_683_REASON_REQUIRED:${row.key}`);
    if(row.classification===CLASSIFICATION.LOCAL_RELATION){
      if(typeof row.target!=='string'||!row.target.includes('.'))throw new Error(`ISSUE_683_LOCAL_TARGET_REQUIRED:${row.key}`);
      if(row.tenantScoped!==true)throw new Error(`ISSUE_683_LOCAL_TENANT_SCOPE_REQUIRED:${row.key}`);
      if(row.ddlOwnedByIssue683!==true)throw new Error(`ISSUE_683_LOCAL_DDL_OWNER_REQUIRED:${row.key}`);
    }else if(row.ddlOwnedByIssue683===true){
      throw new Error(`ISSUE_683_NON_LOCAL_DDL_FORBIDDEN:${row.key}`);
    }
  }
  return true;
}

export function classifyManifest(manifest,policy){
  validateClassificationPolicy(policy);
  const candidates=deriveImplicitIdCandidates(manifest);
  const byKey=new Map(policy.classifications.map((row)=>[row.key,row]));
  for(const candidate of candidates){
    if(!byKey.has(candidate.key))throw new Error(`UNCLASSIFIED_IMPLICIT_ID:${candidate.key}`);
  }
  const classifications=candidates.map((candidate)=>({...candidate,...byKey.get(candidate.key)}));
  const counts=Object.fromEntries(Object.values(CLASSIFICATION).map((value)=>[value,classifications.filter((row)=>row.classification===value).length]));
  const ddlRelations=classifications.filter((row)=>row.classification===CLASSIFICATION.LOCAL_RELATION&&row.ddlOwnedByIssue683===true);
  return {
    schemaVersion:683,
    sourceManifest:{issue:633,candidateSha:manifest.candidateSha??null,manifestSha256:manifest.manifestSha256??null},
    productionConvergenceIssue:policy.productionConvergenceIssue??627,
    summary:{candidateCount:classifications.length,counts,ddlRelationCount:ddlRelations.length},
    classifications,
    ddlRelations,
  };
}

function argValue(name){
  const index=process.argv.indexOf(name);
  return index>=0?process.argv[index+1]:null;
}

async function cli(){
  const manifestPath=argValue('--manifest');
  if(!manifestPath)throw new Error('USAGE: node scripts/implicit-relation-fk-hardening-v683.mjs --manifest <#633-manifest.json> [--policy <policy.json>] [--out <report.json>]');
  const policyPath=argValue('--policy')||'config/implicit-relation-fk-hardening-v683.json';
  const outPath=argValue('--out');
  const manifest=JSON.parse(await readFile(path.resolve(manifestPath),'utf8'));
  const policy=JSON.parse(await readFile(path.resolve(policyPath),'utf8'));
  const report=classifyManifest(manifest,policy);
  const payload=`${JSON.stringify(report,null,2)}\n`;
  if(outPath){
    const resolved=path.resolve(outPath);await mkdir(path.dirname(resolved),{recursive:true});await writeFile(resolved,payload,'utf8');
  }else process.stdout.write(payload);
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  cli().catch((error)=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
}
