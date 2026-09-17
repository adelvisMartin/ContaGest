import crypto from 'node:crypto';

export const OBSERVABILITY_STAGES=[
  'INBOUND','NORMALIZATION','PARSER','CONTEXT','RISK_POLICY','AGENT_DECISION',
  'PERSISTENCE','OUTBOX','DELIVERY_RECEIPT','RECONCILIATION_HANDOFF'
] as const;
export type ObservationStage=(typeof OBSERVABILITY_STAGES)[number];
export type ObservationOutcome='SUCCESS'|'HELD'|'DENIED'|'ERROR'|'DUPLICATE'|'RETRY'|'SKIPPED';

const SENSITIVE_KEY=/(authorization|cookie|token|secret|password|api.?key|raw|body|text|message|destination|sender|recipient|phone|jid|payload|participant)/i;
const SHA=/^[a-f0-9]{40}$/i;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hash(value:string){return crypto.createHash('sha256').update(value).digest('hex');}
function bounded(value:unknown,max:number){return String(value??'').trim().slice(0,max);}

export function candidateSha(env:Record<string,string|undefined>=process.env){
  for(const value of [env.HIPICO_CANDIDATE_SHA,env.GITHUB_SHA,env.VERCEL_GIT_COMMIT_SHA]){
    const normalized=String(value||'').trim();
    if(SHA.test(normalized))return normalized.toLowerCase();
  }
  return null;
}

export function sanitizeObservationMetadata(value:unknown,depth=0):unknown{
  if(value==null||typeof value==='boolean'||typeof value==='number')return value;
  if(typeof value==='string'){
    const text=value.slice(0,500);
    if(/Bearer\s+[A-Za-z0-9._~+\/-]+/i.test(text)||/^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(text))return'[REDACTED]';
    return text;
  }
  if(depth>=4)return'[TRUNCATED]';
  if(Array.isArray(value))return value.slice(0,20).map((item)=>sanitizeObservationMetadata(item,depth+1));
  if(typeof value==='object'){
    const out:Record<string,unknown>={};
    for(const [key,item] of Object.entries(value as Record<string,unknown>).slice(0,40)){
      if(SENSITIVE_KEY.test(key))continue;
      out[key.slice(0,80)]=sanitizeObservationMetadata(item,depth+1);
    }
    return out;
  }
  return String(value).slice(0,200);
}

export function buildObservationTrace(input:{ownerId:string;groupKey:string;groupId:string;sourceRef:string;requestId?:string|null;correlationId?:string|null}){
  const ownerId=bounded(input.ownerId,64);
  if(!UUID.test(ownerId))throw Object.assign(new Error('Observability ownerId must be a UUID.'),{code:'HIPICO_OBSERVABILITY_SCOPE_INVALID'});
  const groupKey=bounded(input.groupKey,180);
  const groupId=bounded(input.groupId,180);
  if(!groupKey||!groupId)throw Object.assign(new Error('Observability requires groupKey and groupId.'),{code:'HIPICO_OBSERVABILITY_SCOPE_INVALID'});
  const seed=`${ownerId}|${groupKey}|${groupId}|${String(input.sourceRef||'')}`;
  const requestId=bounded(input.requestId,180)||`req_${hash(`req|${seed}`).slice(0,32)}`;
  const correlationId=bounded(input.correlationId,180)||`corr_${hash(`corr|${seed}`).slice(0,32)}`;
  return{ownerId,groupKey,groupId,requestId,correlationId};
}

export type ObservationInput=ReturnType<typeof buildObservationTrace>&{
  stage:ObservationStage;outcome:ObservationOutcome;reasonCode:string;latencyMs?:number|null;candidateSha?:string|null;metadata?:unknown;
};

export function normalizeObservationEvent(input:ObservationInput){
  if(!OBSERVABILITY_STAGES.includes(input.stage))throw Object.assign(new Error('Unknown observability stage.'),{code:'HIPICO_OBSERVABILITY_STAGE_INVALID'});
  const latency=Number(input.latencyMs??0);
  return{
    ownerId:input.ownerId,
    groupKey:bounded(input.groupKey,180),
    groupId:bounded(input.groupId,180),
    requestId:bounded(input.requestId,180),
    correlationId:bounded(input.correlationId,180),
    candidateSha:SHA.test(String(input.candidateSha||''))?String(input.candidateSha).toLowerCase():candidateSha(),
    stage:input.stage,
    outcome:input.outcome,
    reasonCode:bounded(input.reasonCode||'UNSPECIFIED',160)||'UNSPECIFIED',
    latencyMs:Number.isFinite(latency)?Math.max(0,Math.min(86_400_000,Math.trunc(latency))):0,
    metadata:sanitizeObservationMetadata(input.metadata||{}) as Record<string,unknown>
  };
}

export function safeSupportId(value:unknown){return hash(String(value||'')).slice(0,24);}
