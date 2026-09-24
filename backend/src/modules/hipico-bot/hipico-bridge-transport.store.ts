import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import type { IntentResult } from './hipico-operational-classifier.js';
import { assertReplayMatch, groupShadowReplaySignature, transportReplaySignature } from './hipico-replay-integrity.js';
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
  message:string|null;
  intent:string|null;
  risk:string|null;
};

const id=(prefix:string)=>`${prefix}_${crypto.randomUUID()}`;

function assertTransportReplay(existing:PersistedTransportSource,input:TransportInput){
  const persisted=transportReplaySignature(existing);
  const replay=transportReplaySignature(input);
  assertReplayMatch('transport',persisted,replay);
}

function assertGroupShadowReplay(existing:PersistedGroupShadowSource,input:GroupOutboxInput){
  const persisted=groupShadowReplaySignature(existing);
  const replay=groupShadowReplaySignature({
    recipient:input.recipient,
    message:input.result.suggestion,
    intent:input.result.intent,
    risk:input.result.risk
  });
  assertReplayMatch('group-shadow',persisted,replay);
}

function assertGroupShadowReplayAtTransportBoundary(existing:PersistedGroupShadowSource,input:GroupOutboxInput){
  try{
    assertGroupShadowReplay(existing,input);
  }catch(error:any){
    if(error?.code==='HIPICO_GROUP_SHADOW_OUTBOX_REPLAY_MISMATCH'){
      error.code='HIPICO_TRANSPORT_REPLAY_MISMATCH';
    }
    throw error;
  }
}

function assertGroupShadowDestination(existing:Pick<PersistedGroupShadowSource,'recipient'>,input:Pick<GroupOutboxInput,'recipient'>){
  if(String(existing.recipient||'')!==String(input.recipient||'')){
    throw Object.assign(new Error('Group shadow destination changed for the same event.'),{code:'HIPICO_TRANSPORT_REPLAY_MISMATCH'});
  }
}

