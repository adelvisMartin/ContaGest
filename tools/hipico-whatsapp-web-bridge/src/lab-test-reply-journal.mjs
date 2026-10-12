import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWriteJson } from './spool-journal.mjs';
import { normalizeGroupId } from './group-identity.mjs';

// Private, local LAB-test acknowledgement authority. No message text, phone JIDs,
// token, WhatsApp session or financial data is persisted in these records.
export const LAB_TEST_ACK_STATES=Object.freeze(['prepared','sending','confirmed','ambiguous']);
const STATES=new Set(LAB_TEST_ACK_STATES);
const DIGEST=/^[a-f0-9]{64}$/;
const TAG=/^\[LABTEST:[a-f0-9]{10}\]$/;

export function labTestTagForMessage(externalId){
  return '[LABTEST:'+crypto.createHash('sha256').update(String(externalId)).digest('hex').slice(0,10)+']';
}

export function createLabTestReplyJournal({rootDir,labGroupId,sourceGroupId='',now=Date.now}={}){
  if(!rootDir)throw new Error('LAB_TEST_JOURNAL_ROOT_REQUIRED');
  const lab=normalizeGroupId(labGroupId);
  const source=sourceGroupId?normalizeGroupId(sourceGroupId):'';
  if(!lab||lab===source)throw new Error('LAB_TEST_JOURNAL_PINNED_LAB_REQUIRED');
  if(sourceGroupId&&!source)throw new Error('LAB_TEST_JOURNAL_SOURCE_ID_INVALID');
  const root=path.resolve(rootDir);
  const scopeHash=crypto.createHash('sha256').update('lab-test|'+lab).digest('hex');

  function identity(externalId){
    if(typeof externalId!=='string'||!externalId||externalId.length>2048)throw new Error('LAB_TEST_MESSAGE_ID_INVALID');
    const idHash=crypto.createHash('sha256').update(scopeHash+'|'+externalId).digest('hex');
    return{idHash,file:path.join(root,idHash+'.json'),tag:labTestTagForMessage(externalId)};
  }
  function stamp(){return new Date(now()).toISOString();}
  async function ensure(){
    await fs.mkdir(root,{recursive:true,mode:0o700});
    await fs.chmod(root,0o700).catch(()=>{});
  }
  function validate(record,expected=null){
    if(!record||typeof record!=='object'||Array.isArray(record)||
       record.schemaVersion!==1||record.scopeHash!==scopeHash||
       !DIGEST.test(record.idHash||'')||!TAG.test(record.tag||'')||
       !STATES.has(record.state)||
       !Number.isInteger(record.attempts)||record.attempts<0||
       (expected&&(record.idHash!==expected.idHash||record.tag!==expected.tag))){
      throw new Error('LAB_TEST_JOURNAL_RECORD_INVALID');
    }
    return record;
  }
  async function loadFile(file,expected=null){
    let data;
    try{data=await fs.readFile(file,'utf8');}
    catch(error){if(error?.code==='ENOENT')return null;throw error;}
    try{return validate(JSON.parse(data),expected);}
    catch{throw new Error('LAB_TEST_JOURNAL_RECORD_INVALID');}
  }
  async function read(externalId){
    const expected=identity(externalId);
    return loadFile(expected.file,expected);
  }
  async function prepare(externalId){
    const meta=identity(externalId);
    await ensure();
    const timestamp=stamp();
    const record={
      schemaVersion:1,scopeHash,idHash:meta.idHash,tag:meta.tag,
      state:'prepared',attempts:0,createdAt:timestamp,updatedAt:timestamp,
      resolution:null
    };
    let handle;
    try{
      handle=await fs.open(meta.file,'wx',0o600);
      await handle.writeFile(JSON.stringify(record,null,2),'utf8');
      await handle.sync();
      await handle.close();handle=null;
      // If directory sync is unsupported, the file still remains private and
      // each later state transition uses atomicWriteJson's durability barrier.
      try{
        const dir=await fs.open(root,'r');
        try{await dir.sync();}finally{await dir.close();}
      }catch{}
      return{record,created:true};
    }catch(error){
      await handle?.close().catch(()=>{});
      if(error?.code!=='EEXIST')throw error;
      return{record:validate(await loadFile(meta.file,meta),meta),created:false};
    }
  }
  async function transition(externalId,from,to,{resolution=null,visibleTag=false}={}){
    const meta=identity(externalId);
    const record=await loadFile(meta.file,meta);
    if(!record)throw new Error('LAB_TEST_JOURNAL_NOT_FOUND');
    if(record.state===to)return record; // idempotent durable acknowledgement
    if(record.state!==from)throw new Error('LAB_TEST_JOURNAL_STATE_CONFLICT');
    if(to==='confirmed'&&visibleTag!==true)throw new Error('LAB_TEST_VISIBLE_TAG_REQUIRED');
    const next={
      ...record,state:to,updatedAt:stamp(),
      attempts:to==='sending'?record.attempts+1:record.attempts,
      resolution:resolution??record.resolution
    };
    await atomicWriteJson(meta.file,next);
    return next;
  }
  const begin=(externalId)=>transition(externalId,'prepared','sending');
  const retryPrepared=(externalId)=>transition(externalId,'sending','prepared',{resolution:'SAFE_PRE_SEND_FAILURE'});
  const markAmbiguous=(externalId)=>transition(externalId,'sending','ambiguous',{resolution:'UNCERTAIN_LAB_DELIVERY'});
  const confirm=(externalId,{visibleTag=false}={})=>{
    const meta=identity(externalId);
    return (async()=>{
      const current=await loadFile(meta.file,meta);
      if(!current)throw new Error('LAB_TEST_JOURNAL_NOT_FOUND');
      if(current.state==='confirmed')return current;
      if(!['sending','ambiguous'].includes(current.state))throw new Error('LAB_TEST_JOURNAL_STATE_CONFLICT');
      return transition(externalId,current.state,'confirmed',{resolution:'VISIBLE_OUTGOING_TAG',visibleTag});
    })();
  };
  async function initialize(){
    await ensure();
    let recovered=0;
    for(const name of (await fs.readdir(root)).filter(n=>n.endsWith('.json')).sort()){
      if(!DIGEST.test(name.slice(0,-5))||name.length!==69)throw new Error('LAB_TEST_JOURNAL_FILE_INVALID');
      const file=path.join(root,name);
      const row=await loadFile(file);
      if(!row||name!==row.idHash+'.json')throw new Error('LAB_TEST_JOURNAL_RECORD_INVALID');
      if(row.state==='sending'){
        await atomicWriteJson(file,{
          ...row,state:'ambiguous',updatedAt:stamp(),resolution:'PROCESS_RESTART_DURING_SEND'
        });
        recovered++;
      }
    }
    return{recovered};
  }
  async function snapshot(){
    await ensure();
    const counts=Object.fromEntries(LAB_TEST_ACK_STATES.map(state=>[state,0]));
    for(const name of (await fs.readdir(root)).filter(n=>n.endsWith('.json'))){
      if(!DIGEST.test(name.slice(0,-5))||name.length!==69)throw new Error('LAB_TEST_JOURNAL_FILE_INVALID');
      const row=await loadFile(path.join(root,name));
      if(!row||row.idHash+'.json'!==name)throw new Error('LAB_TEST_JOURNAL_RECORD_INVALID');
      counts[row.state]++;
    }
    return{counts,pending:counts.prepared+counts.sending,ambiguous:counts.ambiguous};
  }
  return Object.freeze({
    rootDir:root,initialize,prepare,read,begin,retryPrepared,markAmbiguous,confirm,snapshot
  });
}
