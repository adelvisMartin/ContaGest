import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { OPERATIONAL_INTENTS, type IntentResult } from './hipico-operational-classifier.js';
import { operationalRaceContextKey } from './hipico-race-context-key.js';
import { assertReplayMatch, canonicalReplaySignature } from './hipico-replay-integrity.js';

type CanonicalChannel={id:string;ownerId:string;groupKey:string;label:string};
type CanonicalPersistInput={
  groupName:string;
  channelKey?:string;
  labChannelKey?:string;
  channelRole:'source'|'lab';
  providerMessageId:string;
  sender:string;
  senderLabel:string;
  fromMe:boolean;
  sentAt:string;
  messageType:string;
  mediaKind?:string;
  mediaName?:string;
  historySync?:boolean;
  body:string;
  quotedExternalMessageId:string|null;
  bridgeVersion:string;
  rawMeta:string;
  transportEventId:string;
  result:IntentResult;
};

type PersistedCanonicalSource={
  id:string;
  sender:string|null;
  sentAt:Date|string|null;
  messageType:string|null;
  body:string|null;
  quotedExternalMessageId:string|null;
};

const sha256=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
const PREDICTION_TYPE='operational_classification';
const OFFICIAL_SOURCE_CHANNEL_KEY=String(process.env.HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY||'club-hipico-triple-crown-official').trim();
const DEFAULT_LAB_CHANNEL_KEY=String(process.env.HIPICO_LAB_CHANNEL_KEY||'control-hipico-lab').trim();

export async function canonicalShadowReadiness(){
  const tables=await prisma.$queryRaw<Array<{
    channels:string|null;
    messages:string|null;
    operations:string|null;
    evaluations:string|null;
  }>>`
    SELECT
      to_regclass('public.hipico_bot_channels')::text AS "channels",
      to_regclass('public.hipico_messages')::text AS "messages",
      to_regclass('public.hipico_operation_events')::text AS "operations",
      to_regclass('public.hipico_shadow_evaluations')::text AS "evaluations"
  `;
  const schemaReady=Boolean(
    tables[0]?.channels&&tables[0]?.messages&&tables[0]?.operations&&tables[0]?.evaluations
  );
  if(!schemaReady)return{ready:false,schemaReady:false,labChannelCount:0};
  const labRows=await prisma.$queryRaw<Array<{count:bigint}>>`
    SELECT COUNT(*)::bigint AS "count"
    FROM public.hipico_bot_channels
    WHERE group_key=${DEFAULT_LAB_CHANNEL_KEY}
      AND channel_type='web_bridge'
      AND status='active'
  `;
  const labChannelCount=Number(labRows[0]?.count||0);
  return{ready:labChannelCount===1,schemaReady:true,labChannelCount};
}

export function groupKeyFromName(value:string){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,120);
}

async function findActiveWebBridge(groupKey:string):Promise<CanonicalChannel[]>{
  return prisma.$queryRaw<Array<{id:string;ownerId:string;groupKey:string;label:string}>>`
    SELECT id::text AS "id", owner_id::text AS "ownerId", group_key AS "groupKey", label
    FROM public.hipico_bot_channels
    WHERE group_key=${groupKey}
      AND channel_type='web_bridge'
      AND status='active'
    LIMIT 2
  `;
}

