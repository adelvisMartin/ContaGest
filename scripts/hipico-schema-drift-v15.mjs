import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const { Client }=pg;
const SHA40=/^[a-f0-9]{40}$/i;
const STATUS=new Set(['MATCH','DRIFT','NOT_EXECUTED']);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifestPath=path.join(root,'ops/roadmap/hipico-schema-capabilities-v15.json');

function candidateSha(env=process.env){
  const value=String(env.HIPICO_CANDIDATE_SHA||env.GITHUB_SHA||'').trim().toLowerCase();
  return SHA40.test(value)?value:null;
}

function databaseUrl(env=process.env){
  return String(env.HIPICO_SCHEMA_DRIFT_DATABASE_URL||'').trim();
}

function safeTarget(urlText){
  if(!urlText)return {configured:false,host:null,database:null,remote:false};
  const url=new URL(urlText);
  const host=url.hostname.toLowerCase();
  const database=url.pathname.replace(/^\//,'');
  return {configured:true,host,database,remote:!['127.0.0.1','localhost','::1'].includes(host)};
}

async function capabilityPresent(client,capability){
  switch(capability.kind){
    case 'table':{
      const qualified=`${capability.schema}.${capability.table}`;
      const result=await client.query('select to_regclass($1)::text as relation',[qualified]);
      return Boolean(result.rows[0]?.relation);
    }
    case 'column':{
      const result=await client.query(
        `select exists(
           select 1 from information_schema.columns
           where table_schema=$1 and table_name=$2 and column_name=$3
         ) as present`,
        [capability.schema,capability.table,capability.column]
      );
      return result.rows[0]?.present===true;
    }
    case 'constraint_contains':{
      const result=await client.query(
        `select exists(
           select 1
           from pg_constraint c
           join pg_class r on r.oid=c.conrelid
           join pg_namespace n on n.oid=r.relnamespace
           where n.nspname=$1 and r.relname=$2 and c.conname=$3
             and pg_get_constraintdef(c.oid) like ('%' || $4 || '%')
         ) as present`,
        [capability.schema,capability.table,capability.constraint,capability.contains]
      );
      return result.rows[0]?.present===true;
    }
    default:
      throw new Error(`HIPICO_SCHEMA_DRIFT_MARKER_UNSUPPORTED:${String(capability.kind)}`);
  }
}

export async function inspectSchema(client,manifest){
  const observed=[];
  for(const capability of manifest.capabilities){
    observed.push({
      id:capability.id,
      present:await capabilityPresent(client,capability),
      sourceFile:capability.sourceFile
    });
  }
  const missing=observed.filter((item)=>!item.present).map((item)=>item.id);
  return {observed,missing,status:missing.length?'DRIFT':'MATCH'};
}

export function buildNotExecutedReport({sha,manifest,target,reason}){
  return {
    schema:'hipico-schema-drift-report.v15',
    candidateSha:sha,
    manifestBaseline:manifest.baseline,
    status:'NOT_EXECUTED',
    reason,
    target:{database:target.database||null,remote:target.remote===true},
    checkedAt:new Date().toISOString(),
    observed:[],
    missing:[]
  };
}

export async function runDriftCheck({env=process.env,connect=(config)=>new Client(config)}={}){
  const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  const sha=candidateSha(env);
  const urlText=databaseUrl(env);
  const target=safeTarget(urlText);

  if(!sha)return buildNotExecutedReport({sha:null,manifest,target,reason:'CANDIDATE_SHA_REQUIRED'});
  if(!target.configured)return buildNotExecutedReport({sha,manifest,target,reason:'DATABASE_URL_REQUIRED'});

  const client=connect({connectionString:urlText,application_name:'hipico-schema-drift-v15'});
  await client.connect();
  try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result=await inspectSchema(client,manifest);
    return {
      schema:'hipico-schema-drift-report.v15',
      candidateSha:sha,
      manifestBaseline:manifest.baseline,
      status:result.status,
      reason:result.status==='DRIFT'?'REPOSITORY_DATABASE_SCHEMA_DRIFT':null,
      target:{database:target.database||null,remote:target.remote===true},
      checkedAt:new Date().toISOString(),
      observed:result.observed,
      missing:result.missing
    };
  }finally{
    try{await client.query('ROLLBACK');}catch{}
    await client.end();
  }
}

async function main(){
  let report;
  try{
    report=await runDriftCheck();
  }catch(error){
    const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
    report=buildNotExecutedReport({
      sha:candidateSha(),
      manifest,
      target:safeTarget(databaseUrl()),
      reason:String(error?.code||'SCHEMA_DRIFT_CHECK_FAILED').slice(0,120)
    });
  }

  if(!STATUS.has(report.status))throw new Error('HIPICO_SCHEMA_DRIFT_STATUS_INVALID');
  const output=String(process.env.HIPICO_SCHEMA_DRIFT_REPORT||'').trim();
  if(output){
    await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});
    await fs.writeFile(path.resolve(output),`${JSON.stringify(report,null,2)}\n`,'utf8');
  }
  console.log(JSON.stringify(report));
  if(report.status==='DRIFT')process.exitCode=2;
  if(report.status==='NOT_EXECUTED')process.exitCode=3;
}

const isMain=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(isMain)await main();

export const __test__={candidateSha,databaseUrl,safeTarget,capabilityPresent};
