import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  SPOOL_STATES,
  atomicWriteJson,
  createSpoolRecord,
  expireIfOld,
  loadSpoolFile,
  registerFailure,
  validateSpoolRecord
} from './spool-journal.mjs';
import { normalizeReplayArgs } from './replay-policy.mjs';

export const BRIDGE_SPOOL_KINDS=Object.freeze({
  BACKEND_EVENT:'backend-event',
  LAB_MIRROR:'lab-mirror',
  SOURCE_REPLY:'source-reply'
});

const ACTIVE_STATES=new Set(['queued','failed']);
const REPLAYABLE_STATES=new Set(['failed','quarantined','expired']);
const KIND_VALUES=new Set(Object.values(BRIDGE_SPOOL_KINDS));

function safePart(value){return String(value??'').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120)||'unknown';}
function iso(value=Date.now()){return new Date(value).toISOString();}
function canonicalPayload(value){
  if(value===null)return'null';
  if(Array.isArray(value))return`[${value.map((item)=>canonicalPayload(item)).join(',')}]`;
  if(typeof value==='object'){
    return`{${Object.keys(value).sort().filter((key)=>value[key]!==undefined).map((key)=>`${JSON.stringify(key)}:${canonicalPayload(value[key])}`).join(',')}}`;
  }
  const serialized=JSON.stringify(value);
  return serialized===undefined?'null':serialized;
}
function payloadFingerprint(payload){return crypto.createHash('sha256').update(canonicalPayload(payload)).digest('hex');}
function boundedLimit(value,code='SPOOL_LIMIT_INVALID'){
  const parsed=Number(value);
  if(!Number.isInteger(parsed)||parsed<1||parsed>1000)throw new Error(code);
  return parsed;
}

