import crypto from 'node:crypto';
import type { SafeResponsePlan, HandoffState } from './hipico-response-safety.js';
import type { IntentResult } from './hipico-operational-classifier.js';
import type { StoredResponseReceipt } from './hipico-handoff.store.js';

export const LAB_RECOVERY_WINDOW_MS=90_000;
const SAFE_INTENTS=new Set(['greeting','help','status_non_monetary']);
export type LabRecoveryVerdict={
  recovered:false;reason:string
}|{
  recovered:true;reason:'LAB_RESPONSE_RECOVERED';plan:SafeResponsePlan
};

/**
 * Only immutable, non-monetary acknowledgements can be recovered from an
 * existing response receipt. Never reconstruct a stored answer by trusting a
 * hash alone. Any new canonical/race result needs its own state-version proof.
 */
export function verifyLabResponseRecovery(input:{
  channelRole:'lab'|'source';duplicate:boolean;historySync:boolean;
  fromMe:boolean;mediaKind:string;forceReview:boolean;rateAllowed:boolean;
  systemHealthy:boolean;timestamp:string;nowMs:number;
  currentHandoff:HandoffState|null;classification:Pick<IntentResult,'intent'|'risk'>;
  candidate:SafeResponsePlan;receipt:StoredResponseReceipt|null;
}):LabRecoveryVerdict{
  if(input.channelRole!=='lab'||!input.duplicate||input.historySync||
     input.fromMe||input.mediaKind!=='none'||input.forceReview||
     !input.rateAllowed||!input.systemHealthy){
    return{recovered:false,reason:'LAB_RECOVERY_POLICY_BLOCKED'};
  }
  const age=input.nowMs-Date.parse(input.timestamp);
  if(!Number.isFinite(age)||age<0||age>LAB_RECOVERY_WINDOW_MS){
    return{recovered:false,reason:'LAB_RECOVERY_STALE'};
  }
  if(input.currentHandoff?.ownership==='human'){
    return{recovered:false,reason:'LAB_RECOVERY_HUMAN_HANDOFF'};
  }
  if(input.classification.risk!=='safe'||!SAFE_INTENTS.has(input.classification.intent)){
    return{recovered:false,reason:'LAB_RECOVERY_NOT_STATIC'};
  }
  const plan=input.candidate,row=input.receipt;
  if(!row)return{recovered:false,reason:'LAB_RECOVERY_RECEIPT_MISSING'};
  // No result board, participant list, dynamic AI answer, mutation or officiality
  // claims can be replayed without state-version attestations.
  if(!plan.canSend||plan.handoffRequired||plan.confirmationVerified||
     plan.intent!=='ACK_RECEIVED'||!plan.text||plan.text.length>1000||
     plan.evidence||!/^resp_[a-f0-9]{32}$/.test(plan.responseIdempotencyKey)){
    return{recovered:false,reason:'LAB_RECOVERY_CANDIDATE_UNSAFE'};
  }
  const digest=crypto.createHash('sha256').update(plan.text).digest('hex');
  const same=row.idempotencyKey===plan.responseIdempotencyKey
    && row.sourceMessageId===plan.sourceMessageId
    && row.decisionVersion===plan.decisionVersion
    && row.correlationId===plan.correlationId
    && row.intent===plan.intent
    && row.responseHash===digest
    && row.status==='planned'
    && row.confirmationVerified===false
    && row.receiptId===null&&row.transactionId===null&&row.stateId===null;
  if(!same)return{recovered:false,reason:'LAB_RECOVERY_RECEIPT_MISMATCH'};
  return{recovered:true,reason:'LAB_RESPONSE_RECOVERED',plan};
}