async function ensureOfficialSourceChannel(groupName:string, sourceKey:string, labKey:string):Promise<CanonicalChannel>{
  if(sourceKey!==OFFICIAL_SOURCE_CHANNEL_KEY)throw new Error('HIPICO_SOURCE_CHANNEL_KEY_NOT_ALLOWED');
  const labRows=await findActiveWebBridge(labKey);
  if(labRows.length!==1)throw new Error(labRows.length===0?'HIPICO_LAB_CHANNEL_NOT_FOUND':'HIPICO_LAB_CHANNEL_AMBIGUOUS');
  const lab=labRows[0];
  const config={
    mode:'source_read_only',
    purpose:'official_live_and_history_shadow_training',
    auto_send:false,
    mirror_lab_channel_key:labKey
  };
  const inserted=await prisma.$queryRaw<Array<{id:string;ownerId:string;groupKey:string;label:string}>>`
    INSERT INTO public.hipico_bot_channels (owner_id,group_key,label,channel_type,status,config)
    VALUES (${lab.ownerId}::uuid,${sourceKey},${String(groupName||'CLUB HIPICO TRIPLE CROWN').slice(0,220)},'web_bridge','active',${JSON.stringify(config)}::jsonb)
    ON CONFLICT (owner_id,group_key) DO NOTHING
    RETURNING id::text AS "id",owner_id::text AS "ownerId",group_key AS "groupKey",label
  `;
  if(inserted.length===1)return inserted[0];

  // A disabled/incompatible channel is an administrative decision. Ingest must
  // never turn it active again implicitly. The only benign conflict is a
  // concurrent request that created the same active web_bridge first.
  const existing=await prisma.$queryRaw<Array<{id:string;ownerId:string;groupKey:string;label:string;status:string;channelType:string}>>`
    SELECT id::text AS "id",owner_id::text AS "ownerId",group_key AS "groupKey",label,status,channel_type AS "channelType"
    FROM public.hipico_bot_channels
    WHERE owner_id=${lab.ownerId}::uuid AND group_key=${sourceKey}
    LIMIT 2
  `;
  if(existing.length!==1)throw new Error('HIPICO_SOURCE_CHANNEL_PROVISION_FAILED');
  if(existing[0].status!=='active'||existing[0].channelType!=='web_bridge'){
    throw new Error('HIPICO_SOURCE_CHANNEL_DISABLED_OR_INCOMPATIBLE');
  }
  return existing[0];
}

async function resolveChannel(input:Pick<CanonicalPersistInput,'groupName'|'channelKey'|'labChannelKey'|'channelRole'>):Promise<CanonicalChannel>{
  const groupKey=String(input.channelKey||groupKeyFromName(input.groupName)).trim();
  if(!groupKey)throw new Error('HIPICO_CANONICAL_GROUP_KEY_EMPTY');
  const rows=await findActiveWebBridge(groupKey);
  if(rows.length===1)return rows[0];
  if(rows.length>1)throw new Error('HIPICO_CANONICAL_CHANNEL_AMBIGUOUS');
  if(input.channelRole==='source'){
    return ensureOfficialSourceChannel(input.groupName,groupKey,String(input.labChannelKey||DEFAULT_LAB_CHANNEL_KEY).trim());
  }
  throw new Error('HIPICO_CANONICAL_CHANNEL_NOT_FOUND');
}

function eventType(intent:string){
  const map:Record<string,string>={
    offer_player:'offer',
    offer_receiver:'counteroffer',
    offer_confirmation:'confirmation',
    pending_confirmation:'confirmation',
    race_open:'race_open',
    race_close:'race_close',
    day_close:'day_close',
    race_result:'result',
    plan_snapshot:'plan_snapshot',
    settlement_snapshot:'settlement_snapshot',
    balance_snapshot:'balance_snapshot',
    cancel_or_correction:'manual_review',
    polla_or_parley:'manual_review',
    betting_or_balance:'manual_review'
  };
  return map[intent]||'other';
}

function raceKey(result:IntentResult){
  return operationalRaceContextKey(result.entities);
}

function amountOf(result:IntentResult){
  const value=Number(result.entities?.amount);
  return Number.isFinite(value)?value:null;
}

function canonicalInputSignature(input:CanonicalPersistInput){
  return canonicalReplaySignature({
    sender:input.sender,
    sentAt:input.sentAt,
    messageType:input.messageType||'text',
    body:input.body,
    quotedExternalMessageId:input.quotedExternalMessageId
  });
}

function assertCanonicalReplay(existing:PersistedCanonicalSource,input:CanonicalPersistInput){
  const persisted=canonicalReplaySignature(existing);
  assertReplayMatch('canonical',persisted,canonicalInputSignature(input));
}

