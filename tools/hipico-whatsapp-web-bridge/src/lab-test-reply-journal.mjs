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
  if(!source)throw new Error('LAB_TEST_JOURNAL_PINNED_SOURCE_REQUIRED');
  const root=path.resolve(rootDir);
  const scopeHash=crypto.createHash('sha256').update('lab-test|'+lab).digest('hex');
  let scopeVerified=false;

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
  async function verifyScope(){
    if(scopeVerified)return;
    let files;
    try{files=await fs.readdir(root);}
    catch(error){
      if(error?.code==='ENOENT'){scopeVerified=true;return;}
      throw error;
    }
    for(const name of files){
      if(!name.endsWith('.json'))continue;
      if(!/^[a-f0-9]{64}\\.json$/.test(name))throw new Error('LAB_TEST_JOURNAL_FILE_INVALID');
      const file=path.join(root,name);
      const record=await loadFile(file);
      if(!record||record.idHash+'.json'!==name)throw new Error('LAB_TEST_JOURNAL_RECORD_INVALID');
    }
    scopeVerified=true;
  }
  async function read(externalId){
    const expected=identity(externalId);
    await verifyScope();
    return loadFile(expected.file,expected);
  }
  async function prepare(externalId){
    const meta=identity(externalId);
    await verifyScope();
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
    scopeVerified=true;
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

  async function inspectReadOnly({state='all',limit=50}={}){
    // No ensure(), chmod(), initialization or transition: safe while the Bridge is down.
    if(state!=='all'&&!STATES.has(state))throw new Error('LAB_TEST_REPORT_STATE_INVALID');
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('LAB_TEST_REPORT_LIMIT_INVALID');
    let rootStat;
    try{rootStat=await fs.lstat(root);}
    catch(error){
      if(error?.code==='ENOENT')throw new Error('LAB_TEST_JOURNAL_MISSING');
      throw new Error('LAB_TEST_JOURNAL_READ_FAILED');
    }
    if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw new Error('LAB_TEST_JOURNAL_ROOT_UNSAFE');
    let entries;
    try{entries=await fs.readdir(root,{withFileTypes:true});}
    catch{throw new Error('LAB_TEST_JOURNAL_READ_FAILED');}
    const counts=Object.fromEntries(LAB_TEST_ACK_STATES.map(key=>[key,0]));
    const rows=[];
    let selectedCount=0;
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
      if(!entry.isFile()||!/^[a-f0-9]{64}\.json$/.test(entry.name)){
        throw new Error('LAB_TEST_JOURNAL_FILE_INVALID');
      }
      // The reporter must never follow a symlink or expose raw disk payloads.
      const file=path.join(root,entry.name);
      let record;
      try{record=await loadFile(file);}
      catch{throw new Error('LAB_TEST_JOURNAL_RECORD_INVALID');}
      if(!record||entry.name!==record.idHash+'.json'||
         !Number.isFinite(Date.parse(record.createdAt))||
         !Number.isFinite(Date.parse(record.updatedAt))){
        throw new Error('LAB_TEST_JOURNAL_RECORD_INVALID');
      }
      counts[record.state]++;
      if(state==='all'||record.state===state){
        selectedCount++;
        if(rows.length>=limit)continue;
        rows.push({
          recordRef:record.idHash.slice(0,16),
          tag:record.tag,
          state:record.state,
          attempts:record.attempts,
          updatedAt:record.updatedAt,
          resolution:(
            ['SAFE_PRE_SEND_FAILURE','UNCERTAIN_LAB_DELIVERY',
             'PROCESS_RESTART_DURING_SEND','VISIBLE_OUTGOING_TAG']
              .includes(record.resolution)
          )?record.resolution:null
        });
      }
    }
    const reviewRequired=counts.sending+counts.ambiguous;
    return{
      schemaVersion:1,
      mode:'READ_ONLY',
      sourceWriteAllowed:false,
      releaseGate:'NOT_EVALUATED',
      generatedAt:stamp(),
      status:reviewRequired>0?'REVIEW_REQUIRED':'NO_AMBIGUOUS_RECORDS',
      counts,
      pending:counts.prepared+counts.sending,
      reviewRequired,
      selectedState:state,
      selectedCount,
      returnedCount:rows.length,
      truncated:selectedCount>limit,
      rows
    };
  }

  return Object.freeze({
    rootDir:root,initialize,prepare,read,begin,retryPrepared,markAmbiguous,confirm,snapshot,inspectReadOnly
  });
}
