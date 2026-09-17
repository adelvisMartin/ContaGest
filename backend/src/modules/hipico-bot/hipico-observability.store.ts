import { prisma } from '../../database/prisma.js';
import { normalizeObservationEvent, safeSupportId, type ObservationInput } from './hipico-observability.js';

export async function observabilityReadiness(){
  try{
    const rows=await prisma.$queryRaw<Array<{events:string|null}>>`SELECT to_regclass('public.hipico_observability_events')::text AS events`;
    return{ready:Boolean(rows[0]?.events)};
  }catch{return{ready:false};}
}

export async function recordHipicoObservation(input:ObservationInput){
  const row=normalizeObservationEvent(input);
  const rows=await prisma.$queryRaw<any[]>`
    INSERT INTO public.hipico_observability_events
      (owner_id,group_key,group_id,request_id,correlation_id,candidate_sha,stage,outcome,reason_code,latency_ms,metadata)
    VALUES
      (${row.ownerId}::uuid,${row.groupKey},${row.groupId},${row.requestId},${row.correlationId},${row.candidateSha},${row.stage},${row.outcome},${row.reasonCode},${row.latencyMs},${JSON.stringify(row.metadata)}::jsonb)
    RETURNING id,created_at`;
  return rows[0]||null;
}

export async function recordHipicoObservationSafe(input:ObservationInput){
  try{return Boolean(await recordHipicoObservation(input));}
  catch(error:any){
    console.error('[hipico-observability] event persistence unavailable',{code:String(error?.code||'HIPICO_OBSERVABILITY_PERSISTENCE_FAILED').slice(0,120)});
    return false;
  }
}

export async function hipicoSupportBundle(input:{ownerId:string;groupKey:string;groupId:string;correlationId?:string|null;limit?:number}){
  const limit=Math.max(1,Math.min(250,Math.trunc(Number(input.limit||100))));
  const correlationId=String(input.correlationId||'').trim();
  const rows=await prisma.$queryRaw<any[]>`
    SELECT request_id,correlation_id,candidate_sha,stage,outcome,reason_code,latency_ms,metadata,created_at
    FROM public.hipico_observability_events
    WHERE owner_id=${input.ownerId}::uuid
      AND group_key=${input.groupKey}
      AND group_id=${input.groupId}
      AND (${correlationId}='' OR correlation_id=${correlationId})
    ORDER BY created_at ASC,id ASC
    LIMIT ${limit}`;
  return{
    scope:{ownerId:safeSupportId(input.ownerId),groupKey:safeSupportId(input.groupKey),groupId:safeSupportId(input.groupId)},
    correlationId:correlationId||null,
    generatedAt:new Date().toISOString(),
    events:rows.map((row)=>({
      requestId:row.request_id,correlationId:row.correlation_id,candidateSha:row.candidate_sha,
      stage:row.stage,outcome:row.outcome,reasonCode:row.reason_code,latencyMs:Number(row.latency_ms||0),
      metadata:row.metadata||{},createdAt:row.created_at
    }))
  };
}
