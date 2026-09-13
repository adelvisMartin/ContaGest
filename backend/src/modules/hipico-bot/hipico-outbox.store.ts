import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { monotonicReceiptStatus, outboundPayloadDigest } from './hipico-outbox-policy.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const E164_DIGITS=/^[1-9]\d{6,14}$/;
const PROVIDER=/^[a-z0-9_.-]{2,40}$/;

export type CanonicalOutboundInput={
  ownerId:string;
  groupKey:string;
  destination:string;
  idempotencyKey:string;
  replyType?:string;
  payload:Record<string,unknown>;
  provider?:string;
  maxAttempts?:number;
  nextAttemptAt?:Date;
  correlationId?:string;
};

function text(value:unknown){return String(value??'').trim();}
function field(row:any,camel:string,snake:string){return row?.[camel]??row?.[snake]??null;}
function assertUuid(value:string,label:string){if(!UUID.test(value))throw Object.assign(new Error(`${label} must be UUID.`),{code:'HIPICO_OUTBOX_INPUT_INVALID'});}
function boundedInt(value:unknown,fallback:number,min:number,max:number){const parsed=Number(value);return Number.isFinite(parsed)?Math.min(max,Math.max(min,Math.trunc(parsed))):fallback;}
function postgresCode(error:any){return String(error?.meta?.code||error?.code||'');}

export function configuredOutboxOwnerId(env:NodeJS.ProcessEnv=process.env){
  const value=text(env.HIPICO_OWNER_ID);
  return UUID.test(value)?value:null;
}

export function sameCanonicalOutboundIntent(existing:any,candidate:any){
  return text(field(existing,'ownerId','owner_id')).toLowerCase()===text(field(candidate,'ownerId','owner_id')).toLowerCase()
    && text(field(existing,'groupKey','group_key'))===text(field(candidate,'groupKey','group_key'))
    && text(field(existing,'destination','destination')).replace(/^\+/,'')===text(field(candidate,'destination','destination')).replace(/^\+/,'')
    && text(field(existing,'replyType','reply_type')||'operational')===text(field(candidate,'replyType','reply_type')||'operational')
    && text(field(existing,'provider','provider')||'meta_cloud')===text(field(candidate,'provider','provider')||'meta_cloud')
    && text(field(existing,'payloadDigest','payload_digest'))===text(field(candidate,'payloadDigest','payload_digest'));
}

function normalizedInput(input:CanonicalOutboundInput){
  const ownerId=text(input.ownerId);
  const groupKey=text(input.groupKey);
  const destination=text(input.destination).replace(/^\+/,'');
  const idempotencyKey=text(input.idempotencyKey);
  const replyType=text(input.replyType||'operational');
  const provider=text(input.provider||'meta_cloud').toLowerCase();
  const correlationId=text(input.correlationId||crypto.randomUUID());
  assertUuid(ownerId,'ownerId');
  assertUuid(correlationId,'correlationId');
  if(!groupKey||groupKey.length>120||!E164_DIGITS.test(destination)||idempotencyKey.length<8||idempotencyKey.length>220||replyType.length<1||replyType.length>80||!PROVIDER.test(provider)){
    throw Object.assign(new Error('Canonical outbound input is invalid.'),{code:'HIPICO_OUTBOX_INPUT_INVALID'});
  }
  if(!input.payload||typeof input.payload!=='object'||Array.isArray(input.payload))throw Object.assign(new Error('Canonical outbound payload must be an object.'),{code:'HIPICO_OUTBOX_INPUT_INVALID'});
  const payloadDigest=outboundPayloadDigest({ownerId,groupKey,destination,replyType,payload:input.payload});
  return{
    ownerId,groupKey,destination,idempotencyKey,replyType,provider,correlationId,payloadDigest,
    payload:input.payload,maxAttempts:boundedInt(input.maxAttempts,4,1,20),nextAttemptAt:input.nextAttemptAt||new Date()
  };
}

export async function canonicalOutboxReadiness(){
  try{
    const rows=await prisma.$queryRaw<Array<{outbox:string|null;receipts:string|null}>>`
      SELECT to_regclass('public.hipico_outbox')::text AS outbox,
             to_regclass('public.hipico_outbox_receipts')::text AS receipts`;
    return{ready:Boolean(rows[0]?.outbox&&rows[0]?.receipts),outboxReady:Boolean(rows[0]?.outbox),receiptsReady:Boolean(rows[0]?.receipts)};
  }catch{return{ready:false,outboxReady:false,receiptsReady:false};}
}