/**
 * The real WhatsApp group gate must never acknowledge an event using a
 * serverless in-memory fallback. If PostgreSQL is unavailable these functions
 * throw; the HTTP route returns 503 and the desktop Bridge keeps the event in
 * its local spool for retry.
 *
 * Provider message ids are immutable source identities. A duplicate id is
 * accepted only when the stable transport fields match the first persisted
 * event exactly. A replay with altered sender/body/type/channel fails closed.
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
 * including retries after a partial failure. The first row is immutable source
 * evidence: an idempotent replay may reuse it, but changed recipient/message/
 * intent/risk is rejected instead of silently rewriting history.
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
    SELECT "id","recipient","message","intent","risk"
    FROM public."HipicoBotOutbox"
    WHERE "eventId"=${input.eventId} AND "targetType"='group_bridge'
    LIMIT 1
  `;
  if(!existing[0]?.id)throw new Error('HIPICO_GROUP_SHADOW_OUTBOX_DEDUPE_ROW_MISSING');
  assertGroupShadowReplayAtTransportBoundary(existing[0],input);
  return{id:existing[0].id};
}

export async function sourceReplyOutboxReady(){
  try{
    const rows=await prisma.$queryRaw<Array<{outboxTable:string|null;sourceReplyIndex:string|null}>>`
      SELECT
        to_regclass('public."HipicoBotOutbox"')::text AS "outboxTable",
        to_regclass('public."HipicoBotOutbox_source_reply_event_unique"')::text AS "sourceReplyIndex"
    `;
    return Boolean(rows[0]?.outboxTable&&rows[0]?.sourceReplyIndex);
  }catch{
    return false;
  }
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

export const __test__={assertTransportReplay,assertGroupShadowReplay,assertGroupShadowReplayAtTransportBoundary,assertGroupShadowDestination,assertSourceReplyReplay,assertBridgeGroupIdentity,bridgeGroupIdentityReady,normalizeGroupId:normalizeBridgeGroupId};


export type SourceReplyOutboxInput={
  eventId:string;
  recipient:string;
  message:string;
  intent:string;
  risk:string;
};

export type SourceReplyOutboxRow={
  id:string;
  eventId:string;
  recipient:string;
  message:string;
  intent:string;
  risk:string;
  status:string;
  providerMessageId:string|null;
  error:string|null;
  sentAt:Date|string|null;
};

function assertSourceReplyReplay(existing:SourceReplyOutboxRow,input:SourceReplyOutboxInput){
  const matches=String(existing.eventId||'')===String(input.eventId||'')
    && String(existing.recipient||'')===String(input.recipient||'')
    && String(existing.message||'')===String(input.message||'')
    && String(existing.intent||'')===String(input.intent||'')
    && String(existing.risk||'')===String(input.risk||'');
  if(!matches){
    throw Object.assign(new Error('Autonomous source reply changed for the same event.'),{
      code:'HIPICO_SOURCE_REPLY_REPLAY_MISMATCH'
    });
  }
}

export async function getSourceReplyOutbox(eventId:string){
  const rows=await prisma.$queryRaw<SourceReplyOutboxRow[]>`
    SELECT
      "id","eventId","recipient","message","intent","risk","status",
      "providerMessageId","error","sentAt"
    FROM public."HipicoBotOutbox"
    WHERE "eventId"=${eventId} AND "targetType"='source_reply'
    LIMIT 1
  `;
  return rows[0]||null;
}

export async function ensureSourceReplyOutbox(input:SourceReplyOutboxInput){
  const candidateId=id('hsr');
  const inserted=await prisma.$queryRaw<SourceReplyOutboxRow[]>`
    INSERT INTO public."HipicoBotOutbox"
      ("id","eventId","recipient","targetType","message","intent","risk","status","createdAt","updatedAt")
    VALUES
      (${candidateId},${input.eventId},${input.recipient},'source_reply',${input.message},
       ${input.intent},${input.risk},'planned',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT ("eventId","targetType")
      WHERE "eventId" IS NOT NULL AND "targetType"='source_reply'
    DO NOTHING
    RETURNING
      "id","eventId","recipient","message","intent","risk","status",
      "providerMessageId","error","sentAt"
  `;
  if(inserted[0])return{row:inserted[0],inserted:true};
  const existing=await getSourceReplyOutbox(input.eventId);
  if(!existing)throw new Error('HIPICO_SOURCE_REPLY_OUTBOX_DEDUPE_ROW_MISSING');
  assertSourceReplyReplay(existing,input);
  return{row:existing,inserted:false};
}

const SOURCE_REPLY_DELIVERY_STATES=new Set(['sent','ambiguous']);

export async function recordSourceReplyDelivery(input:{
  id:string;
  status:'sent'|'ambiguous';
  providerMessageId?:string|null;
  error?:string|null;
}){
  if(!SOURCE_REPLY_DELIVERY_STATES.has(input.status))throw new Error('HIPICO_SOURCE_REPLY_STATUS_INVALID');
  const current=await prisma.$queryRaw<SourceReplyOutboxRow[]>`
    SELECT
      "id","eventId","recipient","message","intent","risk","status",
      "providerMessageId","error","sentAt"
    FROM public."HipicoBotOutbox"
    WHERE "id"=${input.id} AND "targetType"='source_reply'
    LIMIT 1
  `;
  const row=current[0];
  if(!row)throw Object.assign(new Error('HIPICO_SOURCE_REPLY_NOT_FOUND'),{code:'HIPICO_SOURCE_REPLY_NOT_FOUND'});
  if(row.status==='sent'){
    if(input.status!=='sent')throw Object.assign(new Error('HIPICO_SOURCE_REPLY_TERMINAL'),{code:'HIPICO_SOURCE_REPLY_TERMINAL'});
    return{...row,duplicate:true};
  }
  if(row.status!=='planned'&&row.status!=='ambiguous'){
    throw Object.assign(new Error('HIPICO_SOURCE_REPLY_STATUS_CONFLICT'),{code:'HIPICO_SOURCE_REPLY_STATUS_CONFLICT'});
  }
  const rows=await prisma.$queryRaw<SourceReplyOutboxRow[]>`
    UPDATE public."HipicoBotOutbox"
    SET
      "status"=${input.status},
      "providerMessageId"=${String(input.providerMessageId||'').trim()||null},
      "error"=${String(input.error||'').trim().slice(0,500)||null},
      "sentAt"=CASE WHEN ${input.status}='sent' THEN COALESCE("sentAt",CURRENT_TIMESTAMP) ELSE "sentAt" END,
      "updatedAt"=CURRENT_TIMESTAMP
    WHERE "id"=${input.id} AND "targetType"='source_reply' AND "status" IN ('planned','ambiguous')
    RETURNING
      "id","eventId","recipient","message","intent","risk","status",
      "providerMessageId","error","sentAt"
  `;
  if(!rows[0])throw Object.assign(new Error('HIPICO_SOURCE_REPLY_STATUS_CONFLICT'),{code:'HIPICO_SOURCE_REPLY_STATUS_CONFLICT'});
  return{...rows[0],duplicate:false};
}