async function readCanonicalSource(ownerId:string,groupKey:string,providerMessageId:string){
  const rows=await prisma.$queryRaw<PersistedCanonicalSource[]>`
    SELECT
      id::text AS "id",
      sender_id AS "sender",
      sent_at AS "sentAt",
      message_type AS "messageType",
      raw_text AS "body",
      quoted_external_message_id AS "quotedExternalMessageId"
    FROM public.hipico_messages
    WHERE owner_id=${ownerId}::uuid
      AND channel_key=${groupKey}
      AND external_message_id=${providerMessageId}
    LIMIT 1
  `;
  return rows[0]||null;
}

async function immutableCanonicalMessage(
  channel:CanonicalChannel,
  input:CanonicalPersistInput,
  fingerprint:string,
  normalized:Record<string,unknown>,
  metadata:Record<string,unknown>,
  sentAt:Date|null
){
  const messageRows=await prisma.$queryRaw<Array<{id:string}>>`
    INSERT INTO public.hipico_messages
      (owner_id,channel_id,channel_key,external_message_id,fingerprint,sender_id,sender_label,sender_role,
       quoted_external_message_id,sent_at,message_type,raw_text,classification,confidence,processing_status,
       normalized,metadata)
    VALUES
      (${channel.ownerId}::uuid,${channel.id}::uuid,${channel.groupKey},${input.providerMessageId},${fingerprint},
       ${input.sender||null},${input.senderLabel||null},'unknown',${input.quotedExternalMessageId||null},${sentAt},
       ${input.messageType||'text'},${input.body||''},${input.result.intent},${Number(input.result.confidence||0)},
       'processed',${JSON.stringify(normalized)}::jsonb,${JSON.stringify(metadata)}::jsonb)
    ON CONFLICT (owner_id,channel_key,external_message_id) WHERE external_message_id IS NOT NULL
    DO NOTHING
    RETURNING id::text AS "id"
  `;
  if(messageRows[0]?.id)return{messageId:messageRows[0].id,inserted:true};

  const existing=await readCanonicalSource(channel.ownerId,channel.groupKey,input.providerMessageId);
  if(!existing?.id)throw new Error('HIPICO_CANONICAL_DEDUPE_ROW_MISSING');
  assertCanonicalReplay(existing,input);
  return{messageId:existing.id,inserted:false};
}

async function immutableOperationEvent(
  channel:CanonicalChannel,
  input:CanonicalPersistInput,
  messageId:string,
  normalized:Record<string,unknown>
){
  const opType=eventType(input.result.intent);
  const eventKey=`shadow:${input.providerMessageId}`;
  const opPayload={
    shadow:true,
    source:'whatsapp-web-bridge',
    channelRole:input.channelRole,
    historySync:Boolean(input.historySync),
    intent:input.result.intent,
    risk:input.result.risk,
    reason:input.result.reason,
    entities:normalized,
    suggestion:input.result.suggestion,
    autoEligible:false
  };
  const inserted=await prisma.$queryRaw<Array<{id:string}>>`
    INSERT INTO public.hipico_operation_events
      (owner_id,group_key,source_message_id,event_key,event_type,event_state,race_key,participant_code,
       product_type,amount,currency,confidence,payload)
    VALUES
      (${channel.ownerId}::uuid,${channel.groupKey},${messageId}::uuid,${eventKey},${opType},'pending',
       ${raceKey(input.result)},${input.sender||null},${input.result.entities?.play||null},${amountOf(input.result)},
       ${null},${Number(input.result.confidence||0)},${JSON.stringify(opPayload)}::jsonb)
    ON CONFLICT (owner_id,event_key) DO NOTHING
    RETURNING id::text AS "id"
  `;
  if(inserted[0]?.id)return inserted[0].id;
  const existing=await prisma.$queryRaw<Array<{id:string}>>`
    SELECT id::text AS "id"
    FROM public.hipico_operation_events
    WHERE owner_id=${channel.ownerId}::uuid AND event_key=${eventKey}
    LIMIT 1
  `;
  if(!existing[0]?.id)throw new Error('HIPICO_OPERATION_EVENT_DEDUPE_ROW_MISSING');
  return existing[0].id;
}