export async function enqueueCanonicalOutbound(input:CanonicalOutboundInput){
  const row=normalizedInput(input);
  const inserted=await prisma.$queryRaw<any[]>`
    INSERT INTO public.hipico_outbox
      (owner_id,group_key,destination,idempotency_key,reply_type,payload,status,attempts,next_attempt_at,
       correlation_id,payload_digest,provider,max_attempts,created_at,updated_at)
    VALUES
      (${row.ownerId}::uuid,${row.groupKey},${row.destination},${row.idempotencyKey},${row.replyType},${JSON.stringify(row.payload)}::jsonb,
       'queued',0,${row.nextAttemptAt},${row.correlationId}::uuid,${row.payloadDigest},${row.provider},${row.maxAttempts},now(),now())
    ON CONFLICT(owner_id,idempotency_key) DO NOTHING
    RETURNING *`;
  if(inserted[0])return{row:inserted[0],inserted:true};
  const existing=await prisma.$queryRaw<any[]>`
    SELECT * FROM public.hipico_outbox
    WHERE owner_id=${row.ownerId}::uuid AND idempotency_key=${row.idempotencyKey}
    LIMIT 2`;
  if(existing.length!==1)throw Object.assign(new Error('Canonical idempotency row is missing or ambiguous.'),{code:'HIPICO_OUTBOX_IDEMPOTENCY_ROW_INVALID'});
  if(!sameCanonicalOutboundIntent(existing[0],row))throw Object.assign(new Error('Idempotency key reused with different outbound content.'),{code:'HIPICO_OUTBOUND_IDEMPOTENCY_MISMATCH'});
  return{row:existing[0],inserted:false};
}

export async function getCanonicalOutbox(ownerId:string,id:string){
  assertUuid(ownerId,'ownerId');assertUuid(id,'outboxId');
  const rows=await prisma.$queryRaw<any[]>`SELECT * FROM public.hipico_outbox WHERE owner_id=${ownerId}::uuid AND id=${id}::uuid LIMIT 1`;
  return rows[0]||null;
}

export async function listCanonicalOutbox(ownerId:string,options:{limit?:number;status?:string}={}){
  assertUuid(ownerId,'ownerId');
  const limit=boundedInt(options.limit,50,1,100);
  const status=text(options.status);
  return prisma.$queryRaw<any[]>`
    SELECT * FROM public.hipico_outbox
    WHERE owner_id=${ownerId}::uuid AND (${status}='' OR status=${status})
    ORDER BY created_at DESC LIMIT ${limit}`;
}

export async function claimCanonicalOutbound(input:{ownerId:string;id?:string|null;leaseMs?:number;cooldownMs?:number}){
  assertUuid(input.ownerId,'ownerId');
  const idValue=input.id?text(input.id):null;
  if(idValue)assertUuid(idValue,'outboxId');
  const leaseToken=crypto.randomUUID();
  const leaseSeconds=boundedInt(input.leaseMs,120_000,5_000,10*60_000)/1000;
  const cooldownSeconds=boundedInt(input.cooldownMs,1_500,0,60_000)/1000;
  try{
    const rows=await prisma.$queryRaw<any[]>`
      WITH candidate AS (
        SELECT o.id
        FROM public.hipico_outbox o
        WHERE o.owner_id=${input.ownerId}::uuid
          AND (${idValue}::uuid IS NULL OR o.id=${idValue}::uuid)
          AND o.status IN ('queued','retry')
          AND o.attempts<o.max_attempts
          AND o.next_attempt_at<=now()
          AND (o.cooldown_until IS NULL OR o.cooldown_until<=now())
          AND (o.leased_until IS NULL OR o.leased_until<=now())
          AND NOT EXISTS (
            SELECT 1 FROM public.hipico_outbox active
            WHERE active.owner_id=o.owner_id AND active.group_key=o.group_key AND active.destination=o.destination
              AND active.id<>o.id AND active.status='sending'
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.hipico_outbox recent
            WHERE recent.owner_id=o.owner_id AND recent.group_key=o.group_key AND recent.destination=o.destination
              AND recent.id<>o.id AND recent.accepted_at IS NOT NULL
              AND recent.accepted_at>now()-make_interval(secs=>${cooldownSeconds})
          )
        ORDER BY o.next_attempt_at,o.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE public.hipico_outbox target
      SET status='sending',lease_token=${leaseToken}::uuid,leased_at=now(),
          leased_until=now()+make_interval(secs=>${leaseSeconds}),attempts=target.attempts+1,updated_at=now()
      FROM candidate
      WHERE target.id=candidate.id
      RETURNING target.*`;
    return rows[0]||null;
  }catch(error:any){
    if(postgresCode(error)==='23505')return null;
    throw error;
  }
}

