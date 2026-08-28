import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const SPOOL_SCHEMA_VERSION=2;
export const SPOOL_STATES=Object.freeze(['queued','sent','failed','quarantined','replayed','expired']);

export function createSpoolRecord({kind,key,payload,parserVersion='unknown',createdAt=new Date().toISOString(),maxAttempts=8}){
  if(!kind||!key)throw new Error('SPOOL_KIND_KEY_REQUIRED');
  return{
    schemaVersion:SPOOL_SCHEMA_VERSION,
    recordId:crypto.createHash('sha256').update(`${kind}|${key}`).digest('hex'),
    kind,key,state:'queued',payload,parserVersion,createdAt,updatedAt:createdAt,
    attempts:0,maxAttempts,nextAttemptAt:0,lastError:null
  };
}

export async function atomicWriteJson(file,value){
  await fs.mkdir(path.dirname(file),{recursive:true});
  const tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let handle;
  try{
    handle=await fs.open(tmp,'wx');
    await handle.writeFile(JSON.stringify(value,null,2),'utf8');
    await handle.sync();
    await handle.close();handle=null;
    await fs.rename(tmp,file);
  }catch(error){
    try{await handle?.close();}catch{}
    try{await fs.rm(tmp,{force:true});}catch{}
    if(error?.code==='ENOSPC'){
      const wrapped=new Error('SPOOL_DISK_FULL');wrapped.code='SPOOL_DISK_FULL';wrapped.cause=error;throw wrapped;
    }
    throw error;
  }
  return file;
}

export function validateSpoolRecord(record,{parserVersion}={}){
  const errors=[];
  if(Number(record?.schemaVersion)!==SPOOL_SCHEMA_VERSION)errors.push('SCHEMA_VERSION_MISMATCH');
  if(!SPOOL_STATES.includes(record?.state))errors.push('INVALID_STATE');
  if(!record?.recordId||!record?.kind||!record?.key)errors.push('IDENTITY_MISSING');
  if(parserVersion&&record?.parserVersion!==parserVersion)errors.push('PARSER_VERSION_MISMATCH');
  return{valid:errors.length===0,errors};
}

export function transitionSpool(record,state,extra={}){
  if(!SPOOL_STATES.includes(state))throw new Error('SPOOL_STATE_INVALID');
  const terminal=new Set(['sent','replayed','expired']);
  if(terminal.has(record.state)&&record.state!==state)throw new Error('SPOOL_TERMINAL_STATE');
  return{...record,...extra,state,updatedAt:new Date().toISOString()};
}

export function registerFailure(record,error,{baseMs=5000,maxMs=900000,jitter=.2,random=Math.random}={}){
  const attempts=Number(record.attempts||0)+1;
  if(attempts>=Number(record.maxAttempts||8))return transitionSpool(record,'quarantined',{attempts,lastError:String(error?.message||error),nextAttemptAt:0});
  const raw=Math.min(maxMs,baseMs*2**Math.max(0,attempts-1));
  const factor=1+((random()*2)-1)*jitter;
  return transitionSpool(record,'failed',{attempts,lastError:String(error?.message||error),nextAttemptAt:Date.now()+Math.max(0,Math.round(raw*factor))});
}

export function expireIfOld(record,{maxAgeMs,now=Date.now()}={}){
  if(!maxAgeMs)return record;
  const created=new Date(record.createdAt||0).getTime();
  return Number.isFinite(created)&&now-created>maxAgeMs?transitionSpool(record,'expired',{nextAttemptAt:0}):record;
}

export async function loadSpoolFile(file,options={}){
  try{
    const record=JSON.parse(await fs.readFile(file,'utf8'));
    const validation=validateSpoolRecord(record,options);
    return{record,validation,error:null};
  }catch(error){return{record:null,validation:{valid:false,errors:['CORRUPT_JSON']},error};}
}

export async function quarantineFile(file,quarantineDir,reason){
  await fs.mkdir(quarantineDir,{recursive:true});
  const target=path.join(quarantineDir,path.basename(file));
  try{await fs.rename(file,target);}catch(error){if(error?.code!=='ENOENT')throw error;}
  await atomicWriteJson(`${target}.reason.json`,{reason,quarantinedAt:new Date().toISOString()});
  return target;
}

export function planReplay(records,{destination,expectedDestination,from,to,dryRun=true}={}){
  if(!destination||!expectedDestination||destination!==expectedDestination)throw new Error('REPLAY_DESTINATION_MISMATCH');
  const start=from?new Date(from).getTime():-Infinity;const end=to?new Date(to).getTime():Infinity;
  const eligible=[];const skipped=[];
  for(const record of records){
    const valid=validateSpoolRecord(record);
    const created=new Date(record?.createdAt||0).getTime();
    if(!valid.valid){skipped.push({recordId:record?.recordId||null,reason:valid.errors.join(',')});continue;}
    if(created<start||created>end){skipped.push({recordId:record.recordId,reason:'OUTSIDE_RANGE'});continue;}
    if(!['queued','failed','quarantined'].includes(record.state)){skipped.push({recordId:record.recordId,reason:`STATE_${record.state}`});continue;}
    eligible.push({recordId:record.recordId,key:record.key,state:record.state,destination});
  }
  return{dryRun:Boolean(dryRun),destination,count:eligible.length,eligible,skipped};
}
