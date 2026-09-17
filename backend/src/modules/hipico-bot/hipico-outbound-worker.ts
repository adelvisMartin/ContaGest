import { sendCloudText } from './hipico-bot.service.js';
import {
  claimCanonicalOutbound,
  markCanonicalAccepted,
  markCanonicalFailed,
  markCanonicalReconciliationRequired,
  markCanonicalRetry
} from './hipico-outbox.store.js';
import { classifyOutboundFailure, retryDelayMs } from './hipico-outbox-policy.js';
import { buildObservationTrace, candidateSha, type ObservationInput } from './hipico-observability.js';
import { recordHipicoObservationSafe } from './hipico-observability.store.js';

type Observer=(event:ObservationInput)=>Promise<boolean>;
type WorkerDeps={
  claim:(input:{ownerId:string;id?:string|null;allowApprovalRequired?:boolean})=>Promise<any>;
  send:(destination:string,message:string)=>Promise<{providerMessageId:string}>;
  accepted:(input:any)=>Promise<any>;
  retry:(input:any)=>Promise<any>;
  failed:(input:any)=>Promise<any>;
  reconciliation:(input:any)=>Promise<any>;
  observe?:Observer;
};

const defaultDeps:WorkerDeps={
  claim:(input)=>claimCanonicalOutbound(input),
  send:(destination,message)=>sendCloudText(destination,message),
  accepted:markCanonicalAccepted,
  retry:markCanonicalRetry,
  failed:markCanonicalFailed,
  reconciliation:markCanonicalReconciliationRequired,
  observe:recordHipicoObservationSafe
};

function messageText(row:any){
  const payload=row?.payload;
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return'';
  return String(payload.text||'').trim();
}

function groupIdFromRow(row:any){
  const key=String(row?.group_key||row?.groupKey||'').slice(0,180);
  return key.startsWith('meta-direct:')?key.slice('meta-direct:'.length):key;
}

export async function dispatchCanonicalOutbound(input:{ownerId:string;id?:string|null;jitterUnit?:number;allowApprovalRequired?:boolean},deps:WorkerDeps=defaultDeps){
  const started=Date.now();
  const claimed=await deps.claim({ownerId:input.ownerId,id:input.id||null,allowApprovalRequired:input.allowApprovalRequired===true});
  if(!claimed)return{status:'not_claimed' as const,row:null};
  const leaseToken=String(claimed.lease_token||claimed.leaseToken||'');
  const id=String(claimed.id||'');
  const destination=String(claimed.destination||'').replace(/^\+/,'');
  const message=messageText(claimed);
  const g=String(claimed.group_key||claimed.groupKey||'').slice(0,180);
  const gid=groupIdFromRow(claimed);
  const trace=g&&gid
    ?buildObservationTrace({
      ownerId:input.ownerId,
      groupKey:g,
      groupId:gid,
      sourceRef:id,
      correlationId:String(claimed.correlation_id||claimed.correlationId||'')||undefined
    })
    :null;
  const observe=async(stage:ObservationInput['stage'],outcome:ObservationInput['outcome'],reasonCode:string,metadata:unknown={})=>
    trace&&deps.observe
      ?deps.observe({...trace,stage,outcome,reasonCode,latencyMs:Date.now()-started,candidateSha:candidateSha(),metadata})
      :false;

  if(!leaseToken||!id||!destination||!message){
    const failed=await deps.failed({ownerId:input.ownerId,id,leaseToken,error:'Canonical outbound row is incomplete.',errorCode:'HIPICO_OUTBOX_ROW_INVALID'});
    if(!failed)throw Object.assign(new Error('Could not persist invalid outbox terminal state.'),{code:'HIPICO_OUTBOX_STATE_PERSISTENCE_REQUIRED'});
    await observe('DELIVERY_RECEIPT','ERROR','HIPICO_OUTBOX_ROW_INVALID');
    return{status:'failed' as const,row:failed};
  }
  try{
    const sent=await deps.send(destination,message);
    const accepted=await deps.accepted({ownerId:input.ownerId,id,leaseToken,providerMessageId:sent.providerMessageId});
    if(!accepted)throw Object.assign(new Error('Provider accepted message but canonical acceptance receipt was not persisted.'),{code:'HIPICO_OUTBOX_ACCEPTANCE_PERSISTENCE_REQUIRED',providerMessageId:sent.providerMessageId});
    await observe('DELIVERY_RECEIPT','SUCCESS','PROVIDER_ACCEPTED',{status:'accepted'});
    return{status:'accepted' as const,row:accepted,providerMessageId:sent.providerMessageId};
  }catch(error:any){
    if(error?.code==='HIPICO_OUTBOX_ACCEPTANCE_PERSISTENCE_REQUIRED')throw error;
    const decision=classifyOutboundFailure(error);
    const common={ownerId:input.ownerId,id,leaseToken,error:error?.message||String(error),errorCode:String(error?.code||decision.reason||'').slice(0,120)};
    if(decision.action==='reconciliation_required'){
      const row=await deps.reconciliation(common);
      if(!row)throw Object.assign(new Error('Ambiguous delivery state was not persisted.'),{code:'HIPICO_OUTBOX_STATE_PERSISTENCE_REQUIRED'});
      await observe('RECONCILIATION_HANDOFF','HELD',String(common.errorCode||'AMBIGUOUS_DELIVERY'),{status:'reconciliation_required'});
      return{status:'reconciliation_required' as const,row};
    }
    const attempts=Number(claimed.attempts||0);
    const maxAttempts=Number(claimed.max_attempts??claimed.maxAttempts??4);
    if(decision.action==='retry'&&attempts<maxAttempts){
      const delay=retryDelayMs(attempts,{jitterUnit:input.jitterUnit??(Math.random()*2-1)});
      const row=await deps.retry({...common,nextAttemptAt:new Date(Date.now()+delay)});
      if(!row)throw Object.assign(new Error('Retry state was not persisted.'),{code:'HIPICO_OUTBOX_STATE_PERSISTENCE_REQUIRED'});
      await observe('DELIVERY_RECEIPT','RETRY',String(common.errorCode||'RETRY_SCHEDULED'),{attempts,maxAttempts});
      return{status:'retry' as const,row,nextAttemptAt:row.next_attempt_at||null};
    }
    const row=await deps.failed(common);
    if(!row)throw Object.assign(new Error('Failed outbound state was not persisted.'),{code:'HIPICO_OUTBOX_STATE_PERSISTENCE_REQUIRED'});
    await observe('DELIVERY_RECEIPT','ERROR',String(common.errorCode||'DELIVERY_FAILED'),{attempts,maxAttempts});
    return{status:'failed' as const,row};
  }
}

export const __test__={messageText,groupIdFromRow};
