import { ParticipantRateLimiter, type RateCheck } from './hipico-conversation-appsec.js';

const MAX_CANONICAL_SENDER_LENGTH=220;
export const HISTORY_MAX_MESSAGES_PER_MINUTE=300;
export const HISTORY_MAX_IDENTICAL_PER_MINUTE=25;
export const historySyncRateLimiter=new ParticipantRateLimiter(HISTORY_MAX_MESSAGES_PER_MINUTE,HISTORY_MAX_IDENTICAL_PER_MINUTE);

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

export function historySyncRateCheck(actorKey:string,digest:string,at=Date.now()):RateCheck{
  return historySyncRateLimiter.check(`history:${String(actorKey||'unknown')}`,String(digest||''),at);
}
