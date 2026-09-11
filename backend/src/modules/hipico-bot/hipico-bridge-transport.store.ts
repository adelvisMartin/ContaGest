import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import type { IntentResult } from './hipico-operational-classifier.js';
import { assertReplayMatch, transportReplaySignature } from './hipico-replay-integrity.js';
import { assertBridgeGroupIdentity, bridgeGroupIdentityReady, normalizeBridgeGroupId } from './hipico-bridge-input-policy.js';

type TransportInput={
  providerMessageId:string;
  phoneNumberId:string;
  sender:string;
  messageType:string;
  body:string;
  result:IntentResult;
  payload:Record<string,unknown>;
};

type GroupOutboxInput={
  eventId:string;
  recipient:string;
  result:IntentResult;
};

type PersistedTransportSource={
  id:string;
  phoneNumberId:string|null;
  sender:string|null;
  messageType:string|null;
  body:string|null;
  payload:Record<string,unknown>|null;
};

type PersistedGroupShadowSource={
  id:string;
  recipient:string|null;
};

const id=(prefix:string)=>`${prefix}_${crypto.randomUUID()}`;

function assertTransportReplay(existing:PersistedTransportSource,input:TransportInput){
  const persisted=transportReplaySignature(existing);
  const replay=transportReplaySignature(input);
  assertReplayMatch('transport',persisted,replay);
}

function assertGroupShadowDestination(existing:PersistedGroupShadowSource,input:GroupOutboxInput){
  if(String(existing.recipient||'')===String(input.recipient||''))return;
  const error:any=new Error('HIPICO_TRANSPORT_REPLAY_MISMATCH');
  error.code='HIPICO_TRANSPORT_REPLAY_MISMATCH';
  throw error;
}

/**
 * The real WhatsApp group gate must never acknowledge an event using a
 * serverless in-memory fallback. If PostgreSQL is unavailable these functions
 * throw; the HTTP route returns 503 and the desktop Bridge keeps the event in
 * its local spool for retry.
 *
 * Provider message ids are immutable source identities. A duplicate id is
 * accepted only when the stable transport fields and source metadata match the
 * first persisted event exactly. A replay with altered sender/body/type/time/
 * quote/media/channel semantics fails closed.
 */
export async function persistBridgeTransportEvent(input:TransportInput){
  assertBridgeGroupIdentity(input.payload);
  const candidateId=id('hwe');
  const inserted=await prisma.$queryRaw<Array<{id:string}>>`
    INSERT INTO public."HipicoWebhookEvent"
      ("id","providerMessageId","phoneNumberId","sender","messageType","body","intent","risk","status",
       "confidence","suggestion","payload","receivedAt","processedAt")
    VALUES
      (${candidateId},${input.providerMessageId},${input.phoneNumberId||null},${input.sender||null},
       ${input.messageType||'unknown'},${input.body||null},${input.result.intent},${input.result.risk},'classified',
       ${Number(input.result.confidence||0)},${input.result.suggestion||null},${JSON.stringify(input.payload||{})}::jsonb,
       CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT ("providerMessageId") DO NOTHING
    RETURNING "id"
  `;

  if(inserted[0]?.id){
    return{id:inserted[0].id,inserted:true};
  }

  const existing=await prisma.$queryRaw<PersistedTransportSource[]>`
    SELECT
      "id",
      "phoneNumberId" AS "phoneNumberId",
      "sender",
      "messageType" AS "messageType",
      "body",
      "payload"
    FROM public."HipicoWebhookEvent"
    WHERE "providerMessageId"=${input.providerMessageId}
    LIMIT 1
  `;
  if(!existing[0]?.id)throw new Error('HIPICO_TRANSPORT_DEDUPE_ROW_MISSING');
  assertTransportReplay(existing[0],input);
  return{id:existing[0].id,inserted:false};
}

/**
 * Compatibility shadow outbox used by the existing operator/audit views.
 * A partial unique index guarantees one group_bridge outbox row per event,
 * including retries after a partial failure.
 *
 * The first persisted projection remains immutable. On a later idempotent
 * source replay we intentionally reuse it even if a newer classifier version
 * would now produce different suggestion/intent/risk. Derived-model drift is
 * not source-identity drift and must never quarantine an otherwise valid
 * WhatsApp retry. The destination itself remains fail-closed.
 */
export async function ensureGroupShadowOutbox(input:GroupOutboxInput){
  const candidateId=id('hbo');
  const inserted=await prisma.$queryRaw<Array<{id:string}>>`
    INSERT INTO public."HipicoBotOutbox"
      ("id","eventId","recipient","targetType","message","intent","risk","status","createdAt","updatedAt")
    VALUES
      (${candidateId},${input.eventId},${input.recipient},'group_bridge',${input.result.suggestion},
       ${input.result.intent},${input.result.risk},'shadow',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT ("eventId","targetType")
      WHERE "eventId" IS NOT NULL AND "targetType"='group_bridge'
    DO NOTHING
    RETURNING "id"
  `;
  if(inserted[0]?.id)return{id:inserted[0].id};

  const existing=await prisma.$queryRaw<PersistedGroupShadowSource[]>`
    SELECT "id","recipient"
    FROM public."HipicoBotOutbox"
    WHERE "eventId"=${input.eventId} AND "targetType"='group_bridge'
    LIMIT 1
  `;
  if(!existing[0]?.id)throw new Error('HIPICO_GROUP_SHADOW_OUTBOX_DEDUPE_ROW_MISSING');
  assertGroupShadowDestination(existing[0],input);
  return{id:existing[0].id};
}

export async function bridgePersistenceReady(){
  if(!bridgeGroupIdentityReady())return false;
  const rows=await prisma.$queryRaw<Array<{eventTable:string|null;outboxTable:string|null}>>`
    SELECT
      to_regclass('public."HipicoWebhookEvent"')::text AS "eventTable",
      to_regclass('public."HipicoBotOutbox"')::text AS "outboxTable"
  `;
  return Boolean(rows[0]?.eventTable&&rows[0]?.outboxTable);
}

export const __test__={assertTransportReplay,assertGroupShadowDestination,assertBridgeGroupIdentity,bridgeGroupIdentityReady,normalizeGroupId:normalizeBridgeGroupId};
