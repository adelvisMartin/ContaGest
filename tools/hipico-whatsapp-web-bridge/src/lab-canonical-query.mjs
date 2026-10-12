// Query-only LAB transport: exactly the existing bridge origin and service credential.
// Never used for SOURCE writes; it cannot create an outbox or accept arbitrary URLs.
export function labCanonicalQueryUrl(ingestUrl){
  try{
    const url=new URL(String(ingestUrl||''));
    const local=url.hostname==='localhost'||url.hostname==='127.0.0.1'||url.hostname==='[::1]';
    if(!(url.protocol==='https:'||(url.protocol==='http:'&&local))||
       url.username||url.password||url.search||url.hash||
       !url.pathname.endsWith('/bridge/events'))return null;
    url.pathname=url.pathname.slice(0,-'/bridge/events'.length)+'/bridge/lab/query';
    return url.toString();
  }catch{return null;}
}

export function explicitLabRaceScope(text){
  const raw=String(text||'');
  const match=raw.match(/\bcarrera\s*(?:n(?:[úu]mero|ro)?\.?\s*)?(\d{1,3})\s+en\s+(?:(?:el\s+)?hip[oó]dromo\s+)?([\p{L}0-9 ]{2,90}?)\s+(?:el|fecha)\s+(\d{4}-\d{2}-\d{2})\b/iu);
  if(!match)return null;
  const raceNumber=Number(match[1]);
  const racetrack=match[2].trim().replace(/\s+/g,' ');
  if(raceNumber<1||raceNumber>999||!racetrack||!Number.isInteger(raceNumber))return null;
  // Invalid calendar dates are rejected again at the canonical backend boundary.
  return{raceNumber,racetrack,raceDate:match[3]};
}

export async function queryCanonicalLab({
  ingestUrl,token,labGroupId,labChannelKey,messageId,senderId,text,
  timestamp=new Date().toISOString(),race=null,timeoutMs=4500,fetchImpl=fetch
}={}){
  const url=labCanonicalQueryUrl(ingestUrl);
  if(!url||!token||!labGroupId||!labChannelKey||!senderId||!messageId){
    return{available:false,reason:'LAB_CANONICAL_DISABLED'};
  }
  const payload={
    externalMessageId:String(messageId).slice(0,320),
    groupId:labGroupId,channelRole:'lab',channelKey:labChannelKey,
    labChannelKey,shadowMode:true,senderId,
    timestamp,text:String(text||'').slice(0,1200),race
  };
  try{
    const response=await fetchImpl(url,{
      method:'POST',redirect:'manual',cache:'no-store',
      headers:{'Content-Type':'application/json','x-hipico-bridge-token':token},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(Math.min(5000,Math.max(500,timeoutMs)))
    });
    if(response.status!==200||!response.headers.get('content-type')?.toLowerCase().includes('application/json')){
      return{available:false,reason:'LAB_CANONICAL_UNAVAILABLE'};
    }
    const length=Number(response.headers.get('content-length')||0);
    if(length>16_384)return{available:false,reason:'LAB_CANONICAL_INVALID_RESPONSE'};
    const raw=await response.text();
    if(raw.length>16_384)return{available:false,reason:'LAB_CANONICAL_INVALID_RESPONSE'};
    const body=JSON.parse(raw);
    const authority=body?.authority;
    if(body?.ok!==true||body?.mode!=='shadow'||
       authority?.sourceWriteAllowed!==false||
       authority?.financialAuthority!==false||
       authority?.domainEffectsAllowed!==false||
       typeof body.text!=='string'||body.text.length>1500||
       !/^[A-Z0-9_]{4,80}$/.test(String(body.status||''))){
      return{available:false,reason:'LAB_CANONICAL_INVALID_RESPONSE'};
    }
    return{available:true,reason:String(body.status),text:body.text};
  }catch{
    return{available:false,reason:'LAB_CANONICAL_UNAVAILABLE'};
  }
}
