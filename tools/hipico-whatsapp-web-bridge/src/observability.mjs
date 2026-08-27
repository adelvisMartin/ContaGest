import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const SECRET_KEYS=/token|secret|cookie|authorization|qr|session|password|signed.?url/i;
const PHONE=/\+?\d[\d\s().-]{7,}\d/g;
const JID=/\d{5,}-\d+@g\.us/gi;

export function correlationId(prefix='hipico'){return`${prefix}-${crypto.randomUUID()}`;}
export function redactDiagnostic(value,key=''){
  if(SECRET_KEYS.test(key))return'[REDACTED]';
  if(Array.isArray(value))return value.map((item)=>redactDiagnostic(item));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redactDiagnostic(v,k)]));
  if(typeof value==='string')return value.replace(JID,'[GROUP_ID]').replace(PHONE,'[PHONE]');
  return value;
}
export function structuredLog({level='info',component='bridge',version='unknown',sha='unknown',correlationId:cid,event,message,data={}}){
  return JSON.stringify(redactDiagnostic({ts:new Date().toISOString(),level,component,version,sha,correlationId:cid||correlationId(),event,message,data}));
}
export function sha256Text(text){return crypto.createHash('sha256').update(text).digest('hex');}

const ALLOWLIST=['health.json','retry-state.json','dom-diagnostic.json'];
export async function buildSupportBundle({dataDir,outDir,version='unknown',sha='unknown',includeLogTail=true,maxLogBytes=65536}){
  await fs.mkdir(outDir,{recursive:true});
  const files=[];
  for(const name of ALLOWLIST){
    try{
      const raw=await fs.readFile(path.join(dataDir,name),'utf8');
      const parsed=JSON.parse(raw);const safe=JSON.stringify(redactDiagnostic(parsed),null,2);
      const target=path.join(outDir,name);await fs.writeFile(target,safe,'utf8');files.push({name,bytes:Buffer.byteLength(safe),sha256:sha256Text(safe)});
    }catch{}
  }
  if(includeLogTail){
    try{
      const raw=await fs.readFile(path.join(dataDir,'bridge.log'),'utf8');
      const tail=raw.slice(-maxLogBytes);const safe=String(redactDiagnostic(tail));
      const name='bridge-tail.log';await fs.writeFile(path.join(outDir,name),safe,'utf8');files.push({name,bytes:Buffer.byteLength(safe),sha256:sha256Text(safe)});
    }catch{}
  }
  const manifest={schemaVersion:1,createdAt:new Date().toISOString(),component:'hipico-whatsapp-web-bridge',version,sha,allowlist:[...ALLOWLIST,'bridge-tail.log'],files};
  const text=JSON.stringify(manifest,null,2);await fs.writeFile(path.join(outDir,'manifest.json'),text,'utf8');
  return{...manifest,manifestSha256:sha256Text(text)};
}
