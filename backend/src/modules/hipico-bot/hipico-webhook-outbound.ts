import crypto from 'node:crypto';
import { classifyIncoming, HipicoBotStore, promotion } from './hipico-bot.service.js';
import { canonicalOutboxReadiness, configuredOutboxOwnerId, enqueueCanonicalOutbound } from './hipico-outbox.store.js';
import { buildObservationTrace, candidateSha, type ObservationInput } from './hipico-observability.js';
import { recordHipicoObservationSafe } from './hipico-observability.store.js';

const SAFE_AUTOMATIC=new Set(['greeting','help','status_non_monetary']);
type Observer=(event:ObservationInput)=>Promise<boolean>;
type Deps={classify:(message:any)=>any;saveEvent:(row:any,options?:{requirePersistent?:boolean})=>Promise<any>;promotion:()=> 'shadow'|'approved'|'automatic';owner:()=>string|null;readiness:()=>Promise<{ready:boolean}>;enqueue:(input:any)=>Promise<{row:any;inserted:boolean}>;queueShadow:(input:any)=>Promise<any>;observe?:Observer;};
const defaultDeps:Deps={classify:classifyIncoming,saveEvent:(row,options)=>HipicoBotStore.saveEvent(row,options),promotion,owner:configuredOutboxOwnerId,readiness:canonicalOutboxReadiness,enqueue:enqueueCanonicalOutbound,queueShadow:(input)=>HipicoBotStore.queue(input),observe:recordHipicoObservationSafe};

export function automaticOutboundEligible(result:{intent?:string;autoEligible?:boolean}){return result?.autoEligible===true&&SAFE_AUTOMATIC.has(String(result?.intent||''));}
function idempotencyKey(providerMessageId:string){return`meta-webhook:${crypto.createHash('sha256').update(String(providerMessageId||'')).digest('hex')}`;}

export async function processIncomingCanonical(message:any,options:{requirePersistent?:boolean}={},deps:Deps=defaultDeps){
  const started=Date.now(); const ownerId=deps.owner(); const groupId=String(message.phoneNumberId||'').slice(0,180); const g=`meta-direct:${groupId||'unknown'}`;
  const trace=ownerId&&groupId?buildObservationTrace({ownerId,groupKey:g,groupId,sourceRef:String(message.providerMessageId||'')}):null;
  const observe=async(stage:ObservationInput['stage'],outcome:ObservationInput['outcome'],reasonCode:string,metadata:unknown={})=>trace&&deps.observe?deps.observe({...trace,stage,outcome,reasonCode,latencyMs:Date.now()-started,candidateSha:candidateSha(),metadata}):false;
  await observe('INBOUND','SUCCESS','WEBHOOK_MESSAGE_ACCEPTED',{messageType:String(message.messageType||'unknown')});
  await observe('NORMALIZATION','SUCCESS','WEBHOOK_IDENTITY_NORMALIZED',{messageType:String(message.messageType||'unknown')});
  const result=deps.classify(message);
  await observe('PARSER','SUCCESS',String(result.reason||result.intent||'CLASSIFIED'),{intent:result.intent,risk:result.risk,confidence:result.confidence});
  const event=await deps.saveEvent({...message,...result,status:'classified'},options);
  await observe('PERSISTENCE',event.inserted===false?'DUPLICATE':'SUCCESS',event.inserted===false?'WEBHOOK_EVENT_REPLAY':'WEBHOOK_EVENT_PERSISTED',{intent:result.intent});
  const mode=deps.promotion();
  await observe('CONTEXT','SUCCESS','PROMOTION_CONTEXT_RESOLVED',{mode});
  if(mode==='shadow'){
    if(event.inserted!==false)await deps.queueShadow({eventId:event.id,recipient:message.sender,targetType:'individual',message:result.suggestion,intent:result.intent,risk:result.risk,status:'shadow'});
    await observe('OUTBOX',event.inserted===false?'DUPLICATE':'HELD','SHADOW_NO_EXTERNAL_DISPATCH',{mode});
    return{duplicate:event.inserted===false,event,outbox:null,dispatchRequested:false,mode,result};
  }
  if(!ownerId)throw Object.assign(new Error('Canonical outbox owner is not configured.'),{code:'HIPICO_OWNER_NOT_CONFIGURED'});
  const readiness=await deps.readiness();
  if(!readiness.ready)throw Object.assign(new Error('Canonical outbox persistence is required for outbound sends.'),{code:'HIPICO_OUTBOX_PERSISTENCE_REQUIRED'});
  const autoApproved=mode==='automatic'&&automaticOutboundEligible(result);
  const queued=await deps.enqueue({ownerId,groupKey:g,destination:String(message.sender||'').replace(/^\+/,''),idempotencyKey:idempotencyKey(String(message.providerMessageId||'')),replyType:'bot_response',payload:{text:String(result.suggestion||'').slice(0,4000),intent:String(result.intent||'unknown'),risk:String(result.risk||'review'),sourceEventRef:event.id,sourceProviderMessageId:String(message.providerMessageId||''),approvalRequired:!autoApproved},provider:'meta_cloud'});
  const persistedStatus=String(queued.row?.status||''); const dispatchRequested=autoApproved&&(persistedStatus==='queued'||persistedStatus==='retry');
  await observe('OUTBOX',queued.inserted?'SUCCESS':'DUPLICATE',autoApproved?'CANONICAL_OUTBOX_AUTO_ELIGIBLE':'CANONICAL_OUTBOX_APPROVAL_REQUIRED',{mode,status:persistedStatus,dispatchRequested,intent:result.intent,risk:result.risk});
  return{duplicate:event.inserted===false&&!queued.inserted,event,outbox:queued.row,dispatchRequested,mode,result};
}
export const __test__={idempotencyKey};
