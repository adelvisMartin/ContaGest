import { sendCloudText } from './hipico-bot.service.js';
import {
  claimCanonicalOutbound,
  markCanonicalAccepted,
  markCanonicalFailed,
  markCanonicalReconciliationRequired,
  markCanonicalRetry
} from './hipico-outbox.store.js';
import { classifyOutboundFailure, retryDelayMs } from './hipico-outbox-policy.js';

type WorkerDeps={
  claim:(input:{ownerId:string;id?:string|null})=>Promise<any>;
  send:(destination:string,message:string)=>Promise<{providerMessageId:string}>;
  accepted:(input:any)=>Promise<any>;
  retry:(input:any)=>Promise<any>;
  failed:(input:any)=>Promise<any>;
  reconciliation:(input:any)=>Promise<any>;
};

const defaultDeps:WorkerDeps={
  claim:(input)=>claimCanonicalOutbound(input),
  send:(destination,message)=>sendCloudText(destination,message),
  accepted:markCanonicalAccepted,
  retry:markCanonicalRetry,
  failed:markCanonicalFailed,
  reconciliation:markCanonicalReconciliationRequired
};

function messageText(row:any){
  const payload=row?.payload;
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return'';
  return String(payload.text||'').trim();
}

export async function dispatchCanonicalOutbound(input:{ownerId:string;id?:string|null;jitterUnit?:number},deps:WorkerDeps=defaultDeps){
  const claimed=await deps.claim({ownerId:input.ownerId,id:input.id||null});
  if(!claimed)return{status:'not_claimed' as const,row:null};
  const leaseToken=String(claimed.lease_token||claimed.leaseToken||'');
  const id=String(claimed.id||'');
  const destination=String(claimed.destination||'').replace(/^\+/,'');
  const message=messageText(claimed);
  if(!leaseToken||!id||!destination||!message){
    const failed=await deps.failed({
      ownerId:input.ownerId,id,leaseToken,error:'Canonical outbound row is incomplete.',errorCode:'HIPICO_OUTBOX_ROW_INVALID'
    });
    if(!failed)throw Object.assign(new Error('Could not persist invalid outbox terminal state.'),{code:'HIPICO_OUTBOX_STATE_PERSISTENCE_REQUIRED'});
    return{status:'failed' as const,row:failed};
  }
  try{
    const sent=await deps.send(destination,message);
    const accepted=await deps.accepted({ownerId:input.ownerId,id,leaseToken,providerMessageId:sent.providerMessageId});
    if(!accepted){
      throw Object.assign(new Error('Provider accepted message but canonical acceptance receipt was not persisted.'),{
        code:'HIPICO_OUTBOX_ACCEPTANCE_PERSISTENCE_REQUIRED',providerMessageId:sent.providerMessageId
      });
    }
    return{status:'accepted' as const,row:accepted,providerMessageId:sent.providerMessageId};
  }catch(error:any){
    if(error?.code==='HIPICO_OUTBOX_ACCEPTANCE_PERSISTENCE_REQUIRED')throw error;
    const decision=classifyOutboundFailure(error);
    const common={ownerId:input.ownerId,id,leaseToken,error:error?.message||String(error),errorCode:String(error?.code||decision.reason||'').slice(0,120)};
    if(decision.action==='reconciliation_required'){
      const row=await deps.reconciliation(common);
      if(!row)throw Object.assign(new Error('Ambiguous delivery state was not persisted.'),{code:'HIPICO_OUTBOX_STATE_PERSISTENCE_REQUIRED'});
      return{status:'reconciliation_required' as const,row};
    }
    const attempts=Number(claimed.attempts||0);
    const maxAttempts=Number(claimed.max_attempts??claimed.maxAttempts??4);
    if(decision.action==='retry'&&attempts<maxAttempts){
      const delay=retryDelayMs(attempts,{jitterUnit:input.jitterUnit??(Math.random()*2-1)});
      const row=await deps.retry({...common,nextAttemptAt:new Date(Date.now()+delay)});
      if(!row)throw Object.assign(new Error('Retry state was not persisted.'),{code:'HIPICO_OUTBOX_STATE_PERSISTENCE_REQUIRED'});
      return{status:'retry' as const,row,nextAttemptAt:row.next_attempt_at||null};
    }
    const row=await deps.failed(common);
    if(!row)throw Object.assign(new Error('Failed outbound state was not persisted.'),{code:'HIPICO_OUTBOX_STATE_PERSISTENCE_REQUIRED'});
    return{status:'failed' as const,row};
  }
}

export const __test__={messageText};
