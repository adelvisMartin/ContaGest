import type { RateCheck } from './hipico-conversation-appsec.js';

const MAX_CANONICAL_SENDER_LENGTH=220;

export function normalizeBridgeSender(senderId:string){
  const raw=String(senderId||'').trim();
  if(!raw)return null;
  const canonical=raw.replace(/@.*$/,'').trim().slice(0,MAX_CANONICAL_SENDER_LENGTH);
  if(!canonical)return null;
  if(/[\u0000-\u001F\u007F]/.test(canonical))return null;
  return canonical;
}

export function liveRateLimitClock(historySync:boolean,now:()=>number=Date.now){
  if(historySync)return null;
  const value=Number(now());
  return Number.isFinite(value)?value:Date.now();
}

export function historySyncRateCheck():RateCheck{
  return{allowed:true,reason:null,count:0,identicalCount:0,retryAfterMs:0};
}
