import crypto from 'node:crypto';
import type { SafeResponsePlan } from './hipico-response-safety.js';
import type { StoredResponseReceipt } from './hipico-handoff.store.js';
import { persistResponsePlan, readResponseReceiptForRecovery } from './hipico-handoff.store.js';

const POLICY='hipico-lab-canonical-receipt-v1';
export const LAB_CANONICAL_RECOVERY_WINDOW_MS=90_000;
const sha=(input:string)=>crypto.createHash('sha256').update(input).digest('hex');
const AUTHORITY={sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false,officiality:'NOT_EXTERNALLY_VERIFIED'} as const;

type CanonicalRead={
  available:boolean;reason:string;text:string;
  state?:unknown;version?:unknown;updatedAt?:unknown;revisionToken?:unknown
};
type ReceiptStore={
  read:(key:string)=>Promise<StoredResponseReceipt|null>;
  persist:(plan:SafeResponsePlan)=>Promise<{id:string;idempotencyKey:string;duplicate:boolean}>;
};
const STORE:ReceiptStore={
  read:readResponseReceiptForRecovery,persist:persistResponsePlan
};

function unavailable(reason:string,text:string){
  return{available:false,reason,text,authority:AUTHORITY};
}
function validCanonical(read:CanonicalRead){
  const v=Number(read.version);
  const date=typeof read.updatedAt==='string'?Date.parse(read.updatedAt):NaN;
  return read.available===true&&
    ['CANONICAL_STATE_FOUND','CANONICAL_RESULT_CONFIRMED_INTERNAL',
     'CANONICAL_NEXT_RACE','CANONICAL_ACTIVE_RACE','CANONICAL_SCHEDULE_FOUND'].includes(read.reason)&&
    typeof read.text==='string'&&read.text.length>0&&read.text.length<=1500&&
    typeof read.state==='string'&&/^[A-Z_]{3,40}$/.test(read.state)&&
    Number.isSafeInteger(v)&&v>=1&&v<=Number.MAX_SAFE_INTEGER&&
    Number.isFinite(date)&&new Date(date).toISOString()===read.updatedAt;
}

/**
 * Durable read-only LAB response: the existing receipt table stores just
 * identity, response hash and canonical revision fingerprint, not answer text.
 * A lost HTTP response is recoverable ONLY when a fresh read is byte-for-byte
 * identical to that receipt under the same owner/group/message and policy.
 */
export async function reconcileCanonicalLabReceipt(input:{
  ownerId:string;sourceGroupKey:string;labGroupId:string;labChannelKey:string;
  senderId:string;externalMessageId:string;purpose:'status'|'result'|'next'|'active'|'schedule';
  canonical:CanonicalRead;timestamp:string;nowMs:number;humanOwned:boolean;
},store:ReceiptStore=STORE){
  if(!validCanonical(input.canonical)||
     (input.purpose==='status'&&input.canonical.reason!=='CANONICAL_STATE_FOUND')||
     (input.purpose==='result'&&input.canonical.reason!=='CANONICAL_RESULT_CONFIRMED_INTERNAL')||
     (input.purpose==='next'&&input.canonical.reason!=='CANONICAL_NEXT_RACE')||
     (input.purpose==='active'&&input.canonical.reason!=='CANONICAL_ACTIVE_RACE')||
     (input.purpose==='schedule'&&input.canonical.reason!=='CANONICAL_SCHEDULE_FOUND')||
     (['next','active','schedule'].includes(input.purpose)&&
       (typeof input.canonical.revisionToken!=='string'||
         !/^[a-f0-9]{64}$/.test(input.canonical.revisionToken)||
         input.canonical.state!==input.purpose.toUpperCase()+'_SNAPSHOT'))){
    return unavailable('LAB_CANONICAL_RECEIPT_NOT_VERIFIABLE',
      'La información canónica no contiene versión y evidencia suficientes para una respuesta recuperable.');
  }
  if(input.humanOwned){
    return unavailable('LAB_CANONICAL_HUMAN_HANDOFF',
      'La conversación está bajo revisión de un operador; no se generó una respuesta automática.');
  }
  const age=input.nowMs-Date.parse(input.timestamp);
  if(!Number.isFinite(age)||age<0||age>LAB_CANONICAL_RECOVERY_WINDOW_MS){
    return unavailable('LAB_CANONICAL_REQUEST_STALE',
      'La consulta ya no es reciente. Vuelve a enviarla para recibir un estado actualizado.');
  }
  const identity=sha([
    POLICY,input.ownerId,input.sourceGroupKey,input.labGroupId,input.labChannelKey,
    input.senderId,input.externalMessageId
  ].join('\0'));
  const key='resp_'+identity.slice(0,32);
  const projection=input.canonical;
  const version=sha([
    POLICY,input.purpose,String(projection.state),String(projection.version),
    String(projection.updatedAt),projection.reason,
    // Legacy state/result receipts retain their pre-existing fingerprint.
    ...(['next','active','schedule'].includes(input.purpose)
      ?[String(projection.revisionToken)]:[])
  ].join('\0'));
  const plan:SafeResponsePlan={
    intent:'ACK_RECEIVED',text:projection.text,canSend:true,
    confirmationVerified:false,evidence:null,handoffRequired:false,
    responseIdempotencyKey:key,
    decisionVersion:'lab-canonical-v1-'+version.slice(0,48),
    correlationId:'labcq_'+identity.slice(0,24),
    sourceMessageId:'labq_'+identity.slice(0,32),
    reason:'LAB_CANONICAL_RECEIPT'
  };
  const existing=await store.read(key);
  if(existing){
    const expectedHash=sha(plan.text!);
    const identical=existing.idempotencyKey===key&&
      existing.sourceMessageId===plan.sourceMessageId&&
      existing.decisionVersion===plan.decisionVersion&&
      existing.correlationId===plan.correlationId&&
      existing.intent===plan.intent&&
      existing.responseHash===expectedHash&&
      existing.status==='planned'&&
      existing.confirmationVerified===false&&
      existing.receiptId===null&&existing.transactionId===null&&
      existing.stateId===null;
    if(!identical){
      return unavailable('LAB_CANONICAL_REVISION_CHANGED',
        'La información de la carrera cambió o ya no coincide con el recibo original. Envía una nueva consulta; no se reutilizó una respuesta anterior.');
    }
    return{...projection,reason:'LAB_CANONICAL_RECOVERED',authority:AUTHORITY,
      recovery:{recovered:true,receiptId:existing.id}};
  }
  // Atomic unique INSERT/ON CONFLICT plus immutable-content assertion protects
  // against concurrent requests racing between SELECT and INSERT.
  try{
    const receipt=await store.persist(plan);
    return{...projection,authority:AUTHORITY,
      recovery:{recovered:receipt.duplicate,receiptId:receipt.id}};
  }catch(error){
    if(String((error as {code?:string})?.code)==='HIPICO_RESPONSE_RECEIPT_IDEMPOTENCY_MISMATCH'){
      return unavailable('LAB_CANONICAL_REVISION_CHANGED',
        'La información de la carrera cambió durante el reintento. Vuelve a consultar para obtener un estado actual.');
    }
    throw error;
  }
}
