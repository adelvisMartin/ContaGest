import crypto from 'node:crypto';

export type CanonicalOutboxStatus=
  |'queued'|'sending'|'accepted'|'sent'|'delivered'|'read'|'retry'
  |'cancelled'|'failed'|'reconciliation_required';

export type OutboundFailureAction='retry'|'failed'|'reconciliation_required';

function stableValue(value:unknown):unknown{
  if(Array.isArray(value))return value.map(stableValue);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.entries(value as Record<string,unknown>)
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([key,item])=>[key,stableValue(item)]));
  }
  return value;
}

export function outboundPayloadDigest(input:{ownerId:string;groupKey:string;destination:string;replyType:string;payload:unknown;}){
  const canonical=stableValue({
    ownerId:String(input.ownerId||'').trim().toLowerCase(),
    groupKey:String(input.groupKey||'').trim(),
    destination:String(input.destination||'').trim().replace(/^\+/,''),
    replyType:String(input.replyType||'operational').trim(),
    payload:stableValue(input.payload)
  });
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function retryDelayMs(attempt:number,options:{baseMs?:number;maxMs?:number;jitterRatio?:number;jitterUnit?:number;}={}){
  const baseMs=Math.max(1,Math.trunc(options.baseMs??1000));
  const maxMs=Math.max(baseMs,Math.trunc(options.maxMs??60_000));
  const jitterRatio=Math.min(1,Math.max(0,Number(options.jitterRatio??0.2)));
  const jitterUnit=Math.min(1,Math.max(-1,Number(options.jitterUnit??0)));
  const exponent=Math.max(0,Math.trunc(attempt)-1);
  const raw=Math.min(maxMs,baseMs*(2**Math.min(exponent,30)));
  return Math.max(1,Math.min(maxMs,Math.round(raw+(raw*jitterRatio*jitterUnit))));
}

export function classifyOutboundFailure(error:any):{action:OutboundFailureAction;reason:string}{
  const code=String(error?.code||'UNKNOWN');
  const status=Number(error?.providerStatus??error?.status??error?.responseStatus);
  const ambiguousCodes=new Set([
    'HIPICO_CLOUD_DELIVERY_AMBIGUOUS',
    'HIPICO_CLOUD_SEND_TIMEOUT',
    'HIPICO_CLOUD_NETWORK_ERROR',
    'HIPICO_CLOUD_UPSTREAM_RETRYABLE'
  ]);
  if(ambiguousCodes.has(code)||status===408||(Number.isFinite(status)&&status>=500)){
    return{action:'reconciliation_required',reason:code||`HTTP_${status}`};
  }
  if(code==='HIPICO_CLOUD_RATE_LIMITED'||(code==='HIPICO_CLOUD_HTTP_ERROR'&&status===429)){
    return{action:'retry',reason:'HTTP_429'};
  }
  return{action:'failed',reason:code};
}

function time(value:unknown){
  if(value==null||value==='')return null;
  const ms=new Date(String(value)).getTime();
  return Number.isFinite(ms)?ms:null;
}

export function canAutoClaim(row:{status:string;attempts:number;maxAttempts:number;nextAttemptAt?:unknown;cooldownUntil?:unknown;leasedUntil?:unknown;},now=new Date()){
  if(row.status!=='queued'&&row.status!=='retry')return false;
  if(Number(row.attempts)>=Number(row.maxAttempts))return false;
  const nowMs=now.getTime();
  const next=time(row.nextAttemptAt);const cooldown=time(row.cooldownUntil);const lease=time(row.leasedUntil);
  if(next!=null&&next>nowMs)return false;
  if(cooldown!=null&&cooldown>nowMs)return false;
  if(lease!=null&&lease>nowMs)return false;
  return true;
}

const DELIVERY_RANK:Record<string,number>={accepted:1,sent:2,delivered:3,read:4};

export function monotonicReceiptStatus(current:string,incoming:'sent'|'delivered'|'read'|'failed'):CanonicalOutboxStatus{
  if(incoming==='failed'){
    if((DELIVERY_RANK[current]||0)>=2)return current as CanonicalOutboxStatus;
    return'failed';
  }
  const currentRank=DELIVERY_RANK[current]||0;const incomingRank=DELIVERY_RANK[incoming]||0;
  return(incomingRank>currentRank?incoming:current) as CanonicalOutboxStatus;
}

export const __test__={stableValue};