async function finishSending(input:{ownerId:string;id:string;leaseToken:string},setSql:(args:{ownerId:string;id:string;leaseToken:string})=>Promise<any[]>){
  assertUuid(input.ownerId,'ownerId');assertUuid(input.id,'outboxId');assertUuid(input.leaseToken,'leaseToken');
  const rows=await setSql(input);
  return rows[0]||null;
}

export async function markCanonicalAccepted(input:{ownerId:string;id:string;leaseToken:string;providerMessageId:string}){
  const providerMessageId=text(input.providerMessageId);
  if(!providerMessageId||providerMessageId.length>320)throw Object.assign(new Error('Provider message id invalid.'),{code:'HIPICO_OUTBOX_RECEIPT_INVALID'});
  return finishSending(input,({ownerId,id,leaseToken})=>prisma.$queryRaw<any[]>`
    UPDATE public.hipico_outbox SET status='accepted',external_message_id=${providerMessageId},accepted_at=now(),
      lease_token=NULL,leased_at=NULL,leased_until=NULL,last_error=NULL,last_error_code=NULL,updated_at=now()
    WHERE owner_id=${ownerId}::uuid AND id=${id}::uuid AND status='sending' AND lease_token=${leaseToken}::uuid
    RETURNING *`);
}

export async function markCanonicalRetry(input:{ownerId:string;id:string;leaseToken:string;nextAttemptAt:Date;error:string;errorCode?:string}){
  const safeError=text(input.error).slice(0,1000);const errorCode=text(input.errorCode).slice(0,120)||null;
  return finishSending(input,({ownerId,id,leaseToken})=>prisma.$queryRaw<any[]>`
    UPDATE public.hipico_outbox SET status='retry',next_attempt_at=${input.nextAttemptAt},
      lease_token=NULL,leased_at=NULL,leased_until=NULL,last_error=${safeError},last_error_code=${errorCode},updated_at=now()
    WHERE owner_id=${ownerId}::uuid AND id=${id}::uuid AND status='sending' AND lease_token=${leaseToken}::uuid
    RETURNING *`);
}

export async function markCanonicalFailed(input:{ownerId:string;id:string;leaseToken:string;error:string;errorCode?:string}){
  const safeError=text(input.error).slice(0,1000);const errorCode=text(input.errorCode).slice(0,120)||null;
  return finishSending(input,({ownerId,id,leaseToken})=>prisma.$queryRaw<any[]>`
    UPDATE public.hipico_outbox SET status='failed',failed_at=now(),
      lease_token=NULL,leased_at=NULL,leased_until=NULL,last_error=${safeError},last_error_code=${errorCode},updated_at=now()
    WHERE owner_id=${ownerId}::uuid AND id=${id}::uuid AND status='sending' AND lease_token=${leaseToken}::uuid
    RETURNING *`);
}

export async function markCanonicalReconciliationRequired(input:{ownerId:string;id:string;leaseToken:string;error:string;errorCode?:string}){
  const safeError=text(input.error).slice(0,1000);const errorCode=text(input.errorCode).slice(0,120)||'AMBIGUOUS_DELIVERY';
  return finishSending(input,({ownerId,id,leaseToken})=>prisma.$queryRaw<any[]>`
    UPDATE public.hipico_outbox SET status='reconciliation_required',
      lease_token=NULL,leased_at=NULL,leased_until=NULL,last_error=${safeError},last_error_code=${errorCode},updated_at=now()
    WHERE owner_id=${ownerId}::uuid AND id=${id}::uuid AND status='sending' AND lease_token=${leaseToken}::uuid
    RETURNING *`);
}

