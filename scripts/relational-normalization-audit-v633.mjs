#!/usr/bin/env node
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const FINDING = Object.freeze({
  MISSING_FK:'MISSING_FK', WEAK_UNIQUE:'WEAK_UNIQUE', MISSING_CHECK:'MISSING_CHECK', ORPHAN_RISK:'ORPHAN_RISK',
  DENORMALIZED_AUTHORITY:'DENORMALIZED_AUTHORITY', DERIVED_DATA_DRIFT:'DERIVED_DATA_DRIFT', JSON_OVERUSE:'JSON_OVERUSE',
  CASCADE_RISK:'CASCADE_RISK', INDEX_GAP:'INDEX_GAP', OWNERSHIP_AMBIGUOUS:'OWNERSHIP_AMBIGUOUS',
});

const TEMPORAL_KEYS=new Set(['generatedAt','finishedAt','manifestSha256','durationMs']);
const ID_LIKE=/(Id|_id)$/;

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!TEMPORAL_KEYS.has(k)).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
  return value;
}

export function deterministicManifestHash(value){return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}

export function assignOwner(tableName,policy){
  for(const rule of policy.ownershipRules||[]){
    if(new RegExp(rule.pattern).test(tableName))return {owner:rule.owner,confidence:rule.fallback?'fallback':'pattern',rule:rule.pattern};
  }
  return {owner:'UNASSIGNED',confidence:'fallback',rule:'(none)'};
}

function finding(policy,category,severity,table,detail,issueOverride){
  return {category,severity,table,detail,remediationIssue:issueOverride??policy.p1Remediation?.[category]??null};
}
function hasColumn(table,name){return (table.columns||[]).some((c)=>c.name===name);}
function hasFkColumn(table,name){return (table.foreignKeys||[]).some((fk)=>fk.columns?.includes(name));}
function indexSupports(columns,indexes){return (indexes||[]).some((idx)=>columns.every((column,i)=>idx.columns?.[i]===column));}
function uniqueCovers(column,table){
  if((table.primaryKey||[]).includes(column))return true;
  if((table.uniqueConstraints||[]).some((u)=>u.columns?.includes(column)))return true;
  return (table.indexes||[]).some((index)=>index.unique===true&&index.valid!==false&&index.columns?.includes(column));
}

