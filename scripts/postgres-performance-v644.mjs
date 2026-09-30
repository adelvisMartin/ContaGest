#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PERF_CONTRACT_VERSION = 644;
const LOOPBACK = new Set(['localhost','127.0.0.1','::1','[::1]']);

export function isLoopbackDatabaseUrl(raw){
  try {
    const url = new URL(String(raw||''));
    return ['postgres:','postgresql:'].includes(url.protocol) && LOOPBACK.has(url.hostname);
  } catch { return false; }
}

export function validateBenchmarkConfig(config){
  if (!config || config.schemaVersion !== PERF_CONTRACT_VERSION) throw new Error('PERF_CONFIG_VERSION_INVALID');
  if (!Array.isArray(config.journeys) || config.journeys.length < 3) throw new Error('PERF_CONFIG_JOURNEYS_REQUIRED');
  const ids = new Set();
  for (const journey of config.journeys){
    if (!journey?.id || ids.has(journey.id)) throw new Error('PERF_CONFIG_JOURNEY_ID_INVALID');
    ids.add(journey.id);
    if (!['Client','LedgerEntry','AnalyticsEvent'].includes(journey.table)) throw new Error(`PERF_CONFIG_TABLE_NOT_ALLOWED:${journey.table}`);
    const sql = String(journey.sql||'').trim();
    if (!/^select\b/i.test(sql)) throw new Error(`PERF_CONFIG_SELECT_ONLY:${journey.id}`);
    if (/;\s*\S/.test(sql) || /\b(insert|update|delete|alter|drop|truncate|create|grant|revoke)\b/i.test(sql)) throw new Error(`PERF_CONFIG_MUTATION_FORBIDDEN:${journey.id}`);
  }
  return true;
}

export function parseExplainJson(text){
  const trimmed = String(text||'').trim();
  if (!trimmed) throw new Error('PERF_EXPLAIN_EMPTY');
  const parsed = JSON.parse(trimmed);
  const root = Array.isArray(parsed) ? parsed[0] : parsed;
  const plan = root?.Plan;
  if (!plan) throw new Error('PERF_EXPLAIN_PLAN_MISSING');
  const indexes = new Set();
  const nodes = [];
  const visit = (node)=>{
    nodes.push(node['Node Type']);
    if (node['Index Name']) indexes.add(node['Index Name']);
    for (const child of node.Plans||[]) visit(child);
  };
  visit(plan);
  return {
    planningTimeMs: Number(root['Planning Time']||0),
    executionTimeMs: Number(root['Execution Time']||0),
    sharedHitBlocks: Number(plan['Shared Hit Blocks']||0),
    sharedReadBlocks: Number(plan['Shared Read Blocks']||0),
    actualRows: Number(plan['Actual Rows']||0),
    planRows: Number(plan['Plan Rows']||0),
    indexes:[...indexes].sort(),
    nodes,
  };
}

export function comparePlans(before, after){
  const executionDeltaMs = Number(after.executionTimeMs) - Number(before.executionTimeMs);
  const readDelta = Number(after.sharedReadBlocks) - Number(before.sharedReadBlocks);
  return {
    executionDeltaMs,
    executionRatio: before.executionTimeMs > 0 ? after.executionTimeMs / before.executionTimeMs : null,
    sharedReadBlockDelta: readDelta,
    evidence: executionDeltaMs < 0 || readDelta < 0 ? 'IMPROVED' : executionDeltaMs === 0 && readDelta === 0 ? 'UNCHANGED' : 'REGRESSED',
  };
}

function runPsql(databaseUrl, sql){
  const result = spawnSync(process.platform==='win32'?'psql.exe':'psql', ['-X','-qAt','--dbname',databaseUrl,'-v','ON_ERROR_STOP=1','-c',sql], {encoding:'utf8',shell:false});
  if (result.error) throw new Error(`PERF_POSTGRES_BLOCKED:${result.error.message}`);
  if (result.status !== 0) throw new Error(`PERF_POSTGRES_FAILED:${result.stderr||result.stdout}`);
  return String(result.stdout||'').trim();
}

