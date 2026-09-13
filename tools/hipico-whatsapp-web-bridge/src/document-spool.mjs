import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertPdfPayload, normalizePdfFilename } from './document-media.mjs';

function keyFor(value){return crypto.createHash('sha256').update(String(value||'')).digest('hex');}
function nowIso(){return new Date().toISOString();}
async function exists(file){try{await fs.access(file);return true;}catch{return false;}}
async function atomicJson(file,value){const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;await fs.writeFile(tmp,JSON.stringify(value,null,2),{encoding:'utf8',mode:0o600});await fs.rename(tmp,file);}
async function atomicPdf(file,bytes){const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;await fs.writeFile(tmp,bytes,{mode:0o600});await fs.rename(tmp,file);}
function backoff(attempt,base,max){return Math.min(max,base*Math.max(1,2**Math.max(0,attempt-1)));}

export function createDocumentSpool({rootDir,baseBackoffMs=5000,maxBackoffMs=15*60*1000}={}){
  if(!rootDir)throw new Error('document spool rootDir is required');
  const pending=path.join(rootDir,'pending');const quarantine=path.join(rootDir,'quarantine');
  const init=Promise.all([fs.mkdir(pending,{recursive:true,mode:0o700}),fs.mkdir(quarantine,{recursive:true,mode:0o700})]);
  const paths=(key,dir=pending)=>({meta:path.join(dir,`${key}.json`),pdf:path.join(dir,`${key}.pdf`)});

  async function quarantineKey(key,reason){
    await init;const from=paths(key),to=paths(key,quarantine);const safeReason=String(reason||'QUARANTINED').slice(0,160);
    let record=null;try{record=JSON.parse(await fs.readFile(from.meta,'utf8'));}catch{}
    if(await exists(from.pdf))await fs.rename(from.pdf,to.pdf).catch(()=>{});
    if(record)await atomicJson(to.meta,{...record,state:'quarantined',quarantinedAt:nowIso(),lastError:safeReason});
    else if(await exists(from.meta))await fs.rename(from.meta,to.meta).catch(()=>{});
    return true;
  }

  return{
    async queue(meta,pdf){
      await init;assertPdfPayload(pdf);
      const externalMessageId=String(meta?.externalMessageId||'').trim();const filename=normalizePdfFilename(meta?.filename);
      if(!externalMessageId||externalMessageId.length>300||!filename)throw Object.assign(new Error('HIPICO_BRIDGE_DOCUMENT_SPOOL_METADATA_INVALID'),{code:'HIPICO_BRIDGE_DOCUMENT_SPOOL_METADATA_INVALID'});
      const key=keyFor(externalMessageId),target=paths(key);
      if(await exists(target.meta))return{duplicate:true,key,pdfPath:target.pdf,metaPath:target.meta};
      const record={version:1,key,state:'pending',externalMessageId,filename,event:meta.event,attempts:0,nextAttemptAt:0,createdAt:nowIso(),updatedAt:nowIso(),lastError:null};
      await atomicPdf(target.pdf,pdf);
      try{await atomicJson(target.meta,record);}catch(error){await fs.rm(target.pdf,{force:true}).catch(()=>{});throw error;}
      return{duplicate:false,key,pdfPath:target.pdf,metaPath:target.meta};
    },
    async flush(deliver,{limit=20,now=Date.now()}={}){
      await init;const names=(await fs.readdir(pending)).filter(name=>name.endsWith('.json')).sort().slice(0,Math.max(1,limit));let delivered=0,retried=0,quarantined=0;
      for(const name of names){
        const key=name.slice(0,-5),target=paths(key);let record;
        try{record=JSON.parse(await fs.readFile(target.meta,'utf8'));}catch{await quarantineKey(key,'CORRUPT_METADATA');quarantined+=1;continue;}
        if(Number(record.nextAttemptAt||0)>now)continue;
        let bytes;try{bytes=await fs.readFile(target.pdf);assertPdfPayload(bytes);}catch{await quarantineKey(key,'MISSING_OR_INVALID_PDF');quarantined+=1;continue;}
        try{
          await deliver(record,bytes);
          await fs.rm(target.pdf,{force:true});await fs.rm(target.meta,{force:true});delivered+=1;
        }catch(error){
          if(error?.retryable===false){await quarantineKey(key,error?.code||error?.message||'TERMINAL_DELIVERY_ERROR');quarantined+=1;continue;}
          const attempts=Number(record.attempts||0)+1;const wait=Math.max(Number(error?.retryAfterMs||0),backoff(attempts,baseBackoffMs,maxBackoffMs));
          await atomicJson(target.meta,{...record,attempts,nextAttemptAt:now+wait,updatedAt:nowIso(),lastError:String(error?.code||error?.message||'RETRYABLE_DELIVERY_ERROR').slice(0,160)});retried+=1;
        }
      }
      return{delivered,retried,quarantined};
    },
    async snapshot(){
      await init;const[pendingNames,quarantineNames]=await Promise.all([fs.readdir(pending),fs.readdir(quarantine)]);return{pending:pendingNames.filter(name=>name.endsWith('.json')).length,quarantined:quarantineNames.filter(name=>name.endsWith('.json')).length};
    }
  };
}
