import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import type { IntentResult } from './hipico-operational-classifier.js';

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

const id=(prefix:string)=>`${prefix}_${crypto.randomUUID()}`;

/**
 * The real WhatsApp group gate must never acknowledge an event using a
 * serverless in-memory fallback. If PostgreSQL is unavailable these functions
 * throw; the HTTP route returns 503 and the desktop Bridge keeps the event in
 * its local spool for retry.
 */
export async function persistBridgeTransportEvent(input:TransportInput){
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

  const existing=await prisma.$queryRaw<Array<{id:string}>>`
    SELECT "id" FROM public."HipicoWebhookEvent"
    WHERE "providerMessageId"=${input.providerMessageId}
    LIMIT 1
  `;
  if(!existing[0]?.id)throw new Error('HIPICO_TRANSPORT_DEDUPE_ROW_MISSING');
  return{id:existing[0].id,inserted:false};
}

/**
 * Compatibility shadow outbox used by the existing operator/audit views.
 * A partial unique index guarantees one group_bridge outbox row per event,
 * including retries after a partial failure.
 */
export async function ensureGroupShadowOutbox(input:GroupOutboxInput){
  const candidateId=id('hbo');
  const rows=await prisma.$queryRaw<Array<{id:string}>>`
    INSERT INTO public."HipicoBotOutbox"
      ("id","eventId","recipient","targetType","message","intent","risk","status","createdAt","updatedAt")
    VALUES
      (${candidateId},${input.eventId},${input.recipient},'group_bridge',${input.result.suggestion},
       ${input.result.intent},${input.result.risk},'shadow',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT ("eventId","targetType")
      WHERE "eventId" IS NOT NULL AND "targetType"='group_bridge'
    DO UPDATE SET
      "recipient"=EXCLUDED."recipient",
      "message"=EXCLUDED."message",
      "intent"=EXCLUDED."intent",
      "risk"=EXCLUDED."risk",
      "status"='shadow',
      "updatedAt"=CURRENT_TIMESTAMP
    RETURNING "id"
  `;
  if(!rows[0]?.id)throw new Error('HIPICO_GROUP_SHADOW_OUTBOX_NOT_PERSISTED');
  return{id:rows[0].id};
}

export async function bridgePersistenceReady(){
  const rows=await prisma.$queryRaw<Array<{eventTable:string|null;outboxTable:string|null}>>`
    SELECT
      to_regclass('public."HipicoWebhookEvent"')::text AS "eventTable",
      to_regclass('public."HipicoBotOutbox"')::text AS "outboxTable"
  `;
  return Boolean(rows[0]?.eventTable&&rows[0]?.outboxTable);
}
