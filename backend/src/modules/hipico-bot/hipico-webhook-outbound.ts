import crypto from 'node:crypto';
import { classifyIncoming, HipicoBotStore, promotion } from './hipico-bot.service.js';
import { canonicalOutboxReadiness, configuredOutboxOwnerId, enqueueCanonicalOutbound } from './hipico-outbox.store.js';

const SAFE_AUTOMATIC=new Set(['greeting','help','status_non_monetary']);

type Deps={
  classify:(message:any)=>any;
  saveEvent:(row:any,options?:{requirePersistent?:boolean})=>Promise<any>;
  promotion:()=> 'shadow'|'approved'|'automatic';
  owner:()=>string|null;
  readiness:()=>Promise<{ready:boolean}>;
  enqueue:(input:any)=>Promise<{row:any;inserted:boolean}>;
  queueShadow:(input:any)=>Promise<any>;
};

const defaultDeps:Deps={
  classify:classifyIncoming,
  saveEvent:(row,options)=>HipicoBotStore.saveEvent(row,options),
  promotion,
  owner:configuredOutboxOwnerId,
  readiness:canonicalOutboxReadiness,
  enqueue:enqueueCanonicalOutbound,
  queueShadow:(input)=>HipicoBotStore.queue(input)
};

export function automaticOutboundEligible(result:{intent?:string;autoEligible?:boolean}){
  return result?.autoEligible===true&&SAFE_AUTOMATIC.has(String(result?.intent||''));
}

function idempotencyKey(providerMessageId:string){
  return`meta-webhook:${crypto.createHash('sha256').update(String(providerMessageId||'')).digest('hex')}`;
}

export async function processIncomingCanonical(message:any,options:{requirePersistent?:boolean}={},deps:Deps=defaultDeps){
  const result=deps.classify(message);
  const event=await deps.saveEvent({...message,...result,status:'classified'},options);
  const mode=deps.promotion();

  if(mode==='shadow'){
    if(event.inserted!==false){
      await deps.queueShadow({
        eventId:event.id,
        recipient:message.sender,
        targetType:'individual',
        message:result.suggestion,
        intent:result.intent,
        risk:result.risk,
        status:'shadow'
      });
    }
    return{duplicate:event.inserted===false,event,outbox:null,dispatchRequested:false,mode,result};
  }

  const ownerId=deps.owner();
  if(!ownerId)throw Object.assign(new Error('Canonical outbox owner is not configured.'),{code:'HIPICO_OWNER_NOT_CONFIGURED'});
  const readiness=await deps.readiness();
  if(!readiness.ready)throw Object.assign(new Error('Canonical outbox persistence is required for outbound sends.'),{code:'HIPICO_OUTBOX_PERSISTENCE_REQUIRED'});

  const autoApproved=mode==='automatic'&&automaticOutboundEligible(result);
  const queued=await deps.enqueue({
    ownerId,
    groupKey:`meta-direct:${String(message.phoneNumberId||'unknown').slice(0,100)}`,
    destination:String(message.sender||'').replace(/^\+/,''),
    idempotencyKey:idempotencyKey(String(message.providerMessageId||'')),
    replyType:'bot_response',
    payload:{
      text:String(result.suggestion||'').slice(0,4000),
      intent:String(result.intent||'unknown'),
      risk:String(result.risk||'review'),
      sourceEventRef:event.id,
      sourceProviderMessageId:String(message.providerMessageId||''),
      approvalRequired:!autoApproved
    },
    provider:'meta_cloud'
  });
  const persistedStatus=String(queued.row?.status||'');
  const dispatchRequested=autoApproved&&(persistedStatus==='queued'||persistedStatus==='retry');
  return{
    duplicate:event.inserted===false&&!queued.inserted,
    event,
    outbox:queued.row,
    dispatchRequested,
    mode,
    result
  };
}

export const __test__={idempotencyKey};
