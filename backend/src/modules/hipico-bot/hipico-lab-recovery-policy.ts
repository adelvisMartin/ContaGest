import crypto from 'node:crypto';
import { CONVERSATION_POLICY_VERSION } from './hipico-conversation-engine.js';
import { RESPONSE_POLICY_VERSION, type SafeResponsePlan } from './hipico-response-safety.js';
import type { IntentResult } from './hipico-operational-classifier.js';

export const LAB_REPLY_REPLAY_POLICY = `${CONVERSATION_POLICY_VERSION}|${RESPONSE_POLICY_VERSION}|lab-replay-v1`;
export const LAB_REPLY_REPLAY_TTL_MS = 90_000;
export type LabReplayKind = 'race_query' | 'static_safe';
export type LabReplayScope = {
  channelRole:'source'|'lab';
  channelId:string;
  groupId:string;
  groupKey:string;
  sender:string;
  sourceMessageId:string;
  sentAt:string;
  messageText:string;
  fromMe:boolean;
  historySync:boolean;
  mediaKind:string;
  forceReview:boolean;
  rateAllowed:boolean;
  systemHealthy:boolean;
  humanOwned:boolean;
  classification:IntentResult;
};
export type ReplayCandidate = {kind:LabReplayKind; text:string; readDigest:string|null; policy:string; fingerprint:string};

export function labReplayFingerprint(input:LabReplayScope):string {
  return crypto.createHash('sha256').update(JSON.stringify([
    'lab',input.channelId,input.groupId,input.groupKey,input.sender,
    input.sourceMessageId,input.sentAt,crypto.createHash('sha256').update(input.messageText).digest('hex')
  ])).digest('hex');
}
export function labReplayEligible(input:LabReplayScope):boolean {
  return input.channelRole==='lab' && Boolean(input.channelId && input.groupId && input.groupKey && input.sender && input.sourceMessageId)
    && !input.fromMe && !input.historySync && input.mediaKind==='none'
    && !input.forceReview && input.rateAllowed && input.systemHealthy && !input.humanOwned;
}
export function labReplayCandidate(input:LabReplayScope,plan:SafeResponsePlan & {readModelDigest?:string|null}):ReplayCandidate|null {
  if(!labReplayEligible(input) || !plan.canSend || plan.handoffRequired || plan.confirmationVerified || plan.evidence
    || plan.intent==='NONE' || plan.intent==='CONFIRMED' || plan.intent==='SYSTEM_DEGRADED'
    || plan.sourceMessageId!==input.sourceMessageId || !plan.text
    || plan.text.length>3000 || !plan.responseIdempotencyKey) return null;
  let kind:LabReplayKind;
  let readDigest:string|null=null;
  if(plan.reason==='CANONICAL_LAB_RACE_QUERY' && ['safe','review'].includes(input.classification.risk)
    && ['conversation','status_non_monetary'].includes(input.classification.intent)){
    readDigest=String(plan.readModelDigest||'');
    if(!/^[0-9a-f]{64}$/.test(readDigest))return null;
    kind='race_query';
  }else if(input.classification.risk==='safe' && ['greeting','help'].includes(input.classification.intent)
    && plan.intent==='ACK_RECEIVED'){
    kind='static_safe';
  }else return null;
  return{kind,text:plan.text,readDigest,policy:LAB_REPLY_REPLAY_POLICY,fingerprint:labReplayFingerprint(input)};
}

export function labReplaySnapshotValid(snapshot:{
  scopeHash:string;policy:string;kind:string;text:string;readDigest:string|null;expiresAt:Date|string;responseHash:string|null
},input:LabReplayScope,now=Date.now()):boolean {
  if(!labReplayEligible(input) || snapshot.scopeHash!==labReplayFingerprint(input)
    || snapshot.policy!==LAB_REPLY_REPLAY_POLICY || !['race_query','static_safe'].includes(snapshot.kind)
    || !snapshot.text || snapshot.text.length>3000) return false;
  if(snapshot.kind==='static_safe' && !(input.classification.risk==='safe' &&
    ['greeting','help'].includes(input.classification.intent)))return false;
  if(snapshot.kind==='race_query' && !(['safe','review'].includes(input.classification.risk) &&
    ['conversation','status_non_monetary'].includes(input.classification.intent) &&
    /^[0-9a-f]{64}$/.test(String(snapshot.readDigest||''))))return false;
  const expiry=new Date(snapshot.expiresAt).getTime();
  if(!Number.isFinite(expiry) || expiry<=now || expiry>now+LAB_REPLY_REPLAY_TTL_MS)return false;
  return crypto.createHash('sha256').update(snapshot.text).digest('hex')===snapshot.responseHash;
}