export function analyzeTable(table,policy){
  const ownership=assignOwner(table.table,policy);
  const findings=[];
  if(ownership.confidence==='fallback')findings.push(finding(policy,FINDING.OWNERSHIP_AMBIGUOUS,'P2',table.table,`owner assigned by fallback rule ${ownership.rule}`));

  const tenantColumn=hasColumn(table,'tenantId')?'tenantId':hasColumn(table,'tenant_id')?'tenant_id':null;
  if(tenantColumn&&!hasFkColumn(table,tenantColumn))findings.push(finding(policy,FINDING.MISSING_FK,'P1',table.table,`${tenantColumn} has no physical foreign key`,634));

  const explicitLocal=new Set(policy.implicitLocalRelationColumns||[]);
  const external=new Set(policy.externalIdColumns||[]);
  for(const column of table.columns||[]){
    const key=`${table.table}.${column.name}`;
    if(column.name==='id'||!ID_LIKE.test(column.name)||hasFkColumn(table,column.name)||external.has(column.name)||external.has(key))continue;
    if(explicitLocal.has(key))findings.push(finding(policy,FINDING.MISSING_FK,'P1',table.table,`${column.name} is a declared local relation without FK`,683));
  }

  for(const fk of table.foreignKeys||[]){
    if(!indexSupports(fk.columns||[],table.indexes||[]))findings.push(finding(policy,FINDING.INDEX_GAP,'P1',table.table,`${fk.name}: (${(fk.columns||[]).join(',')}) -> ${fk.referencedTable} lacks a leading supporting index`,684));
  }

  const historical=(policy.cascadeRiskTablePatterns||[]).some((pattern)=>new RegExp(pattern,'i').test(table.table));
  if(historical){
    for(const fk of table.foreignKeys||[]){
      if(String(fk.onDelete).toUpperCase()==='CASCADE')findings.push(finding(policy,FINDING.CASCADE_RISK,'P1',table.table,`${fk.name} cascades delete into historical/regulated surface`,685));
    }
  }

  const jsonColumns=(table.columns||[]).filter((c)=>['json','jsonb'].includes(String(c.type).toLowerCase())).map((c)=>c.name);
  if(jsonColumns.length>(policy.jsonReviewThreshold??2))findings.push(finding(policy,FINDING.JSON_OVERUSE,'P2',table.table,`${jsonColumns.length} JSON/JSONB columns require bounded-context justification: ${jsonColumns.join(',')}`));

  for(const candidate of policy.naturalKeyColumns||[]){
    if(hasColumn(table,candidate)&&!uniqueCovers(candidate,table))findings.push(finding(policy,FINDING.WEAK_UNIQUE,'P2',table.table,`${candidate} exists without a UNIQUE/PK constraint; review whether uniqueness is intentional`));
  }

  const softDeleteColumns=(table.columns||[]).filter((c)=>/^(deletedAt|deleted_at|archivedAt|archived_at|active|status)$/.test(c.name)).map((c)=>c.name);
  return {
    schema:table.schema,table:table.table,owner:ownership.owner,ownershipConfidence:ownership.confidence,ownershipRule:ownership.rule,
    primaryKey:table.primaryKey||[],foreignKeys:table.foreignKeys||[],uniqueConstraints:table.uniqueConstraints||[],checks:table.checks||[],indexes:table.indexes||[],
    columns:table.columns||[],jsonColumns,tenant:{column:tenantColumn,hasPhysicalFk:tenantColumn?hasFkColumn(table,tenantColumn):false},
    lifecycle:{createdAt:hasColumn(table,'createdAt')||hasColumn(table,'created_at'),updatedAt:hasColumn(table,'updatedAt')||hasColumn(table,'updated_at'),softDeleteColumns},
    findings:findings.sort((a,b)=>`${a.severity}:${a.category}:${a.detail}`.localeCompare(`${b.severity}:${b.category}:${b.detail}`)),
  };
}

export function assertCoverage(tables,policy){
  const expected=Number(policy.expectedPublicTableCount);
  if(!Number.isInteger(expected)||expected<=0)throw new Error('TABLE_COVERAGE_POLICY_INVALID');
  if(tables.length!==expected)throw new Error(`TABLE_COVERAGE_MISMATCH:expected=${expected}:actual=${tables.length}`);
  const names=tables.map((t)=>t.table);
  if(new Set(names).size!==names.length)throw new Error('TABLE_COVERAGE_DUPLICATE_TABLE');
}

export function buildManifest({candidateSha,tables,policy,generatedAt=new Date().toISOString()}){
  assertCoverage(tables,policy);
  const inventory=[...tables].sort((a,b)=>a.table.localeCompare(b.table)).map((table)=>analyzeTable(table,policy));
  const findings=inventory.flatMap((table)=>table.findings);
  const byCategory=Object.fromEntries(Object.values(FINDING).map((category)=>[category,findings.filter((f)=>f.category===category).length]));
  const bySeverity={P0:findings.filter((f)=>f.severity==='P0').length,P1:findings.filter((f)=>f.severity==='P1').length,P2:findings.filter((f)=>f.severity==='P2').length};
  const unassignedP0P1=findings.filter((f)=>['P0','P1'].includes(f.severity)&&!f.remediationIssue).length;
  const owners={};for(const table of inventory)owners[table.owner]=(owners[table.owner]||0)+1;
  const manifest={schemaVersion:633,candidateSha,generatedAt,summary:{tableCount:inventory.length,findingCount:findings.length,bySeverity,byCategory,unassignedP0P1,owners},tables:inventory};
  manifest.manifestSha256=deterministicManifestHash(manifest);
  return manifest;
}

