import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { OPERATIONAL_INTENTS, type IntentResult } from './hipico-operational-classifier.js';

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
  const rows=await prisma.$queryRaw<Array<{id:string;ownerId:string;groupKey:string;label:string}>>`
    INSERT INTO public.hipico_bot_channels (owner_id,group_key,label,channel_type,status,config)
    VALUES (${lab.ownerId}::uuid,${sourceKey},${String(groupName||'CLUB HIPICO TRIPLE CROWN').slice(0,220)},'web_bridge','active',${JSON.stringify(config)}::jsonb)
    ON CONFLICT (owner_id,group_key)
    DO UPDATE SET
      label=EXCLUDED.label,
      channel_type='web_bridge',
      status='active',
      config=EXCLUDED.config,
      updated_at=now()
    RETURNING id::text AS "id",owner_id::text AS "ownerId",group_key AS "groupKey",label
  `;
  if(rows.length!==1)throw new Error('HIPICO_SOURCE_CHANNEL_PROVISION_FAILED');
  return rows[0];
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
  const number=Number(result.entities?.raceNumber);
  return Number.isFinite(number)&&number>0?`race:${Math.trunc(number)}`:null;
}

function amountOf(result:IntentResult){
  const value=Number(result.entities?.amount);
  return Number.isFinite(value)?value:null;
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
    DO UPDATE SET
      sender_id=EXCLUDED.sender_id,
      sender_label=EXCLUDED.sender_label,
      quoted_external_message_id=EXCLUDED.quoted_external_message_id,
      sent_at=EXCLUDED.sent_at,
      message_type=EXCLUDED.message_type,
      raw_text=EXCLUDED.raw_text,
      classification=EXCLUDED.classification,
      confidence=EXCLUDED.confidence,
      processing_status='processed',
      normalized=EXCLUDED.normalized,
      metadata=EXCLUDED.metadata
    RETURNING id::text AS "id"
  `;
  const messageId=messageRows[0]?.id;
  if(!messageId)throw new Error('HIPICO_CANONICAL_MESSAGE_NOT_PERSISTED');

  let operationEventId:string|null=null;
  if(OPERATIONAL_INTENTS.has(input.result.intent)){
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
    const opRows=await prisma.$queryRaw<Array<{id:string}>>`
      INSERT INTO public.hipico_operation_events
        (owner_id,group_key,source_message_id,event_key,event_type,event_state,race_key,participant_code,
         product_type,amount,currency,confidence,payload)
      VALUES
        (${channel.ownerId}::uuid,${channel.groupKey},${messageId}::uuid,${eventKey},${opType},'pending',
         ${raceKey(input.result)},${input.sender||null},${input.result.entities?.play||null},${amountOf(input.result)},
         ${null},${Number(input.result.confidence||0)},${JSON.stringify(opPayload)}::jsonb)
      ON CONFLICT (owner_id,event_key)
      DO UPDATE SET
        source_message_id=EXCLUDED.source_message_id,
        event_type=EXCLUDED.event_type,
        event_state='pending',
        race_key=EXCLUDED.race_key,
        participant_code=EXCLUDED.participant_code,
        product_type=EXCLUDED.product_type,
        amount=EXCLUDED.amount,
        confidence=EXCLUDED.confidence,
        payload=EXCLUDED.payload
      RETURNING id::text AS "id"
    `;
    operationEventId=opRows[0]?.id||null;
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
    shadowEvaluationId:shadowRows[0]?.id||null
  };
}
