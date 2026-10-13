import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWriteJson } from './spool-journal.mjs';
import { normalizeGroupId } from './group-identity.mjs';
import { stableLabSenderKey } from './lab-conversation-context.mjs';

const SCHEMA_VERSION=1;
const MAX_TTL_MS=20*60*1000;
const MAX_ENTRIES=300;
const DIGEST=/^[a-f0-9]{64}$/;
const SAFE_VENUE=/^[\p{L}\p{N}][\p{L}\p{N} '-]{1,79}$/u;
function validRace(race){
  if(!race||!Number.isInteger(race.raceNumber)||race.raceNumber<1||race.raceNumber>99||
     typeof race.racetrack!=='string'||!SAFE_VENUE.test(race.racetrack)||
     typeof race.raceDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(race.raceDate))return false;
  const day=new Date(race.raceDate+'T00:00:00.000Z');
  return Number.isFinite(day.getTime())&&day.toISOString().slice(0,10)===race.raceDate;
}

/**
 * Optional, non-authoritative LAB hint journal. The encrypted-looking keys are
 * HMACs of participant+message identity; no original JIDs/IDs/chat bodies live
 * on disk. It never substitutes for backend canonical race evidence.
 */
export function createLabQuotedRaceJournal({
  file,labGroupId,sourceGroupId,now=Date.now,ttlMs=MAX_TTL_MS,maxEntries=MAX_ENTRIES
}={}){
  const lab=normalizeGroupId(labGroupId);
  const source=normalizeGroupId(sourceGroupId);
  if(!file||!lab||!source||lab===source)throw new Error('LAB_QUOTE_GROUP_PIN_REQUIRED');
  if(!Number.isInteger(ttlMs)||ttlMs<1000||ttlMs>MAX_TTL_MS||
     !Number.isInteger(maxEntries)||maxEntries<1||maxEntries>MAX_ENTRIES){
    throw new Error('LAB_QUOTE_LIMIT_INVALID');
  }
  const filename=path.resolve(file);
  const scopeHash=crypto.createHash('sha256').update('lab-quote|'+lab+'|'+source).digest('hex');
  let secret=null,entries=Object.create(null),initialized=false;
  function requireReady(){if(!initialized)throw new Error('LAB_QUOTE_NOT_INITIALIZED');}
  function validSenderMessage(messageId,sender){
    const id=String(messageId||'');
    const stable=stableLabSenderKey(id);
    return typeof messageId==='string'&&id.length>0&&id.length<=2048&&
      id.includes(lab)&&stable&&stable===sender;
  }
  function keyFor(id,sender){
    return crypto.createHmac('sha256',secret)
      .update('quote|'+lab+'|'+sender+'|'+id).digest('hex');
  }
  function keepFresh(value){
    const at=now();
    return Object.fromEntries(Object.entries(value)
      .filter(([k,v])=>DIGEST.test(k)&&Number.isSafeInteger(v?.at)&&v.at<=at&&
        at-v.at<ttlMs&&validRace(v.race))
      .sort((a,b)=>b[1].at-a[1].at||a[0].localeCompare(b[0]))
      .slice(0,maxEntries));
  }
  function validateStored(data){
    if(!data||data.schemaVersion!==SCHEMA_VERSION||data.scopeHash!==scopeHash||
       !/^[a-f0-9]{64}$/.test(data.secret||'')||
       !data.entries||typeof data.entries!=='object'||Array.isArray(data.entries)||
       Object.keys(data.entries).length>maxEntries||
       Object.entries(data.entries).some(([k,v])=>
         !DIGEST.test(k)||!Number.isSafeInteger(v?.at)||!validRace(v?.race)
       ))throw new Error('LAB_QUOTE_JOURNAL_INVALID');
    return data;
  }
  async function persist(){
    await atomicWriteJson(filename,{
      schemaVersion:SCHEMA_VERSION,scopeHash,secret,
      entries
    });
  }
  async function initialize(){
    if(initialized)return;
    let stat;
    try{stat=await fs.lstat(filename);}
    catch(error){
      if(error?.code!=='ENOENT')throw new Error('LAB_QUOTE_JOURNAL_READ_FAILED');
    }
    if(stat){
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>128*1024){
        throw new Error('LAB_QUOTE_JOURNAL_INVALID');
      }
      let raw;
      try{raw=await fs.readFile(filename,'utf8');}
      catch{throw new Error('LAB_QUOTE_JOURNAL_READ_FAILED');}
      let parsed;
      try{parsed=validateStored(JSON.parse(raw));}
      catch{throw new Error('LAB_QUOTE_JOURNAL_INVALID');}
      secret=parsed.secret;
      entries=keepFresh(parsed.entries);
    }else{
      secret=crypto.randomBytes(32).toString('hex');
      entries=Object.create(null);
      await persist();
    }
    initialized=true;
  }
  async function remember({messageId,senderId,race,confirmed=false}={}){
    requireReady();
    if(confirmed!==true)throw new Error('LAB_QUOTE_CONFIRMED_ACK_REQUIRED');
    if(!validSenderMessage(messageId,senderId)||!validRace(race)){
      throw new Error('LAB_QUOTE_INPUT_INVALID');
    }
    const key=keyFor(messageId,senderId);
    entries=keepFresh({...entries,[key]:{
      at:now(),race:{
        raceNumber:race.raceNumber,racetrack:race.racetrack,raceDate:race.raceDate
      }
    }});
    await persist();
  }
  function lookup({quotedMessageId,senderId,currentMessageId}={}){
    requireReady();
    const currentSender=stableLabSenderKey(currentMessageId);
    if(!currentSender||currentSender!==senderId||
       !validSenderMessage(currentMessageId,senderId)||
       !validSenderMessage(quotedMessageId,senderId)||
       quotedMessageId===currentMessageId)return null;
    const entry=entries[keyFor(quotedMessageId,senderId)];
    if(!entry||!validRace(entry.race)||entry.at>now()||
       now()-entry.at>=ttlMs)return null;
    return{...entry.race};
  }
  function snapshot(){
    requireReady();
    return{count:Object.keys(keepFresh(entries)).length,mode:'LAB_HINTS_ONLY'};
  }
  return Object.freeze({initialize,remember,lookup,snapshot});
}
