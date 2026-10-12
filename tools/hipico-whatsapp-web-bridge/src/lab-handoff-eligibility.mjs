import { labCanonicalQueryUrl } from './lab-canonical-query.mjs';

// LAB-only read authority. No operator credentials, no arbitrary URLs and no
// fallback to "allowed" if a required authorization read fails.
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
    if(response.status!==200||
      !response.headers.get('content-type')?.toLowerCase().includes('application/json')||
      Number(response.headers.get('content-length')||0)>4096){
      return {allowed:false,reason:'LAB_HANDOFF_UNAVAILABLE'};
    }
    const raw=await response.text();
    if(raw.length>4096)return {allowed:false,reason:'LAB_HANDOFF_INVALID_RESPONSE'};
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
