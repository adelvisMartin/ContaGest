import { labCanonicalQueryUrl } from './lab-canonical-query.mjs';

// LAB-only read authority. No operator credentials, no arbitrary URLs and no
// fallback to "allowed" if a required authorization read fails.

const MAX_LAB_HANDOFF_BYTES=4096;

// Read authority is security critical: enforce the cap on decompressed UTF-8
// bytes *during* streaming, not after fetch.text() buffers an entire response.
async function readBoundedLabHandoffBody(response){
  if(typeof response.body?.getReader==='function'){
    const reader=response.body.getReader();
    const decoder=new TextDecoder('utf-8',{fatal:true});
    let bytes=0,raw='',complete=false;
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done){complete=true;break;}
        if(!(value instanceof Uint8Array))return null;
        bytes+=value.byteLength;
        if(bytes>MAX_LAB_HANDOFF_BYTES)return null;
        try{raw+=decoder.decode(value,{stream:true});}catch{return null;}
      }
      try{return raw+decoder.decode();}catch{return null;}
    }finally{
      if(!complete)void reader.cancel().catch(()=>{});
      try{reader.releaseLock();}catch{}
    }
  }
  // Test adapters and older polyfills may not expose a body reader.
  const raw=await response.text();
  return new TextEncoder().encode(raw).byteLength<=MAX_LAB_HANDOFF_BYTES?raw:null;
}

export function labHandoffEligibilityUrl(ingestUrl) {
  const canonical=labCanonicalQueryUrl(ingestUrl);
  if(!canonical)return null;
  const url=new URL(canonical);
  if(!url.pathname.endsWith('/bridge/lab/query'))return null;
  url.pathname=url.pathname.slice(0,-'/query'.length)+'/eligibility';
  return url.toString();
}

export async function checkLabSendEligibility({
  ingestUrl,token,labGroupId,labChannelKey,messageId,senderId,race=null,
  timeoutMs=4500,fetchImpl=fetch
}={}) {
  const url=labHandoffEligibilityUrl(ingestUrl);
  if(!url||!token||!labGroupId||!labChannelKey||!messageId||!senderId){
    return {allowed:false,reason:'LAB_HANDOFF_DISABLED'};
  }
  const body={
    externalMessageId:String(messageId).slice(0,320),
    groupId:labGroupId,channelRole:'lab',channelKey:labChannelKey,
    labChannelKey,shadowMode:true,senderId,race
  };
  try{
    const response=await fetchImpl(url,{
      method:'POST',redirect:'manual',cache:'no-store',
      headers:{'Content-Type':'application/json','x-hipico-bridge-token':token},
      body:JSON.stringify(body),
      signal:AbortSignal.timeout(Math.min(5000,Math.max(500,timeoutMs)))
    });
    const mediaType=response.headers.get('content-type')?.split(';',1)[0]?.trim().toLowerCase();
    if(response.status!==200||mediaType!=='application/json'){
      return {allowed:false,reason:'LAB_HANDOFF_UNAVAILABLE'};
    }
    const lengthHeader=response.headers.get('content-length');
    if(lengthHeader!==null&&(!/^\d+$/.test(lengthHeader)||
      !Number.isSafeInteger(Number(lengthHeader))||
      Number(lengthHeader)>MAX_LAB_HANDOFF_BYTES)){
      return {allowed:false,reason:'LAB_HANDOFF_INVALID_RESPONSE'};
    }
    const raw=await readBoundedLabHandoffBody(response);
    if(raw===null)return {allowed:false,reason:'LAB_HANDOFF_INVALID_RESPONSE'};
    const data=JSON.parse(raw);
    if(data?.ok!==true||data?.mode!=='shadow'||
      data?.authority?.sourceWriteAllowed!==false||
      data?.authority?.financialAuthority!==false||
      data?.authority?.domainEffectsAllowed!==false){
      return {allowed:false,reason:'LAB_HANDOFF_INVALID_RESPONSE'};
    }
    if(data.allowed===true&&data.status==='LAB_HANDOFF_CLEAR'){
      return {allowed:true,reason:'LAB_HANDOFF_CLEAR'};
    }
    if(data.allowed===false&&
      ['LAB_HANDOFF_HELD','LAB_HANDOFF_SCOPE_INVALID'].includes(data.status)){
      return {allowed:false,reason:'LAB_HANDOFF_HELD'};
    }
    return {allowed:false,reason:'LAB_HANDOFF_INVALID_RESPONSE'};
  }catch{
    return {allowed:false,reason:'LAB_HANDOFF_UNAVAILABLE'};
  }
}
