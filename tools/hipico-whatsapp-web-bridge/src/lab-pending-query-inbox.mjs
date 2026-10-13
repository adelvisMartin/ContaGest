import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { normalizeGroupId, extractGroupIds } from './group-identity.mjs';
import { stableLabSenderKey, labConversationInput } from './lab-conversation-context.mjs';
import { classifyLocal } from './runtime-utils.mjs';
import { labReadOnlyQueryPurpose, explicitLabRaceScope } from './lab-canonical-query.mjs';

const SCHEMA=1;
const HASH=/^[a-f0-9]{64}$/;
const HEX=/^[a-f0-9]+$/;
const PURPOSES=new Set(['status','result','participants','next','active','schedule']);
const MAX_AGE_MS=10*60*1000;
const MAX_RECORDS=200;
const MAX_SIZE=12*1024;
// Durable quoted race scopes must contain an actual calendar date.
const isCalendarDate = value => {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const iso=value+'T00:00:00.000Z';
  return Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0,10)===value;
};

/**
 * A previously verified quoted race may scroll out of the DOM. Reuse only
 * immutable encrypted input, never a newly guessed quote or changed sender.
 */
export function reconcileLabPendingObservation(saved,observed){
  if(!saved||!observed ||
    saved.messageId!==observed.messageId ||
    saved.senderId!==observed.senderId ||
    saved.text!==observed.text ||
    saved.purpose!==observed.purpose ||
    saved.messageTimestamp!==observed.messageTimestamp){
    return {valid:false,reason:'LAB_PENDING_OBSERVATION_MISMATCH'};
  }
  if(observed.quotedMessageId && saved.quotedMessageId!==observed.quotedMessageId){
    return {valid:false,reason:'LAB_PENDING_QUOTE_CHANGED'};
  }
  const explicit=observed.explicitRace;
  if(explicit && JSON.stringify(explicit)!==JSON.stringify(saved.race)){
    return {valid:false,reason:'LAB_PENDING_RACE_CHANGED'};
  }
  return {valid:true,race:saved.race,quotedMessageId:saved.quotedMessageId};
}