export async function persistCanonicalShadow(input:CanonicalPersistInput){
  const channel=await resolveChannel(input);
  const normalized=input.result.entities||{};
  const fingerprint=sha256([channel.groupKey,input.providerMessageId,input.sender,input.sentAt,input.body].join('|'));
  const metadata={
    source:'official_web_playwright',
    mode:'shadow_only',
    bridgeVersion:input.bridgeVersion,
    transportEventId:input.transportEventId,
    channelRole:input.channelRole,
    labChannelKey:input.labChannelKey||null,
    historySync:Boolean(input.historySync),
    mediaKind:input.mediaKind||'none',
    mediaName:input.mediaName||null,
    risk:input.result.risk,
    reason:input.result.reason,
    fromMe:input.fromMe,
    rawMeta:input.rawMeta
  };
  const sentAt=input.sentAt?new Date(input.sentAt):null;

  // The source message is an immutable audit fact. Replays may fill a previous
  // partial write, but can never rewrite the first persisted sender/body/time.
  const message=await immutableCanonicalMessage(channel,input,fingerprint,normalized,metadata,sentAt);
  const messageId=message.messageId;

  let operationEventId:string|null=null;
  if(OPERATIONAL_INTENTS.has(input.result.intent)){
    // The first operational interpretation remains immutable too. Shadow
    // evaluations below may be refreshed independently for model comparison.
    operationEventId=await immutableOperationEvent(channel,input,messageId,normalized);
  }

  const labGroupKey=String(input.labChannelKey||channel.groupKey).trim();
  const scenarioKey=input.historySync?'official-history-to-lab-v1':input.channelRole==='source'?'official-source-to-lab-v1':'real-operativa-shadow-v1';
  const prediction={
    shadow:true,
    channelRole:input.channelRole,
    historySync:Boolean(input.historySync),
    intent:input.result.intent,
    risk:input.result.risk,
    confidence:input.result.confidence,
    reason:input.result.reason,
    entities:normalized,
    operationEventId
  };
  const notes=input.historySync
    ?'Prediccion historica del grupo oficial; solo dataset shadow, sin respuesta LAB ni efecto operativo.'
    :input.channelRole==='source'
      ?'Prediccion del grupo oficial para validacion en laboratorio; sin efecto operativo.'
      :'Prediccion generada en laboratorio; sin efecto operativo.';
  const shadowRows=await prisma.$queryRaw<Array<{id:string}>>`
    INSERT INTO public.hipico_shadow_evaluations
      (owner_id,source_group_key,lab_group_key,source_message_id,source_external_message_id,scenario_key,
       prediction_type,predicted_payload,match_status,notes)
    VALUES
      (${channel.ownerId}::uuid,${channel.groupKey},${labGroupKey},${messageId}::uuid,${input.providerMessageId},
       ${scenarioKey},${PREDICTION_TYPE},${JSON.stringify(prediction)}::jsonb,'pending',${notes})
    ON CONFLICT (owner_id,source_group_key,source_external_message_id,prediction_type)
    DO UPDATE SET
      source_message_id=EXCLUDED.source_message_id,
      lab_group_key=EXCLUDED.lab_group_key,
      scenario_key=EXCLUDED.scenario_key,
      predicted_payload=EXCLUDED.predicted_payload,
      predicted_at=now(),
      match_status='pending',
      notes=EXCLUDED.notes
    RETURNING id::text AS "id"
  `;

  return{
    channelId:channel.id,
    groupKey:channel.groupKey,
    channelRole:input.channelRole,
    historySync:Boolean(input.historySync),
    labGroupKey,
    messageId,
    operationEventId,
    shadowEvaluationId:shadowRows[0]?.id||null,
    sourceInserted:message.inserted
  };
}

export const __test__={canonicalInputSignature,assertCanonicalReplay};