export const INTROSPECTION_SQL=String.raw`
WITH app_tables AS (
  SELECT c.oid,n.nspname AS schema_name,c.relname AS table_name
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND n.nspname='public'
)
SELECT COALESCE(json_agg(json_build_object(
  'schema',t.schema_name,'table',t.table_name,
  'columns',(SELECT COALESCE(json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,'default',pg_get_expr(ad.adbin,ad.adrelid)) ORDER BY a.attnum),'[]'::json) FROM pg_attribute a LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),
  'primaryKey',(SELECT COALESCE(json_agg(x.attname ORDER BY x.ord),'[]'::json) FROM (SELECT a.attname,u.ord FROM pg_constraint con CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY u(attnum,ord) JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=u.attnum WHERE con.conrelid=t.oid AND con.contype='p') x),
  'foreignKeys',(SELECT COALESCE(json_agg(json_build_object('name',con.conname,'columns',(SELECT array_agg(a.attname ORDER BY u.ord) FROM unnest(con.conkey) WITH ORDINALITY u(attnum,ord) JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=u.attnum),'referencedTable',rc.relname,'referencedColumns',(SELECT array_agg(a.attname ORDER BY u.ord) FROM unnest(con.confkey) WITH ORDINALITY u(attnum,ord) JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=u.attnum),'onDelete',CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE con.confdeltype::text END,'onUpdate',CASE con.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE con.confupdtype::text END) ORDER BY con.conname),'[]'::json) FROM pg_constraint con JOIN pg_class rc ON rc.oid=con.confrelid WHERE con.conrelid=t.oid AND con.contype='f'),
  'uniqueConstraints',(SELECT COALESCE(json_agg(json_build_object('name',con.conname,'columns',(SELECT array_agg(a.attname ORDER BY u.ord) FROM unnest(con.conkey) WITH ORDINALITY u(attnum,ord) JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=u.attnum)) ORDER BY con.conname),'[]'::json) FROM pg_constraint con WHERE con.conrelid=t.oid AND con.contype='u'),
  'checks',(SELECT COALESCE(json_agg(json_build_object('name',con.conname,'definition',pg_get_constraintdef(con.oid,true)) ORDER BY con.conname),'[]'::json) FROM pg_constraint con WHERE con.conrelid=t.oid AND con.contype='c'),
  'indexes',(SELECT COALESCE(json_agg(json_build_object('name',ic.relname,'unique',i.indisunique,'valid',i.indisvalid,'columns',(SELECT array_agg(a.attname ORDER BY u.ord) FROM unnest(i.indkey::smallint[]) WITH ORDINALITY u(attnum,ord) LEFT JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=u.attnum)) ORDER BY ic.relname),'[]'::json) FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=t.oid)
) ORDER BY t.table_name),'[]'::json)::text
FROM app_tables t;`;