function fixtureSql(scale, tenantId){
  const safeScale = Math.max(100, Math.min(Number(scale)||5000, 50000));
  return `
INSERT INTO "Tenant" (id, rif, name, plan, status, settings, "createdAt", "updatedAt") VALUES ('${tenantId}','J-V644-${safeScale}','Perf V644','enterprise','active','{}',now(),now());
INSERT INTO "Client" (id,"tenantId",rif,name,active,"createdAt","updatedAt")
SELECT 'v644-client-'||g, '${tenantId}', 'J-'||g, 'Cliente '||lpad(g::text,8,'0'), true, now(), now() FROM generate_series(1,${safeScale}) g;
INSERT INTO "LedgerEntry" (id,"tenantId",date,"fiscalPeriod",description,source,posted,"createdAt","updatedAt")
SELECT 'v644-ledger-'||g, '${tenantId}', now()-(g||' minutes')::interval, '2026-09','Perf '||g,'manual',true,now(),now() FROM generate_series(1,${safeScale}) g;
INSERT INTO "AnalyticsEvent" (id,"tenantId","sessionId",type,route,payload,"createdAt")
SELECT 'v644-event-'||g, '${tenantId}', 's-'||g, 'page_view', CASE WHEN g%2=0 THEN 'dashboard' ELSE 'ventas' END, '{}', now()-(g||' seconds')::interval FROM generate_series(1,${safeScale}) g;
ANALYZE "Client"; ANALYZE "LedgerEntry"; ANALYZE "AnalyticsEvent";`;
}

function substitute(sql, tenantId){ return String(sql).replaceAll(':tenantId', `'${tenantId}'`); }

export async function runBenchmark({config,databaseUrl,scale=5000,cwd=process.cwd()}){
  validateBenchmarkConfig(config);
  if (!isLoopbackDatabaseUrl(databaseUrl)) throw new Error('PERF_POSTGRES_BLOCKED:NON_LOCAL_DATABASE');
  const tenantId = `v644-${process.pid}-${Date.now()}`.replace(/[^a-zA-Z0-9-]/g,'');
  const results=[];
  for (const journey of config.journeys){
    const sql = `BEGIN; ${fixtureSql(scale,tenantId)} EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${substitute(journey.sql,tenantId)}; ROLLBACK;`;
    const output = runPsql(databaseUrl, sql);
    const jsonStart = output.indexOf('[');
    if (jsonStart < 0) throw new Error(`PERF_EXPLAIN_JSON_MISSING:${journey.id}`);
    results.push({id:journey.id,table:journey.table,scale,...parseExplainJson(output.slice(jsonStart))});
  }
  return {schemaVersion:PERF_CONTRACT_VERSION,generatedAt:new Date().toISOString(),databaseHost:new URL(databaseUrl).hostname,scale,journeys:results};
}

async function cli(){
  const mode = process.argv[2] || 'contract';
  const configPath = process.argv[3] || 'config/postgres-performance-v644.json';
  const config = JSON.parse(await readFile(configPath,'utf8'));
  validateBenchmarkConfig(config);
  if (mode === 'contract') { console.log(JSON.stringify({status:'PASS',schemaVersion:PERF_CONTRACT_VERSION,journeys:config.journeys.map(j=>j.id)},null,2)); return; }
  if (mode !== 'run') throw new Error(`PERF_MODE_UNKNOWN:${mode}`);
  const databaseUrl = String(process.env.DATABASE_URL||'').trim();
  const scale = Number(process.env.PERF_SCALE||5000);
  const result = await runBenchmark({config,databaseUrl,scale});
  const outDir = path.join(process.cwd(),'artifacts','postgres-performance-v644');
  await mkdir(outDir,{recursive:true});
  const outPath = path.join(outDir,`baseline-${Date.now()}.json`);
  await writeFile(outPath,`${JSON.stringify(result,null,2)}\n`,'utf8');
  console.log(JSON.stringify({status:'PASS',artifact:outPath,journeys:result.journeys.length},null,2));
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) cli().catch((error)=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});