export function createBridgeSpoolRuntime({
  rootDir,
  legacyEventDir=null,
  legacyMirrorDir=null,
  legacyDeadLetterDir=null,
  parserVersion='unknown',
  maxAttempts=8,
  maxAgeMs=7*24*60*60*1000,
  baseMs=5000,
  maxMs=900000,
  jitter=.2,
  random=Math.random,
  now=Date.now,
  logger=async()=>{}
}={}){
  if(!rootDir)throw new Error('SPOOL_ROOT_REQUIRED');
  const root=path.resolve(rootDir);
  const archive=path.join(root,'legacy-archive');

  function stateDir(state){
    if(!SPOOL_STATES.includes(state))throw new Error('SPOOL_STATE_INVALID');
    return path.join(root,state);
  }
  function recordFile(record,state=record.state){return path.join(stateDir(state),`${record.recordId}.json`);}
  async function ensure(){
    await Promise.all([...SPOOL_STATES.map((state)=>fs.mkdir(stateDir(state),{recursive:true})),fs.mkdir(archive,{recursive:true})]);
  }
  async function findRecord(recordId){
    for(const state of SPOOL_STATES){
      const file=path.join(stateDir(state),`${recordId}.json`);
      const loaded=await loadSpoolFile(file).catch(()=>null);
      if(loaded?.record&&loaded.validation.valid)return{...loaded,file,state};
      if(loaded?.error?.code!=='ENOENT'&&loaded?.record)return{...loaded,file,state};
    }
    return null;
  }
  async function persist(record,{fromFile=null}={}){
    const file=recordFile(record);
    await atomicWriteJson(file,record);
    if(fromFile&&path.resolve(fromFile)!==path.resolve(file))await fs.rm(fromFile,{force:true});
    return{record,file};
  }
  async function queue(kind,key,payload){
    if(!KIND_VALUES.has(kind))throw new Error('SPOOL_KIND_INVALID');
    const candidate=createSpoolRecord({kind,key,payload,parserVersion,createdAt:iso(now()),maxAttempts});
    const existing=await findRecord(candidate.recordId);
    if(existing){
      if(payloadFingerprint(existing.record.payload)!==payloadFingerprint(payload)){
        const error=new Error('Spool identity was reused with different payload content.');
        error.code='SPOOL_REPLAY_MISMATCH';
        error.retryable=false;
        throw error;
      }
      return{record:existing.record,file:existing.file,duplicate:true};
    }
    const written=await persist(candidate);
    return{...written,duplicate:false};
  }
  async function quarantineLoaded(file,record,reason){
    const nowIso=iso(now());
    const quarantined={
      ...(record||createSpoolRecord({kind:BRIDGE_SPOOL_KINDS.BACKEND_EVENT,key:`corrupt:${path.basename(file)}`,payload:{legacyFile:path.basename(file)},parserVersion,createdAt:nowIso,maxAttempts})),
      state:'quarantined',updatedAt:nowIso,nextAttemptAt:0,lastError:String(reason||'QUARANTINED'),quarantineReason:String(reason||'QUARANTINED')
    };
    return persist(quarantined,{fromFile:file});
  }
  async function moveRecord(file,record,nextState,extra={}){
    const moved={...record,...extra,state:nextState,updatedAt:iso(now())};
    return persist(moved,{fromFile:file});
  }
  async function listState(state){
    await ensure();
    const names=(await fs.readdir(stateDir(state))).filter((name)=>name.endsWith('.json')).sort();
    const rows=[];
    for(const name of names){
      const file=path.join(stateDir(state),name);
      const loaded=await loadSpoolFile(file);
      if(!loaded.validation.valid){
        await quarantineLoaded(file,loaded.record,loaded.validation.errors.join(','));
        await logger(`SPOOL_QUARANTINE invalid=${name} reason=${loaded.validation.errors.join(',')}`);
        continue;
      }
      if(ACTIVE_STATES.has(state)&&loaded.record.parserVersion!==parserVersion){
        await quarantineLoaded(file,loaded.record,'PARSER_VERSION_MISMATCH');
        await logger(`SPOOL_QUARANTINE invalid=${name} reason=PARSER_VERSION_MISMATCH`);
        continue;
      }
      rows.push({file,record:loaded.record});
    }
    return rows;
  }
  async function due(kind,{limit=100}={}){
    const safeLimit=boundedLimit(limit);
    const rows=[];
    const terminalIds=new Set();
    for(const terminalState of ['sent','replayed','expired']){
      for(const {record} of await listState(terminalState)){if(record.kind===kind)terminalIds.add(record.recordId);}
    }
    const seenIds=new Set();
    for(const state of ['queued','failed']){
      for(const item of await listState(state)){
        if(item.record.kind!==kind)continue;
        if(terminalIds.has(item.record.recordId)){
          await fs.rm(item.file,{force:true});
          await logger(`SPOOL_STALE_ACTIVE_DUPLICATE kind=${kind} id=${item.record.recordId}`);
          continue;
        }
        if(seenIds.has(item.record.recordId))continue;
        seenIds.add(item.record.recordId);
        let record=expireIfOld(item.record,{maxAgeMs,now:now()});
        if(record.state==='expired'){
          await moveRecord(item.file,record,'expired',{expiredAt:iso(now())});
          await logger(`SPOOL_EXPIRED kind=${kind} id=${record.recordId}`);
          continue;
        }
        if(state==='failed'&&Number(record.nextAttemptAt||0)>now())continue;
        rows.push({file:item.file,record});
        if(rows.length>=safeLimit)return rows;
      }
    }
    return rows;
  }
  async function fail(file,record,error){
    if(error?.retryable===false){
      return moveRecord(file,record,'quarantined',{attempts:Number(record.attempts||0)+1,nextAttemptAt:0,lastError:String(error?.message||error).slice(0,500),quarantineReason:'NON_RETRYABLE'});
    }
    let failed=registerFailure(record,error,{baseMs,maxMs,jitter,random,now});
    if(failed.state==='failed'&&Number(error?.retryAfterMs||0)>0){
      failed={...failed,nextAttemptAt:Math.max(Number(failed.nextAttemptAt||0),now()+Number(error.retryAfterMs))};
    }
    return persist(failed,{fromFile:file});
  }
  async function flushKind(kind,deliver,{limit=100,canContinue=()=>true}={}){
    if(!KIND_VALUES.has(kind))throw new Error('SPOOL_KIND_INVALID');
    const safeLimit=boundedLimit(limit);
    const result={kind,attempted:0,delivered:0,failed:0,quarantined:0,expired:0};
    const candidates=await due(kind,{limit:safeLimit});
    for(const item of candidates){
      if(!canContinue())break;
      result.attempted+=1;
      try{
        await deliver(item.record.payload,item.record);
        const replayed=Boolean(item.record.replayRequestedAt);
        await moveRecord(item.file,item.record,replayed?'replayed':'sent',{
          deliveredAt:iso(now()),nextAttemptAt:0,lastError:null,
          ...(replayed?{replayedAt:iso(now())}:{sentAt:iso(now())})
        });
        result.delivered+=1;
      }catch(error){
        const next=await fail(item.file,item.record,error);
        if(next.record.state==='quarantined')result.quarantined+=1;else result.failed+=1;
      }
    }
    return result;
  }
  async function migrateLegacyDir(dir,kind,label){
    if(!dir)return{migrated:0,corrupt:0};
    const names=(await fs.readdir(dir).catch(()=>[])).filter((name)=>name.endsWith('.json')).sort();
    let migrated=0;let corrupt=0;
    const archiveDir=path.join(archive,safePart(label));
    await fs.mkdir(archiveDir,{recursive:true});
    for(const name of names){
      const source=path.join(dir,name);
      let raw;let wrapper;
      try{raw=await fs.readFile(source,'utf8');wrapper=JSON.parse(raw);}catch(error){
        const key=`legacy-corrupt:${label}:${name}`;
        const record=createSpoolRecord({kind,key,payload:{legacyFile:name,legacyKind:label,readError:String(error?.message||error)},parserVersion:'legacy-v1',createdAt:iso(now()),maxAttempts});
        await persist({...record,state:'quarantined',lastError:'LEGACY_CORRUPT_JSON',quarantineReason:'LEGACY_CORRUPT_JSON'});
        await fs.rename(source,path.join(archiveDir,name)).catch(async(renameError)=>{if(renameError?.code!=='ENOENT')throw renameError;});
        corrupt+=1;continue;
      }
      const payload=kind===BRIDGE_SPOOL_KINDS.BACKEND_EVENT?(wrapper?.event||wrapper):wrapper;
      const key=kind===BRIDGE_SPOOL_KINDS.BACKEND_EVENT
        ?`${payload?.channelKey||'legacy'}|${payload?.externalMessageId||name}`
        :String(payload?.sourceExternalMessageId||name);
      const record=createSpoolRecord({kind,key,payload,parserVersion:'legacy-v1',createdAt:wrapper?.queuedAt||wrapper?.createdAt||iso(now()),maxAttempts});
      const existing=await findRecord(record.recordId);
      if(!existing){
        await persist({...record,state:'quarantined',updatedAt:iso(now()),lastError:'LEGACY_REQUIRES_EXPLICIT_REPLAY',quarantineReason:'LEGACY_REQUIRES_EXPLICIT_REPLAY',legacySourceFile:name});
      }
      await fs.rename(source,path.join(archiveDir,name)).catch(async(error)=>{if(error?.code!=='ENOENT')throw error;});
      migrated+=1;
    }
    if(migrated||corrupt)await logger(`SPOOL_LEGACY_QUARANTINED kind=${label} migrated=${migrated} corrupt=${corrupt}`);
    return{migrated,corrupt};
  }
  async function initialize(){
    await ensure();
    const events=await migrateLegacyDir(legacyEventDir,BRIDGE_SPOOL_KINDS.BACKEND_EVENT,'backend-event');
    const mirrors=await migrateLegacyDir(legacyMirrorDir,BRIDGE_SPOOL_KINDS.LAB_MIRROR,'lab-mirror');
    const dead=await migrateLegacyDir(legacyDeadLetterDir,BRIDGE_SPOOL_KINDS.BACKEND_EVENT,'dead-letter');
    return{events,mirrors,dead};
  }
  async function snapshot(){
    const counts=Object.fromEntries(SPOOL_STATES.map((state)=>[state,0]));
    const byKind={
      [BRIDGE_SPOOL_KINDS.BACKEND_EVENT]:Object.fromEntries(SPOOL_STATES.map((state)=>[state,0])),
      [BRIDGE_SPOOL_KINDS.LAB_MIRROR]:Object.fromEntries(SPOOL_STATES.map((state)=>[state,0])),
      [BRIDGE_SPOOL_KINDS.SOURCE_REPLY]:Object.fromEntries(SPOOL_STATES.map((state)=>[state,0]))
    };
    for(const state of SPOOL_STATES){
      for(const item of await listState(state)){
        counts[state]+=1;
        if(byKind[item.record.kind])byKind[item.record.kind][state]+=1;
      }
    }
    return{
      counts,byKind,
      pendingBackend:byKind[BRIDGE_SPOOL_KINDS.BACKEND_EVENT].queued+byKind[BRIDGE_SPOOL_KINDS.BACKEND_EVENT].failed,
      pendingLab:byKind[BRIDGE_SPOOL_KINDS.LAB_MIRROR].queued+byKind[BRIDGE_SPOOL_KINDS.LAB_MIRROR].failed,
      pendingSourceReplies:byKind[BRIDGE_SPOOL_KINDS.SOURCE_REPLY].queued+byKind[BRIDGE_SPOOL_KINDS.SOURCE_REPLY].failed,
      quarantined:counts.quarantined
    };
  }
  async function replayPlan({kind,destination,expectedDestination,from=null,to=null,limit=100}={}){
    if(!KIND_VALUES.has(kind))throw new Error('SPOOL_KIND_INVALID');
    if(!destination||destination!==expectedDestination)throw new Error('REPLAY_DESTINATION_MISMATCH');
    const scope=normalizeReplayArgs({
      ...(from?{from}:{ }),
      ...(to?{to}:{ }),
      limit
    });
    const start=scope.from?Date.parse(scope.from):-Infinity;
    const end=scope.to?Date.parse(scope.to):Infinity;
    const eligible=[];const skipped=[];
    for(const state of [...REPLAYABLE_STATES]){
      for(const {record} of await listState(state)){
        if(record.kind!==kind)continue;
        const created=new Date(record.createdAt||0).getTime();
        if(created<start||created>end){skipped.push({recordId:record.recordId,reason:'OUTSIDE_RANGE'});continue;}
        eligible.push({recordId:record.recordId,key:record.key,state:record.state,destination});
        if(eligible.length>=scope.limit)break;
      }
      if(eligible.length>=scope.limit)break;
    }
    return{dryRun:true,kind,destination,count:eligible.length,eligible,skipped};
  }
  async function requestReplay({kind,destination,expectedDestination,recordIds,expectedCount}={}){
    if(!KIND_VALUES.has(kind))throw new Error('SPOOL_KIND_INVALID');
    if(!destination||destination!==expectedDestination)throw new Error('REPLAY_DESTINATION_MISMATCH');
    if(!Array.isArray(recordIds))throw new Error('REPLAY_RECORD_IDS_REQUIRED');
    if(recordIds.length>1000)throw new Error('REPLAY_LIMIT_INVALID');
    const normalizedIds=recordIds.map((id)=>String(id||'').trim());
    if(normalizedIds.some((id)=>!id||id.length>128))throw new Error('REPLAY_RECORD_ID_INVALID');
    if(new Set(normalizedIds).size!==normalizedIds.length)throw new Error('REPLAY_RECORD_IDS_DUPLICATED');
    if(Number(expectedCount)!==normalizedIds.length)throw new Error('REPLAY_COUNT_MISMATCH');

    const prepared=[];
    for(const id of normalizedIds){
      const found=await findRecord(id);
      if(!found||!REPLAYABLE_STATES.has(found.record.state)||found.record.kind!==kind){
        throw new Error(`REPLAY_RECORD_NOT_ELIGIBLE:${id}`);
      }
      prepared.push(found);
    }

    const moved=[];
    for(const found of prepared){
      const id=found.record.recordId;
      const next={...found.record,state:'queued',updatedAt:iso(now()),attempts:0,nextAttemptAt:0,lastError:null,replayRequestedAt:iso(now()),replayCount:Number(found.record.replayCount||0)+1,replayDestination:destination};
      await persist(next,{fromFile:found.file});
      moved.push(id);
    }
    await logger(`SPOOL_REPLAY_REQUEST kind=${kind} count=${moved.length} destination=${destination}`);
    return{queued:moved.length,recordIds:moved};
  }

  return Object.freeze({
    rootDir:root,
    initialize,
    queueBackendEvent:(event)=>{
      if(!event?.channelKey||!event?.externalMessageId)throw new Error('SPOOL_EVENT_ID_REQUIRED');
      return queue(BRIDGE_SPOOL_KINDS.BACKEND_EVENT,`${event.channelKey}|${event.externalMessageId}`,event);
    },
    queueLabMirror:(mirror)=>{
      if(!mirror?.sourceExternalMessageId)throw new Error('SPOOL_MIRROR_ID_REQUIRED');
      return queue(BRIDGE_SPOOL_KINDS.LAB_MIRROR,String(mirror.sourceExternalMessageId),mirror);
    },
    queueSourceReply:(reply)=>{
      if(!reply?.replyId||!reply?.sourceMessageId)throw new Error('SPOOL_SOURCE_REPLY_ID_REQUIRED');
      return queue(BRIDGE_SPOOL_KINDS.SOURCE_REPLY,`${reply.replyId}|${reply.sourceMessageId}`,reply);
    },
    flushBackend:(deliver,options)=>flushKind(BRIDGE_SPOOL_KINDS.BACKEND_EVENT,deliver,options),
    flushLab:(deliver,options)=>flushKind(BRIDGE_SPOOL_KINDS.LAB_MIRROR,deliver,options),
    flushSourceReplies:(deliver,options)=>flushKind(BRIDGE_SPOOL_KINDS.SOURCE_REPLY,deliver,options),
    snapshot,replayPlan,requestReplay,findRecord
  });
}

export const __test__={canonicalPayload,payloadFingerprint,boundedLimit};
