import { ParticipantRateLimiter, type RateCheck } from './hipico-conversation-appsec.js';

const MAX_CANONICAL_SENDER_LENGTH=220;
const GROUP_ID_RE=/^(?:\d{5,}-\d+|\d{10,})@g\.us$/i;
const CHANNEL_KEY_RE=/^[A-Za-z0-9_-]{3,120}$/;
const DEFAULT_SOURCE_CHANNEL_KEY='club-hipico-triple-crown-official';
const DEFAULT_LAB_CHANNEL_KEY='control-hipico-lab';
export const HISTORY_MAX_MESSAGES_PER_MINUTE=300;
export const HISTORY_MAX_IDENTICAL_PER_MINUTE=25;
export const historySyncRateLimiter=new ParticipantRateLimiter(HISTORY_MAX_MESSAGES_PER_MINUTE,HISTORY_MAX_IDENTICAL_PER_MINUTE);

type RuntimeEnv=Record<string,string|undefined>;
export type BridgeIdentityPayload={groupId?:unknown;channelRole?:unknown;channelKey?:unknown;labChannelKey?:unknown};

export function normalizeBridgeGroupId(value:unknown){
  const groupId=String(value||'').trim().toLowerCase();
  return GROUP_ID_RE.test(groupId)?groupId:'';
}

export function bridgeIdentityConfig(env:RuntimeEnv=process.env){
  const sourceGroupId=normalizeBridgeGroupId(env.HIPICO_SOURCE_GROUP_ID);
  const labGroupId=normalizeBridgeGroupId(env.HIPICO_LAB_GROUP_ID);
  const sourceChannelKey=String(env.HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY||env.HIPICO_SOURCE_CHANNEL_KEY||DEFAULT_SOURCE_CHANNEL_KEY).trim();
  const labChannelKey=String(env.HIPICO_LAB_CHANNEL_KEY||DEFAULT_LAB_CHANNEL_KEY).trim();
  const ready=Boolean(
    sourceGroupId&&labGroupId&&sourceGroupId!==labGroupId&&
    CHANNEL_KEY_RE.test(sourceChannelKey)&&CHANNEL_KEY_RE.test(labChannelKey)&&sourceChannelKey!==labChannelKey
  );
  return{ready,sourceGroupId,labGroupId,sourceChannelKey,labChannelKey};
}

export function bridgeGroupIdentityReady(env:RuntimeEnv=process.env){
  return bridgeIdentityConfig(env).ready;
}

export function validateBridgeGroupIdentity(payload:BridgeIdentityPayload,env:RuntimeEnv=process.env){
  const config=bridgeIdentityConfig(env);
  if(!config.ready)return 'HIPICO_BRIDGE_GROUP_IDENTITY_NOT_CONFIGURED';
  const groupId=normalizeBridgeGroupId(payload.groupId);
  const role=String(payload.channelRole||'');
  const channelKey=String(payload.channelKey||'').trim();
  const labChannelKey=String(payload.labChannelKey||'').trim();
  const valid=role==='source'
    ? groupId===config.sourceGroupId&&channelKey===config.sourceChannelKey&&labChannelKey===config.labChannelKey
    : role==='lab'
      ? groupId===config.labGroupId&&channelKey===config.labChannelKey&&(!labChannelKey||labChannelKey===config.labChannelKey)
      : false;
  return valid?null:'HIPICO_BRIDGE_GROUP_IDENTITY_MISMATCH';
}

export function assertBridgeGroupIdentity(payload:BridgeIdentityPayload,env:RuntimeEnv=process.env){
  const error=validateBridgeGroupIdentity(payload,env);
  if(!error)return true;
  const code=error==='HIPICO_BRIDGE_GROUP_IDENTITY_NOT_CONFIGURED'?error:'HIPICO_TRANSPORT_REPLAY_MISMATCH';
  throw Object.assign(new Error(code),{code});
}

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