function pgEnv(rawUrl,env){const url=new URL(rawUrl);return {...env,PGHOST:url.hostname.replace(/^\[|\]$/g,''),PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.replace(/^\//,'')),PGUSER:decodeURIComponent(url.username||''),PGPASSWORD:decodeURIComponent(url.password||'')};}
function git(cwd,args){return execFileSync('git',args,{cwd,encoding:'utf8'}).trim();}
function psqlSnapshot(cwd,rawUrl,env){
  const executable=process.platform==='win32'?'psql.exe':'psql';
  const result=spawnSync(executable,['-X','-A','-t','-v','ON_ERROR_STOP=1','-c',INTROSPECTION_SQL],{cwd,env:pgEnv(rawUrl,env),encoding:'utf8',shell:false});
  if(result.error)throw new Error(`RELATIONAL_AUDIT_BLOCKED:${result.error.message}`);
  if(result.status!==0)throw new Error(`RELATIONAL_AUDIT_INTROSPECTION_FAILED:${result.stderr||result.stdout}`);
  return JSON.parse(String(result.stdout).trim()||'[]');
}

function humanReport(manifest){
  const lines=['# Relational Normalization & Constraints Audit — #633','',`- candidate: \`${manifest.candidateSha}\``,`- tables: **${manifest.summary.tableCount}**`,`- findings: **${manifest.summary.findingCount}** (P0 ${manifest.summary.bySeverity.P0} / P1 ${manifest.summary.bySeverity.P1} / P2 ${manifest.summary.bySeverity.P2})`,`- unassigned P0/P1: **${manifest.summary.unassignedP0P1}**`,`- manifest: \`${manifest.manifestSha256}\``,'','## Owners',''];
  for(const [owner,count] of Object.entries(manifest.summary.owners).sort())lines.push(`- ${owner}: ${count}`);
  lines.push('','## P0/P1 findings','');
  const material=manifest.tables.flatMap((t)=>t.findings).filter((f)=>['P0','P1'].includes(f.severity));
  if(!material.length)lines.push('- none');
  else for(const f of material)lines.push(`- ${f.severity} ${f.category} — ${f.table}: ${f.detail}${f.remediationIssue?` → #${f.remediationIssue}`:''}`);
  return `${lines.join('\n')}\n`;
}

async function auditDatabase({repoRoot,env,candidateSha,policy}){
  const rawUrl=String(env.DATABASE_URL||'').trim();if(!rawUrl)throw new Error('RELATIONAL_AUDIT_DATABASE_URL_REQUIRED');
  const { assertDestructiveDatabaseSafe }=await import('./canonical-database-gate-v632.mjs');
  assertDestructiveDatabaseSafe(rawUrl);
  return buildManifest({candidateSha,tables:psqlSnapshot(repoRoot,rawUrl,env),policy});
}

async function cli(){
  const repoRoot=process.cwd();
  const candidateSha=git(repoRoot,['rev-parse','HEAD']);
  if(git(repoRoot,['status','--porcelain']))throw new Error('RELATIONAL_AUDIT_WORKTREE_DIRTY');
  const policy=JSON.parse(await readFile(path.join(repoRoot,'config/relational-normalization-v633.json'),'utf8'));
  let manifest;
  if(String(process.env.DATABASE_URL||'').trim())manifest=await auditDatabase({repoRoot,env:process.env,candidateSha,policy});
  else{
    const { withEphemeralDatabase }=await import('./local-verification-runner-v630.mjs');
    manifest=await withEphemeralDatabase({candidateSha,cwd:repoRoot,env:process.env},async(env)=>{
      const gate=spawnSync(process.platform==='win32'?'node.exe':'node',['scripts/canonical-database-gate-v632.mjs','--expected-sha',candidateSha],{cwd:repoRoot,env,encoding:'utf8',shell:false});
      if(gate.error||gate.status!==0)throw new Error(`RELATIONAL_AUDIT_PREPARE_FAILED:${gate.error?.message||gate.stderr||gate.stdout}`);
      return auditDatabase({repoRoot,env,candidateSha,policy});
    });
  }
  if(manifest.summary.unassignedP0P1>0)throw new Error(`RELATIONAL_AUDIT_UNASSIGNED_P0_P1:${manifest.summary.unassignedP0P1}`);
  const out=path.join(repoRoot,'artifacts','relational-normalization-v633',candidateSha);await mkdir(out,{recursive:true});
  await writeFile(path.join(out,'manifest.json'),`${JSON.stringify(manifest,null,2)}\n`,{mode:0o600});
  await writeFile(path.join(out,'report.md'),humanReport(manifest),{mode:0o600});
  console.log(`[relational-audit-v633][PASS] sha=${candidateSha} tables=${manifest.summary.tableCount} findings=${manifest.summary.findingCount} p1=${manifest.summary.bySeverity.P1} manifest=${manifest.manifestSha256}`);
}

const invokedAsScript=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(invokedAsScript)cli().catch((error)=>{console.error(`[relational-audit-v633][FAIL] ${error instanceof Error?error.message:String(error)}`);process.exitCode=1;});
