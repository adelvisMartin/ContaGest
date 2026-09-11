import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { initialHandoffState, type HandoffState, type SafeResponsePlan } from './hipico-response-safety.js';

function uuid() { return crypto.randomUUID(); }

export async function responseSafetyReadiness() {
  const rows = await prisma.$queryRaw<Array<{ handoff: string | null; audit: string | null; receipts: string | null }>>`
    SELECT
      to_regclass('public."HipicoConversationHandoff"')::text AS "handoff",
      to_regclass('public."HipicoHandoffAudit"')::text AS "audit",
      to_regclass('public."HipicoResponseReceipt"')::text AS "receipts"
  `;
  return { ready: Boolean(rows[0]?.handoff && rows[0]?.audit && rows[0]?.receipts) };
}

export async function loadHandoff(groupKey: string, participantId: string, raceId: string | null) {
  const initial = initialHandoffState(groupKey, participantId, raceId);
  const rows = await prisma.$queryRaw<Array<{
    conversationKey: string; groupKey: string; participantId: string; raceId: string | null; ownership: 'bot'|'human';
    clarificationCount: number; reason: string | null; humanOwnerId: string | null; expiresAt: Date | null; updatedAt: Date; version: number;
  }>>`
    SELECT "conversationKey", "groupKey", "participantId", "raceId", "ownership", "clarificationCount",
           "reason", "humanOwnerId", "expiresAt", "updatedAt", "version"
    FROM public."HipicoConversationHandoff"
    WHERE "conversationKey"=${initial.conversationKey}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return initial;
  return {
    conversationKey: row.conversationKey,
    groupKey: row.groupKey,
    participantId: row.participantId,
    raceId: row.raceId,
    ownership: row.ownership,
    clarificationCount: Number(row.clarificationCount || 0),
    reason: row.reason,
    humanOwnerId: row.humanOwnerId,
    expiresAt: row.expiresAt?.toISOString() || null,
    updatedAt: row.updatedAt.toISOString(),
    version: Number(row.version || 0)
  } satisfies HandoffState;
}

export async function saveHandoff(state: HandoffState, audit?: { eventType: string; actorId?: string | null; sourceMessageId?: string | null; correlationId?: string | null; payload?: unknown }) {
  const expectedVersion=Math.max(0,Math.trunc(Number(state.version||0)));
  return prisma.$transaction(async (tx) => {
    let rows:Array<{version:number}>;
    if(expectedVersion===0){
      rows=await tx.$queryRaw<Array<{version:number}>>`
        INSERT INTO public."HipicoConversationHandoff"
          ("conversationKey","groupKey","participantId","raceId","ownership","clarificationCount","reason","humanOwnerId","expiresAt","version","updatedAt")
        VALUES
          (${state.conversationKey},${state.groupKey},${state.participantId},${state.raceId},${state.ownership},${state.clarificationCount},
           ${state.reason},${state.humanOwnerId},${state.expiresAt ? new Date(state.expiresAt) : null},1,${new Date(state.updatedAt)})
        ON CONFLICT ("conversationKey") DO NOTHING
        RETURNING "version"
      `;
    }else{
      rows=await tx.$queryRaw<Array<{version:number}>>`
        UPDATE public."HipicoConversationHandoff"
        SET "ownership"=${state.ownership},
            "clarificationCount"=${state.clarificationCount},
            "reason"=${state.reason},
            "humanOwnerId"=${state.humanOwnerId},
            "expiresAt"=${state.expiresAt ? new Date(state.expiresAt) : null},
            "version"="version"+1,
            "updatedAt"=${new Date(state.updatedAt)}
        WHERE "conversationKey"=${state.conversationKey}
          AND "version"=${expectedVersion}
        RETURNING "version"
      `;
    }
    if(!rows[0]?.version){
      throw Object.assign(new Error('Handoff state changed concurrently; reload before writing.'),{code:'HIPICO_HANDOFF_CONFLICT'});
    }
    if (audit) {
      await tx.$executeRaw`
        INSERT INTO public."HipicoHandoffAudit"
          ("id","conversationKey","eventType","actorId","sourceMessageId","correlationId","payload")
        VALUES
          (${uuid()},${state.conversationKey},${audit.eventType},${audit.actorId || null},${audit.sourceMessageId || null},
           ${audit.correlationId || null},${JSON.stringify(audit.payload || {})}::jsonb)
      `;
    }
    return {...state,version:Number(rows[0].version)} satisfies HandoffState;
  });
}

type PersistedResponseReceipt={
  id:string;
  sourceMessageId:string;
  decisionVersion:string;
  correlationId:string;
  intent:string;
  responseHash:string|null;
  receiptId:string|null;
  transactionId:string|null;
  stateId:string|null;
  confirmationVerified:boolean;
  status:string;
};

function responseHash(text:string|null){
  return text ? crypto.createHash('sha256').update(text).digest('hex') : null;
}

function responseReceiptEvidence(plan:SafeResponsePlan){
  const evidence=plan.evidence||{};
  return{
    sourceMessageId:plan.sourceMessageId,
    decisionVersion:plan.decisionVersion,
    correlationId:plan.correlationId,
    intent:plan.intent,
    responseHash:responseHash(plan.text),
    receiptId:evidence.receiptId||null,
    transactionId:evidence.transactionId||null,
    stateId:evidence.stateId||null,
    confirmationVerified:Boolean(plan.confirmationVerified),
    status:plan.canSend?'planned':'held'
  };
}

function assertResponseReceiptReplay(existing:PersistedResponseReceipt,plan:SafeResponsePlan){
  const expected=responseReceiptEvidence(plan);
  const same=existing.sourceMessageId===expected.sourceMessageId
    && existing.decisionVersion===expected.decisionVersion
    && existing.correlationId===expected.correlationId
    && existing.intent===expected.intent
    && existing.responseHash===expected.responseHash
    && existing.receiptId===expected.receiptId
    && existing.transactionId===expected.transactionId
    && existing.stateId===expected.stateId
    && Boolean(existing.confirmationVerified)===expected.confirmationVerified
    && existing.status===expected.status;
  if(!same){
    throw Object.assign(new Error('Response receipt idempotency key was reused with different response evidence.'),{code:'HIPICO_RESPONSE_RECEIPT_IDEMPOTENCY_MISMATCH'});
  }
}

export async function persistResponsePlan(plan: SafeResponsePlan) {
  const expected=responseReceiptEvidence(plan);
  const inserted = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO public."HipicoResponseReceipt"
      ("id","idempotencyKey","sourceMessageId","decisionVersion","correlationId","intent","responseHash",
       "receiptId","transactionId","stateId","confirmationVerified","status")
    VALUES
      (${uuid()},${plan.responseIdempotencyKey},${expected.sourceMessageId},${expected.decisionVersion},${expected.correlationId},${expected.intent},${expected.responseHash},
       ${expected.receiptId},${expected.transactionId},${expected.stateId},${expected.confirmationVerified},${expected.status})
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id"
  `;
  if(inserted[0]?.id)return{id:inserted[0].id,idempotencyKey:plan.responseIdempotencyKey,duplicate:false};

  const existing=await prisma.$queryRaw<PersistedResponseReceipt[]>`
    SELECT "id","sourceMessageId","decisionVersion","correlationId","intent","responseHash",
           "receiptId","transactionId","stateId","confirmationVerified","status"
    FROM public."HipicoResponseReceipt"
    WHERE "idempotencyKey"=${plan.responseIdempotencyKey}
    LIMIT 2
  `;
  if(existing.length!==1)throw Object.assign(new Error('Response receipt idempotency row missing or ambiguous.'),{code:'HIPICO_RESPONSE_RECEIPT_ROW_INVALID'});
  const row=existing[0];
  assertResponseReceiptReplay(row,plan);
  return{id:row.id,idempotencyKey:plan.responseIdempotencyKey,duplicate:true};
}

export const __test__={responseReceiptEvidence,assertResponseReceiptReplay};