// Encrypted pre-query inbox; this is NOT a WhatsApp delivery or financial authority.
export function createLabPendingQueryInbox({rootDir,labGroupId,sourceGroupId,now=Date.now,maxAgeMs=MAX_AGE_MS,maxEntries=MAX_RECORDS}={}){
  const lab=normalizeGroupId(labGroupId);
  const source=normalizeGroupId(sourceGroupId);
  if(!rootDir||!lab||!source||lab===source)throw new Error('LAB_PENDING_SCOPE_REQUIRED');
  if(!Number.isInteger(maxAgeMs)||maxAgeMs<1000||maxAgeMs>MAX_AGE_MS
    ||!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>MAX_RECORDS){
    throw new Error('LAB_PENDING_LIMITS_INVALID');
  }
  const root=path.resolve(rootDir);
  const keyFile=path.join(root,'inbox.key');
  const lockFile=path.join(root,'owner.lock');
  const scopeHash=crypto.createHash('sha256').update('lab-inbox|'+lab+'|'+source).digest('hex');
  const hostHash=crypto.createHash('sha256').update('lab-host|'+os.hostname().trim().toLowerCase()).digest('hex');
  let key=null;
  let token=null;
  let initialized=false;
  const clock=()=>Number(now());
  const identity=(id)=>{
    if(typeof id!=='string'||id.length<8||id.length>320)throw new Error('LAB_PENDING_MESSAGE_ID_INVALID');
    return crypto.createHmac('sha256',key).update('lab-query|'+scopeHash+'|'+id).digest('hex');
  };
  const fileFor=hash=>path.join(root,hash+'.json');
  const assertReady=()=>{if(!initialized||!token||!key)throw new Error('LAB_PENDING_NOT_INITIALIZED');};

  const belongsExclusivelyToLab = id => {
    const groups=extractGroupIds(id);
    return groups.length===1 && groups[0]===lab;
  };
  function validate(item,{allowExpired=false}={}){
    if(!item||typeof item!=='object'||Array.isArray(item)||
      typeof item.messageId!=='string'||typeof item.senderId!=='string'||
      typeof item.text!=='string'||item.text.length<6||item.text.length>1200||
      typeof item.messageTimestamp!=='string'||!Number.isFinite(Date.parse(item.messageTimestamp))||
      Date.parse(item.messageTimestamp)>clock()+60_000||
      (!allowExpired&&clock()-Date.parse(item.messageTimestamp)>=maxAgeMs)||
      !PURPOSES.has(item.purpose)||!Number.isFinite(item.capturedAt)||
      item.capturedAt>clock()+60_000||(!allowExpired&&clock()-item.capturedAt>maxAgeMs)||
      !belongsExclusivelyToLab(item.messageId)||stableLabSenderKey(item.messageId)!==item.senderId||
      labReadOnlyQueryPurpose(item.text,classifyLocal(item.text))!==item.purpose||
      !labConversationInput({id:item.messageId,text:item.text,fromMe:false,hasMedia:false},classifyLocal(item.text)).eligible||
      (item.quotedMessageId!==null&&(
        typeof item.quotedMessageId!=='string'||item.quotedMessageId.length>320||
        !belongsExclusivelyToLab(item.quotedMessageId)||
        stableLabSenderKey(item.quotedMessageId)!==item.senderId
      ))||
      (item.race!==null&&(!Number.isInteger(item.race?.raceNumber)||item.race.raceNumber<1||
        item.race.raceNumber>999||typeof item.race.racetrack!=='string'||
        !item.race.racetrack.trim()||item.race.racetrack.length>90||
        !isCalendarDate(item.race.raceDate)))||
      (item.quotedMessageId!==null&&item.race===null)||
      (item.race!==null&&item.quotedMessageId===null&&
        JSON.stringify(explicitLabRaceScope(item.text))!==JSON.stringify(item.race))){
      throw new Error('LAB_PENDING_QUERY_INVALID');
    }
    return item;
  }
  async function safeRoot(){
    await fs.mkdir(root,{recursive:true,mode:0o700});
    const stat=await fs.lstat(root);
    if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('LAB_PENDING_ROOT_UNSAFE');
    await fs.chmod(root,0o700).catch(()=>{});
  }
  async function loadKey(){
    // The owner lock MUST already be held. Never publish a partially written
    // AES key: a crash can leave only an untrusted staging file, never inbox.key.
    if(!token)throw new Error('LAB_PENDING_LOCK_REQUIRED_FOR_KEY');
    try{
      await fs.lstat(keyFile);
    }catch(error){
      if(error?.code!=='ENOENT')throw error;
      // Never generate a different AES key if durable ciphertext already
      // exists. An operator can restore the original key from backup.
      if((await fs.readdir(root)).some(name=>name.endsWith('.json'))){
        throw new Error('LAB_PENDING_KEY_MISSING_WITH_RECORDS');
      }
      const temp=path.join(root,'inbox.key.'+crypto.randomUUID()+'.tmp');
      let handle;
      try{
        handle=await fs.open(temp,'wx',0o600);
        await handle.writeFile(crypto.randomBytes(32));
        await handle.sync();
        await handle.close();handle=null;
        // Owner-lock isolation makes this rename the only legitimate key
        // publisher. Never overwrite an existing key, even if malformed.
        try{
          await fs.lstat(keyFile);
          throw new Error('LAB_PENDING_KEY_ALREADY_EXISTS');
        }catch(e){
          if(e?.code!=='ENOENT')throw e;
        }
        await fs.rename(temp,keyFile);
        try{
          const dir=await fs.open(root,'r');
          try{await dir.sync();}finally{await dir.close();}
        }catch{}
      }finally{
        await handle?.close().catch(()=>{});
        await fs.rm(temp,{force:true}).catch(()=>{});
      }
    }
    const stat=await fs.lstat(keyFile);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==32)throw new Error('LAB_PENDING_KEY_INVALID');
    return await fs.readFile(keyFile);
  }
  async function lockOwner(){
    const myToken=crypto.randomUUID();
    const body={pid:process.pid,token:myToken,scopeHash,hostHash};
    const acquire=async()=>{
      let handle;
      try{
        handle=await fs.open(lockFile,'wx',0o600);
        await handle.writeFile(JSON.stringify(body));
        await handle.sync();
        token=myToken;
        return true;
      }catch(e){
        if(e?.code!=='EEXIST')throw e;
        return false;
      }finally{await handle?.close();}
    };
    if(await acquire())return;
    let old,stat;
    try{
      stat=await fs.lstat(lockFile);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>512)throw new Error('LAB_PENDING_LOCK_INVALID');
      old=JSON.parse(await fs.readFile(lockFile,'utf8'));
      if(old.scopeHash!==scopeHash||!Number.isInteger(old.pid)||old.pid<1||
         typeof old.token!=='string'||typeof old.hostHash!=='string'||!HASH.test(old.hostHash)){
        throw new Error('LAB_PENDING_LOCK_INVALID');
      }
      // A PID only identifies a process on this host; another host may own the same number.
      // Never reclaim a lock from another machine through local process.kill().
      if(old.hostHash!==hostHash)throw new Error('LAB_PENDING_REMOTE_OWNER');
    }catch(e){
      if(e?.message==='LAB_PENDING_REMOTE_OWNER')throw e;
      throw new Error('LAB_PENDING_LOCK_INVALID');
    }
    try{
      process.kill(old.pid,0);
      throw new Error('LAB_PENDING_ALREADY_RUNNING');
    }catch(e){
      if(e?.message==='LAB_PENDING_ALREADY_RUNNING'||e?.code!=='ESRCH'){
        throw new Error('LAB_PENDING_ALREADY_RUNNING');
      }
    }
    // Only dead local PIDs can be reclaimed. Conservative on permission failures.
    const same=await fs.lstat(lockFile);
    if(same.ino!==stat.ino||same.size!==stat.size)throw new Error('LAB_PENDING_LOCK_CONFLICT');
    await fs.rm(lockFile);
    if(!(await acquire()))throw new Error('LAB_PENDING_ALREADY_RUNNING');
  }
  function seal(item,hash){
    const iv=crypto.randomBytes(12);
    const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(Buffer.from(scopeHash+'|'+hash));
    const ciphertext=Buffer.concat([cipher.update(JSON.stringify(item),'utf8'),cipher.final()]);
    return {schemaVersion:SCHEMA,scopeHash,idHash:hash,
      nonce:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),
      ciphertext:ciphertext.toString('base64')};
  }
  function openRecord(data,hash){
    if(data?.schemaVersion!==SCHEMA||data.scopeHash!==scopeHash||data.idHash!==hash||
       typeof data.nonce!=='string'||data.nonce.length!==24||!HEX.test(data.nonce)||
       typeof data.tag!=='string'||data.tag.length!==32||!HEX.test(data.tag)||
       typeof data.ciphertext!=='string'||data.ciphertext.length>MAX_SIZE){
      throw new Error('LAB_PENDING_RECORD_INVALID');
    }
    try{
      const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(data.nonce,'hex'));
      decipher.setAAD(Buffer.from(scopeHash+'|'+hash));
      decipher.setAuthTag(Buffer.from(data.tag,'hex'));
      const decoded=Buffer.concat([decipher.update(Buffer.from(data.ciphertext,'base64')),decipher.final()]);
      const item=validate(JSON.parse(decoded.toString('utf8')),{allowExpired:true});
      if(identity(item.messageId)!==hash)throw new Error('LAB_PENDING_ID_MISMATCH');
      return item;
    }catch{throw new Error('LAB_PENDING_RECORD_INVALID');}
  }
  async function openFile(hash){
    const file=fileFor(hash);
    let stat;
    try{stat=await fs.lstat(file);}catch(e){if(e?.code==='ENOENT')return null;throw e;}
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_SIZE)throw new Error('LAB_PENDING_FILE_INVALID');
    try{return openRecord(JSON.parse(await fs.readFile(file,'utf8')),hash);}
    catch{throw new Error('LAB_PENDING_RECORD_INVALID');}
  }
  async function scan(){
    const names=(await fs.readdir(root)).filter(n=>n.endsWith('.json'));
    const rows=[];let expired=0;
    for(const filename of names.sort()){
      if(!/^[a-f0-9]{64}\.json$/.test(filename))throw new Error('LAB_PENDING_FILE_INVALID');
      const hash=filename.slice(0,-5);
      let item;
      try{item=await openFile(hash);}catch(e){throw e;}
      if(item){
        if(clock()-Date.parse(item.messageTimestamp)>=maxAgeMs){
          await fs.rm(fileFor(hash));expired++;
        }else rows.push(item);
      }
    }
    if(rows.length>maxEntries)throw new Error('LAB_PENDING_CAPACITY_EXCEEDED');
    return {rows,expired};
  }
  return Object.freeze({
    async initialize(){
      if(initialized)return;
      await safeRoot();
      // Serialize key creation before accessing any encrypted payload.
      await lockOwner();
      try{
        for(const name of await fs.readdir(root)){
          // Both inbox record and key staging files are never committed state.
          if(/^[a-f0-9]{64}\.[a-f0-9-]{36}\.tmp$/.test(name)||
             /^inbox\.key\.[a-f0-9-]{36}\.tmp$/.test(name)){
            await fs.rm(path.join(root,name));
          }
        }
        key=await loadKey();
        const {rows}=await scan(); // Never silently accept corrupted encrypted input.
        initialized=true;
        return {recovered:rows.length};
      }catch(e){
        const mine=token;
        token=null;
        if(mine){
          // Another owner may have replaced this lock after a crash/restart.
          // Initialization cleanup may only delete the token we acquired.
          try{
            const owned=JSON.parse(await fs.readFile(lockFile,'utf8'));
            if(owned?.token===mine)await fs.rm(lockFile);
          }catch{}
        }
        throw e;
      }
    },
    async read(messageId){
      assertReady();
      const hash=identity(messageId);
      const item=await openFile(hash);
      if(!item)return null;
      if(clock()-Date.parse(item.messageTimestamp)>=maxAgeMs){
        await fs.rm(fileFor(hash));
        return null;
      }
      return item;
    },
    async enqueue(candidate){
      assertReady();
      const item=validate({...candidate,capturedAt:clock()});
      const hash=identity(item.messageId);
      const {rows}=await scan(); // Expire old entries and bound total disk state.
      const existing=await openFile(hash);
      if(existing){
        // Do not rewrite a quoted race scope or candidate text under a reused ID.
        const original={...existing,capturedAt:0},next={...item,capturedAt:0};
        if(JSON.stringify(original)!==JSON.stringify(next))throw new Error('LAB_PENDING_REPLAY_MISMATCH');
        return {created:false};
      }
      if(rows.length>=maxEntries)throw new Error('LAB_PENDING_CAPACITY_EXCEEDED');
      const payload=seal(item,hash);
      // A crash during write can only leave a .tmp; never a partial final
      // encrypted record. Single local owner.lock serializes all writers.
      const temp=path.join(root,hash+'.'+crypto.randomUUID()+'.tmp');
      let handle;
      try{
        handle=await fs.open(temp,'wx',0o600);
        await handle.writeFile(JSON.stringify(payload));
        await handle.sync();
        await handle.close();handle=null;
        // The final name becomes visible only after a complete, fsynced record.
        // Lock ownership plus immutable-id preflight prevent overwrite races.
        if(await openFile(hash)){
          throw new Error('LAB_PENDING_REPLAY_MISMATCH');
        }
        await fs.rename(temp,fileFor(hash));
        try{
          const dir=await fs.open(root,'r');
          try{await dir.sync();}finally{await dir.close();}
        }catch{}
        return {created:true};
      }finally{
        await handle?.close().catch(()=>{});
        await fs.rm(temp,{force:true}).catch(()=>{});
      }
    },
    async prune(){
      assertReady();
      const state=await scan();
      return state.expired;
    },
    async list(limit=25,{offset=0}={}){
      assertReady();
      if(!Number.isInteger(limit)||limit<1||limit>maxEntries||
         !Number.isInteger(offset)||offset<0||offset>=maxEntries){
        throw new Error('LAB_PENDING_LIST_LIMIT_INVALID');
      }
      const {rows}=await scan();
      rows.sort((a,b)=>a.capturedAt-b.capturedAt || a.messageId.localeCompare(b.messageId));
      if(rows.length<=limit)return rows;
      // A first batch of ambiguous/temporarily blocked queries must not
      // monopolize every poll. Rotate a bounded window without persisting
      // any sensitive cursor or changing immutable encrypted records.
      const start=offset%rows.length;
      return Array.from({length:limit},(_,i)=>rows[(start+i)%rows.length]);
    },
    async remove(id){
      assertReady();
      if(!id)return false;
      const hash=identity(id);
      const current=await openFile(hash);
      if(!current)return false;
      await fs.rm(fileFor(hash));
      return true;
    },
    async snapshot(){
      assertReady();
      const {rows}=await scan();
      // Aggregate-only status for operators. Never expose encrypted content,
      // group/sender IDs, quoted scopes or delivery authority to health output.
      const timestamp=clock();
      const ages=rows.map(item=>Math.max(0,timestamp-Date.parse(item.messageTimestamp)));
      const nearExpiryAt=maxAgeMs-Math.min(120_000,Math.floor(maxAgeMs/4));
      return {
        pending:rows.length,
        nearingExpiry:ages.filter(age=>age>=nearExpiryAt).length,
        oldestAgeSeconds:ages.length?Math.floor(Math.max(...ages)/1000):0,
        sourceWriteAllowed:false,deliveryAuthority:false
      };
    },
    async close(){
      if(!token)return;
      const mine=token;token=null;initialized=false;
      try{
        const data=JSON.parse(await fs.readFile(lockFile,'utf8'));
        if(data?.token===mine)await fs.rm(lockFile);
      }catch{}
    }
  });
}