export async function recordCanonicalReceipt(input:{
  ownerId:string;provider?:string;providerMessageId:string;status:'sent'|'delivered'|'read'|'failed';timestamp:Date;errorCode?:string|null;metadata?:Record<string,unknown>;
}){
  assertUuid(input.ownerId,'ownerId');
  const provider=text(input.provider||'meta_cloud').toLowerCase();
  const providerMessageId=text(input.providerMessageId);
  if(!PROVIDER.test(provider)||!providerMessageId||providerMessageId.length>320||!Number.isFinite(input.timestamp.getTime()))throw Object.assign(new Error('Provider receipt invalid.'),{code:'HIPICO_OUTBOX_RECEIPT_INVALID'});
  const metadata=input.metadata&&typeof input.metadata==='object'&&!Array.isArray(input.metadata)?input.metadata:{};
  return prisma.$transaction(async(tx:any)=>{
    const rows=await tx.$queryRaw<any[]>`
      SELECT * FROM public.hipico_outbox
      WHERE owner_id=${input.ownerId}::uuid AND provider=${provider} AND external_message_id=${providerMessageId}
      LIMIT 1 FOR UPDATE`;
    const existing=rows[0];
    if(!existing)return{matched:false,inserted:false,row:null};
    const receipt=await tx.$queryRaw<any[]>`
      INSERT INTO public.hipico_outbox_receipts
        (owner_id,outbox_id,provider,provider_message_id,receipt_status,receipt_timestamp,error_code,metadata)
      VALUES (${input.ownerId}::uuid,${existing.id}::uuid,${provider},${providerMessageId},${input.status},${input.timestamp},${text(input.errorCode).slice(0,120)||null},${JSON.stringify(metadata)}::jsonb)
      ON CONFLICT(owner_id,provider,provider_message_id,receipt_status,receipt_timestamp) DO NOTHING
      RETURNING id`;
    const nextStatus=monotonicReceiptStatus(String(existing.status),input.status);
    const rank=input.status==='read'?3:input.status==='delivered'?2:input.status==='sent'?1:0;
    const updated=await tx.$queryRaw<any[]>`
      UPDATE public.hipico_outbox SET status=${nextStatus},
        sent_at=CASE WHEN ${rank}>=1 THEN COALESCE(sent_at,${input.timestamp}) ELSE sent_at END,
        delivered_at=CASE WHEN ${rank}>=2 THEN COALESCE(delivered_at,${input.timestamp}) ELSE delivered_at END,
        read_at=CASE WHEN ${rank}>=3 THEN COALESCE(read_at,${input.timestamp}) ELSE read_at END,
        failed_at=CASE WHEN ${nextStatus}='failed' THEN COALESCE(failed_at,${input.timestamp}) ELSE failed_at END,
        last_error_code=CASE WHEN ${nextStatus}='failed' THEN ${text(input.errorCode).slice(0,120)||'PROVIDER_FAILED'} ELSE last_error_code END,
        updated_at=now()
      WHERE owner_id=${input.ownerId}::uuid AND id=${existing.id}::uuid
      RETURNING *`;
    return{matched:true,inserted:Boolean(receipt[0]),row:updated[0]||existing};
  });
}

export async function reconcileCanonicalOutbound(input:{ownerId:string;id:string;resolution:'sent'|'failed';actorRef:string;reason:string;providerMessageId?:string|null}){
  assertUuid(input.ownerId,'ownerId');assertUuid(input.id,'outboxId');
  const actorRef=text(input.actorRef).slice(0,220);const reason=text(input.reason).slice(0,500);const providerMessageId=text(input.providerMessageId).slice(0,320)||null;
  if(!actorRef||reason.length<5||(input.resolution==='sent'&&!providerMessageId))throw Object.assign(new Error('Explicit reconciliation evidence is incomplete.'),{code:'HIPICO_OUTBOX_RECONCILIATION_INVALID'});
  const rows=await prisma.$queryRaw<any[]>`
    UPDATE public.hipico_outbox SET status=${input.resolution},external_message_id=COALESCE(${providerMessageId},external_message_id),
      sent_at=CASE WHEN ${input.resolution}='sent' THEN COALESCE(sent_at,now()) ELSE sent_at END,
      failed_at=CASE WHEN ${input.resolution}='failed' THEN COALESCE(failed_at,now()) ELSE failed_at END,
      reconciled_by=${actorRef},reconciled_at=now(),reconciliation_reason=${reason},updated_at=now()
    WHERE owner_id=${input.ownerId}::uuid AND id=${input.id}::uuid AND status='reconciliation_required'
    RETURNING *`;
  return rows[0]||null;
}

export const __test__={normalizedInput,postgresCode};
