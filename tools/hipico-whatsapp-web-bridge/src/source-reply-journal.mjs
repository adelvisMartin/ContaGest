import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWriteJson } from './spool-journal.mjs';

export const SOURCE_REPLY_STATES=Object.freeze(['prepared','sending','sent','ambiguous']);
const STATE_SET=new Set(SOURCE_REPLY_STATES);

function fingerprint(value){
  const stable=(item)=>{
    if(item===null)return 'null';
    if(Array.isArray(item))return `[${item.map(stable).join(',')}]`;
    if(typeof item==='object')return `{${Object.keys(item).sort().map((key)=>`${JSON.stringify(key)}:${stable(item[key])}`).join(',')}}`;
    return JSON.stringify(item);
  };
  return crypto.createHash('sha256').update(stable(value)).digest('hex');
}
function fileFor(root,commandId){return path.join(root,`${crypto.createHash('sha256').update(commandId).digest('hex')}.json`);}
function validateCommand(command){
  if(!command||typeof command!=='object'||Array.isArray(command))throw new Error('SOURCE_REPLY_COMMAND_INVALID');
  const commandId=String(command.commandId||'').trim();
  const targetGroupId=String(command.targetGroupId||'').trim().toLowerCase();
  const text=String(command.text||'').trim();
  if(!/^hsr_[0-9a-f-]{36}$/i.test(commandId)||!/^\d{5,}(?:-\d+)?@g\.us$/i.test(targetGroupId)||!text||text.length>3900){
    throw new Error('SOURCE_REPLY_COMMAND_INVALID');
  }
  if(command.authority?.domainEffectsAllowed!==false||command.authority?.financialAuthority!==false||command.authority?.stateMutationAllowed!==false){
    throw new Error('SOURCE_REPLY_AUTHORITY_INVALID');
  }
  return {commandId,targetGroupId,text,sourceMessageId:String(command.sourceMessageId||'').slice(0,320),reason:String(command.reason||'').slice(0,160)};
}

export function createSourceReplyJournal({rootDir,now=Date.now,logger=async()=>{}}={}){
  if(!rootDir)throw new Error('SOURCE_REPLY_ROOT_REQUIRED');
  const root=path.resolve(rootDir);
  async function ensure(){await fs.mkdir(root,{recursive:true,mode:0o700});await fs.chmod(root,0o700).catch(()=>{});}
  async function read(commandId){
    await ensure();
    try{return JSON.parse(await fs.readFile(fileFor(root,commandId),'utf8'));}
    catch(error){if(error?.code==='ENOENT')return null;throw error;}
  }
  async function write(record){
    if(!STATE_SET.has(record.state))throw new Error('SOURCE_REPLY_STATE_INVALID');
    await atomicWriteJson(fileFor(root,record.commandId),record);
    return record;
  }
  async function queue(command){
    const normalized=validateCommand(command);
    const digest=fingerprint(normalized);
    const existing=await read(normalized.commandId);
    if(existing){
      if(existing.payloadDigest!==digest){const error=new Error('SOURCE_REPLY_REPLAY_MISMATCH');error.code='SOURCE_REPLY_REPLAY_MISMATCH';throw error;}
      return{record:existing,duplicate:true};
    }
    const at=new Date(now()).toISOString();
    const record={schemaVersion:1,...normalized,payloadDigest:digest,state:'prepared',attempts:0,createdAt:at,updatedAt:at,lastError:null,deliveryRef:null,receiptSyncedAt:null};
    await write(record);return{record,duplicate:false};
  }
  async function initialize(){
    await ensure();let recovered=0;
    for(const name of (await fs.readdir(root)).filter((item)=>item.endsWith('.json')).sort()){
      const file=path.join(root,name);let record;
      try{record=JSON.parse(await fs.readFile(file,'utf8'));}catch{continue;}
      if(record?.state==='sending'){
        const next={...record,state:'ambiguous',updatedAt:new Date(now()).toISOString(),lastError:'PROCESS_RESTART_DURING_SEND'};
        await atomicWriteJson(file,next);recovered+=1;await logger(`SOURCE_REPLY_AMBIGUOUS id=${record.commandId} reason=PROCESS_RESTART_DURING_SEND`);
      }
    }
    return{recovered};
  }
  async function prepared(limit=10){
    await ensure();const safe=Math.min(100,Math.max(1,Math.trunc(Number(limit)||10)));const rows=[];
    for(const name of (await fs.readdir(root)).filter((item)=>item.endsWith('.json')).sort()){
      let record;try{record=JSON.parse(await fs.readFile(path.join(root,name),'utf8'));}catch{continue;}
      if(record?.state==='prepared')rows.push(record);
      if(rows.length>=safe)break;
    }
    return rows;
  }
  async function transition(commandId,from,to,extra={}){
    const current=await read(commandId);
    if(!current)throw new Error('SOURCE_REPLY_NOT_FOUND');
    if(current.state!==from)throw new Error(`SOURCE_REPLY_STATE_CONFLICT:${current.state}`);
    return write({...current,...extra,state:to,updatedAt:new Date(now()).toISOString()});
  }
  async function flush(deliver,{limit=8}={}){
    const result={attempted:0,sent:0,ambiguous:0,retryable:0};
    for(const record of await prepared(limit)){
      result.attempted+=1;
      const sending=await transition(record.commandId,'prepared','sending',{attempts:Number(record.attempts||0)+1});
      try{
        const receipt=await deliver(sending);
        await transition(record.commandId,'sending','sent',{sentAt:new Date(now()).toISOString(),deliveryRef:String(receipt?.deliveryRef||'').slice(0,320)||null,lastError:null});
        result.sent+=1;
      }catch(error){
        if(error?.safeToRetry===true){
          await transition(record.commandId,'sending','prepared',{lastError:String(error?.message||error).slice(0,500)});result.retryable+=1;
        }else{
          await transition(record.commandId,'sending','ambiguous',{lastError:String(error?.message||error).slice(0,500)});result.ambiguous+=1;
        }
      }
    }
    return result;
  }
  async function receiptPending(limit=20){
    await ensure();const safe=Math.min(100,Math.max(1,Math.trunc(Number(limit)||20)));const rows=[];
    for(const name of (await fs.readdir(root)).filter((item)=>item.endsWith('.json')).sort()){
      let record;try{record=JSON.parse(await fs.readFile(path.join(root,name),'utf8'));}catch{continue;}
      if((record?.state==='sent'||record?.state==='ambiguous')&&!record?.receiptSyncedAt)rows.push(record);
      if(rows.length>=safe)break;
    }
    return rows;
  }
  async function markReceiptSynced(commandId){
    const current=await read(commandId);
    if(!current||!['sent','ambiguous'].includes(current.state))throw new Error('SOURCE_REPLY_RECEIPT_STATE_INVALID');
    return write({...current,receiptSyncedAt:new Date(now()).toISOString(),updatedAt:new Date(now()).toISOString()});
  }
  async function snapshot(){
    await ensure();const counts=Object.fromEntries(SOURCE_REPLY_STATES.map((state)=>[state,0]));
    for(const name of (await fs.readdir(root)).filter((item)=>item.endsWith('.json'))){
      try{const row=JSON.parse(await fs.readFile(path.join(root,name),'utf8'));if(counts[row?.state]!==undefined)counts[row.state]+=1;}catch{}
    }
    return{counts,pending:counts.prepared,ambiguous:counts.ambiguous};
  }
  return Object.freeze({rootDir:root,initialize,queue,read,prepared,flush,receiptPending,markReceiptSynced,snapshot});
}

export const __test__={fingerprint,validateCommand,fileFor};
