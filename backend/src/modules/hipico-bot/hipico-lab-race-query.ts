import crypto from 'node:crypto';
import { classifyRaceQueryIntent } from '../hipico/race-lifecycle.js';
import { RaceQueryService, formatRaceQueryResponse, type RaceQueryResult } from '../hipico/race-query.service.js';
import { canonicalBridgeReadScope } from './hipico-canonical-shadow.store.js';
import type { IntentResult } from './hipico-operational-classifier.js';
import type { SafeResponsePlan } from './hipico-response-safety.js';

type ReadScope = { ownerId:string; groupKey:string };
type LabQueryInput = {
  channelRole:'source'|'lab';
  channelId:string;
  groupKey:string;
  text:string;
  fromMe:boolean;
  historySync:boolean;
  mediaKind:string;
  rateAllowed:boolean;
  systemHealthy:boolean;
  forceReview:boolean;
  classification:IntentResult;
  responsePlan:SafeResponsePlan;
};
type QueryDeps = {
  readScope:(channelId:string,groupKey:string)=>Promise<ReadScope>;
  execute:(request:{ownerId:string;groupKey:string;text:string})=>Promise<RaceQueryResult>;
};
const fallbackDeps:QueryDeps={
  readScope:canonicalBridgeReadScope,
  execute:(request)=>new RaceQueryService().execute(request)
};
const NON_OPERATIONAL=new Set(['conversation','status_non_monetary']);

export function eligibleCanonicalLabRaceQuery(input:LabQueryInput){
  return input.channelRole==='lab' && !input.fromMe && !input.historySync
    && input.mediaKind==='none' && !input.forceReview && input.rateAllowed && input.systemHealthy
    && NON_OPERATIONAL.has(input.classification.intent)
    && ['safe','review'].includes(input.classification.risk)
    && input.responsePlan.canSend && !input.responsePlan.handoffRequired
    && !input.responsePlan.confirmationVerified && input.responsePlan.intent!=='CONFIRMED'
    && input.text.length>0 && input.text.length<=500
    && classifyRaceQueryIntent(input.text)!=='UNKNOWN';
}

/** Never generates a domain command. Missing or ambiguous evidence is made explicit. */
export async function resolveCanonicalLabRaceQuery(input:LabQueryInput,deps:QueryDeps=fallbackDeps):
  Promise<SafeResponsePlan>{
  if(!eligibleCanonicalLabRaceQuery(input))return input.responsePlan;
  try{
    const scope=await deps.readScope(input.channelId,input.groupKey);
    if(!scope.ownerId || scope.groupKey!==input.groupKey)throw new Error('LAB_QUERY_SCOPE_MISMATCH');
    const result=await deps.execute({ownerId:scope.ownerId,groupKey:scope.groupKey,text:input.text});
    return {
      ...input.responsePlan,
      intent:'ACK_RECEIVED',
      text:formatRaceQueryResponse(result).slice(0,3000),
      canSend:true,
      evidence:null,
      confirmationVerified:false,
      reason:'CANONICAL_LAB_RACE_QUERY',
      readModelDigest:crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex')
    };
  }catch(error:unknown){
    const code=String((error as {code?:string})?.code||'');
    if(code==='RACE_QUERY_AMBIGUOUS'||code==='RACE_QUERY_CONTEXT_REQUIRED'){
      return{
        ...input.responsePlan,
        intent:'NEEDS_CLARIFICATION',
        text:'Necesito que indiques la reunión y el número de carrera para consultar un dato inequívoco. No se realizó ningún cambio.',
        canSend:true,
        evidence:null,
        confirmationVerified:false,
        reason:code
      };
    }
    // No valid query means no factual claim and no fallback to an AI guess.
    return{
      ...input.responsePlan,
      intent:'NONE',
      text:null,
      canSend:false,
      evidence:null,
      confirmationVerified:false,
      reason:'CANONICAL_LAB_RACE_QUERY_UNAVAILABLE'
    };
  }
}
