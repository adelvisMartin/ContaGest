import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { canonicalPayloadIssue, canonicalTimestampIssue } from './hipico-canonical-input-policy.js';
import { initialHipicoState, reduceHipicoDomainEvent, type HipicoAggregateKind, type HipicoDomainEventInput, type HipicoState } from './hipico-domain-state.js';

type PersistInput={
  ownerId:string;
  groupKey:string;
  aggregateKind:HipicoAggregateKind;
  aggregateKey:string;
  event:HipicoDomainEventInput;
};

type AggregateRow={status:string;stateVersion:bigint|number};
type EventRow={
  id:string;eventType:string;disposition:string;previousState:string;nextState:string;reason:string;
  sourceMessageId:string|null;rawMessage:string|null;normalizedPayload:unknown;actorRef:string|null;source:string|null;
  parserVersion:string|null;schemaVersion:number;eventTimestamp:Date|string;originalEventId:string|null;
  operatorConfirmed:boolean;confirmationReason:string|null;
};
type PersistenceReadinessRow={
  aggregates:string|null;
  events:string|null;
  confirmationColumns:number;
  sourceIdentityConstraint:boolean;
  sourceIdentityIndex:boolean;
  aggregateFkReady:boolean;
  confirmationConstraintReady:boolean;
  immutableTriggerReady:boolean;
  aggregateRls:boolean;
  eventRls:boolean;
  authenticatedRoleReady:boolean;
  browserWritesRevoked:boolean;
};

const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boundedOptionalText(value:unknown,max:number){
  return value===undefined||value===null||String(value).length<=max;
}

function persistenceInputIssue(input:PersistInput){
  const ownerId=String(input.ownerId||'').trim();
  const groupKey=String(input.groupKey||'').trim();
  const aggregateKey=String(input.aggregateKey||'').trim();
  const sourceMessageKey=String(input.event?.sourceMessageKey||'').trim();
  if(!UUID_PATTERN.test(ownerId))return'HIPICO_DOMAIN_OWNER_INVALID';
  if(!['race','day'].includes(String(input.aggregateKind||'')))return'HIPICO_DOMAIN_AGGREGATE_KIND_INVALID';
  if(!groupKey||groupKey.length>120||!aggregateKey||aggregateKey.length>180||!sourceMessageKey||sourceMessageKey.length>320){
    return'HIPICO_DOMAIN_EVENT_SCOPE_REQUIRED';
  }
  if(!boundedOptionalText(input.event.sourceMessageId,320))return'HIPICO_DOMAIN_SOURCE_MESSAGE_ID_INVALID';
  if(!boundedOptionalText(input.event.rawMessage,4000))return'HIPICO_DOMAIN_RAW_MESSAGE_TOO_LARGE';
  if(!boundedOptionalText(input.event.actorRef,220))return'HIPICO_DOMAIN_ACTOR_REF_INVALID';
  if(!boundedOptionalText(input.event.source,120))return'HIPICO_DOMAIN_SOURCE_INVALID';
  if(!boundedOptionalText(input.event.parserVersion,120))return'HIPICO_DOMAIN_PARSER_VERSION_INVALID';
  if(!boundedOptionalText(input.event.eventId,180)||!boundedOptionalText(input.event.originalEventId,180))return'HIPICO_DOMAIN_EVENT_ID_INVALID';
  const schemaVersion=Number(input.event.schemaVersion??1);
  if(!Number.isInteger(schemaVersion)||schemaVersion<1||schemaVersion>1000)return'HIPICO_DOMAIN_SCHEMA_VERSION_INVALID';
  const payloadIssue=canonicalPayloadIssue(input.event.normalizedPayload);
  if(payloadIssue)return payloadIssue;
  if(typeof input.event.timestamp!=='string'||!input.event.timestamp.trim())return'HIPICO_EVENT_TIMESTAMP_REQUIRED';
  const timestampIssue=canonicalTimestampIssue(input.event.timestamp);
  if(timestampIssue)return timestampIssue;
  return null;
}

function validTimestamp(value:unknown){
  if(typeof value!=='string'||!value.trim())throw new Error('HIPICO_EVENT_TIMESTAMP_REQUIRED');
  const issue=canonicalTimestampIssue(value);
  if(issue)throw new Error(issue);
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error('HIPICO_EVENT_TIMESTAMP_INVALID');
  return date;
}
function normalizedInstant(value:unknown){
  const date=value instanceof Date?value:new Date(String(value||''));
  return Number.isFinite(date.getTime())?date.toISOString():null;
}
function canonicalJson(value:unknown):string{
  if(value===undefined||value===null)return'null';
  if(Array.isArray(value))return`[${value.map((item)=>canonicalJson(item)).join(',')}]`;
  if(typeof value==='object'){
    const record=value as Record<string,unknown>;
    return `{${Object.keys(record).filter((key)=>record[key]!==undefined).sort().map((key)=>`${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value)??'null';
}
function sameNullable(left:unknown,right:unknown){return String(left??'')===String(right??'');}
function confirmationAudit(event:HipicoDomainEventInput){
  const operatorConfirmed=event.operatorConfirmed===true;
  const reason=String(event.confirmationReason||'').trim();
  if(!operatorConfirmed&&reason)throw new Error('HIPICO_CONFIRMATION_FLAG_REQUIRED');
  if(operatorConfirmed&&(reason.length<5||reason.length>500))throw new Error('HIPICO_CONFIRMATION_REASON_REQUIRED');
  return{operatorConfirmed,confirmationReason:operatorConfirmed?reason:null};
}
function incomingRequiresReview(event:HipicoDomainEventInput){
  return Boolean(event.requiresReview||event.type==='AMBIGUOUS'||event.type==='UNKNOWN');
}
function persistedRequiresReview(existing:Pick<EventRow,'disposition'|'reason'>){
  return existing.disposition==='review'&&existing.reason==='AMBIGUOUS_OR_UNKNOWN';
}
function assertDomainReplay(existing:EventRow,event:HipicoDomainEventInput){
  const existingPayloadIssue=existing.normalizedPayload===undefined||existing.normalizedPayload===null
    ? null : canonicalPayloadIssue(existing.normalizedPayload);
  if(existingPayloadIssue)throw new Error('HIPICO_DOMAIN_PERSISTED_PAYLOAD_UNSAFE');
  const incomingPayloadIssue=event.normalizedPayload===undefined||event.normalizedPayload===null
    ? null : canonicalPayloadIssue(event.normalizedPayload);
  if(incomingPayloadIssue)throw new Error(incomingPayloadIssue);
  const existingTimestamp=normalizedInstant(existing.eventTimestamp);
  const incomingTimestamp=existingTimestamp&&typeof event.timestamp==='string'&&event.timestamp.trim()
    ? event.timestamp : null;
  const timestampIssue=incomingTimestamp?canonicalTimestampIssue(incomingTimestamp):null;
  if(timestampIssue)throw new Error(timestampIssue);
  const timestampMatches=!existingTimestamp||!incomingTimestamp||existingTimestamp===normalizedInstant(incomingTimestamp);
  const eventIdMatches=!event.eventId||existing.id===String(event.eventId);
  const confirmation=confirmationAudit(event);
  const same=existing.eventType===event.type
    && eventIdMatches
    && sameNullable(existing.sourceMessageId,event.sourceMessageId)
    && sameNullable(existing.rawMessage,event.rawMessage)
    && (existing.normalizedPayload===undefined||existing.normalizedPayload===null||canonicalJson(existing.normalizedPayload)===canonicalJson(event.normalizedPayload))
    && sameNullable(existing.actorRef,event.actorRef)
    && sameNullable(existing.source,event.source||'system')
    && (existing.parserVersion===undefined||sameNullable(existing.parserVersion,event.parserVersion))
    && (existing.schemaVersion===undefined||Number(existing.schemaVersion||1)===Number(event.schemaVersion||1))
    && timestampMatches
    && persistedRequiresReview(existing)===incomingRequiresReview(event)
    && Boolean(existing.operatorConfirmed)===confirmation.operatorConfirmed
    && sameNullable(existing.confirmationReason,confirmation.confirmationReason)
    && sameNullable(existing.originalEventId,event.originalEventId);
  if(!same){
    throw Object.assign(new Error('Domain replay changed immutable source facts for the same source message.'),{code:'HIPICO_DOMAIN_REPLAY_MISMATCH'});
  }
}

function unavailablePersistenceReadiness(){
  return{
    ready:false,
    tablesReady:false,
    confirmationAuditReady:false,
    sourceIdentityReady:false,
    aggregateFkReady:false,
    confirmationConstraintReady:false,
    immutableTriggerReady:false,
    rlsReady:false,
    authenticatedRoleReady:false,
    browserWritesRevoked:false
  };
}

export async function hipicoDomainPersistenceReadiness(){
  try{
    const rows=await prisma.$queryRaw<Array<PersistenceReadinessRow>>`
      SELECT
        to_regclass('public.hipico_domain_aggregates')::text AS "aggregates",
        to_regclass('public.hipico_domain_events')::text AS "events",
        (
          SELECT COUNT(*)::int
          FROM information_schema.columns
          WHERE table_schema='public'
            AND table_name='hipico_domain_events'
            AND column_name IN ('operator_confirmed','confirmation_reason')
        ) AS "confirmationColumns",
        EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid=to_regclass('public.hipico_domain_events')
            AND conname='hipico_domain_events_source_identity_unique'
            AND contype='u'
        ) AS "sourceIdentityConstraint",
        (to_regclass('public.hipico_domain_events_source_identity_v297') IS NOT NULL) AS "sourceIdentityIndex",
        EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid=to_regclass('public.hipico_domain_events')
            AND conname='hipico_domain_events_aggregate_fk'
            AND contype='f'
        ) AS "aggregateFkReady",
        EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid=to_regclass('public.hipico_domain_events')
            AND conname='hipico_domain_events_confirmation_audit_check'
            AND contype='c'
        ) AS "confirmationConstraintReady",
        EXISTS (
          SELECT 1
          FROM pg_trigger
          WHERE tgrelid=to_regclass('public.hipico_domain_events')
            AND tgname='hipico_domain_events_immutable'
            AND NOT tgisinternal
            AND tgenabled <> 'D'
        ) AS "immutableTriggerReady",
        COALESCE((
          SELECT relrowsecurity
          FROM pg_class
          WHERE oid=to_regclass('public.hipico_domain_aggregates')
        ),false) AS "aggregateRls",
        COALESCE((
          SELECT relrowsecurity
          FROM pg_class
          WHERE oid=to_regclass('public.hipico_domain_events')
        ),false) AS "eventRls",
        EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') AS "authenticatedRoleReady",
        CASE
          WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated')
            AND to_regclass('public.hipico_domain_aggregates') IS NOT NULL
            AND to_regclass('public.hipico_domain_events') IS NOT NULL
          THEN NOT (
            has_table_privilege('authenticated','public.hipico_domain_aggregates','INSERT')
            OR has_table_privilege('authenticated','public.hipico_domain_aggregates','UPDATE')
            OR has_table_privilege('authenticated','public.hipico_domain_aggregates','DELETE')
            OR has_table_privilege('authenticated','public.hipico_domain_events','INSERT')
            OR has_table_privilege('authenticated','public.hipico_domain_events','UPDATE')
            OR has_table_privilege('authenticated','public.hipico_domain_events','DELETE')
          )
          ELSE false
        END AS "browserWritesRevoked"
    `;
    const row=rows[0];
    const tablesReady=Boolean(row?.aggregates&&row?.events);
    const confirmationAuditReady=Number(row?.confirmationColumns||0)===2;
    const sourceIdentityReady=Boolean(row?.sourceIdentityConstraint||row?.sourceIdentityIndex);
    const aggregateFkReady=Boolean(row?.aggregateFkReady);
    const confirmationConstraintReady=Boolean(row?.confirmationConstraintReady);
    const immutableTriggerReady=Boolean(row?.immutableTriggerReady);
    const rlsReady=Boolean(row?.aggregateRls&&row?.eventRls);
    const authenticatedRoleReady=Boolean(row?.authenticatedRoleReady);
    const browserWritesRevoked=Boolean(row?.browserWritesRevoked);
    const ready=tablesReady
      &&confirmationAuditReady
      &&sourceIdentityReady
      &&aggregateFkReady
      &&confirmationConstraintReady
      &&immutableTriggerReady
      &&rlsReady
      &&authenticatedRoleReady
      &&browserWritesRevoked;
    return{
      ready,tablesReady,confirmationAuditReady,sourceIdentityReady,aggregateFkReady,
      confirmationConstraintReady,immutableTriggerReady,rlsReady,authenticatedRoleReady,browserWritesRevoked
    };
  }catch{
    return unavailablePersistenceReadiness();
  }
}

export async function persistHipicoDomainEvent(input:PersistInput){
  const issue=persistenceInputIssue(input);
  if(issue)throw new Error(issue);
  const ownerId=String(input.ownerId).trim();
  const groupKey=String(input.groupKey).trim();
  const aggregateKey=String(input.aggregateKey).trim();
  const sourceMessageKey=String(input.event.sourceMessageKey).trim();
  const confirmation=confirmationAudit(input.event);

  return prisma.$transaction(async(tx)=>{
    await tx.$executeRaw`
      INSERT INTO public.hipico_domain_aggregates(owner_id,group_key,aggregate_kind,aggregate_key,status,state_version)
      VALUES (${ownerId}::uuid,${groupKey},${input.aggregateKind},${aggregateKey},'PREPARING',0)
      ON CONFLICT (owner_id,group_key,aggregate_kind,aggregate_key) DO NOTHING
    `;
    const rows=await tx.$queryRaw<Array<AggregateRow>>`
      SELECT status, state_version AS "stateVersion"
      FROM public.hipico_domain_aggregates
      WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey}
        AND aggregate_kind=${input.aggregateKind} AND aggregate_key=${aggregateKey}
      FOR UPDATE
    `;
    if(rows.length!==1)throw new Error('HIPICO_DOMAIN_AGGREGATE_NOT_FOUND');

    const prior=await tx.$queryRaw<Array<EventRow>>`
      SELECT id,event_type AS "eventType",disposition,previous_state AS "previousState",next_state AS "nextState",reason,
             source_message_id AS "sourceMessageId",raw_message AS "rawMessage",normalized_payload AS "normalizedPayload",
             actor_ref AS "actorRef",source,parser_version AS "parserVersion",schema_version AS "schemaVersion",
             event_timestamp AS "eventTimestamp",original_event_id AS "originalEventId",
             operator_confirmed AS "operatorConfirmed",confirmation_reason AS "confirmationReason"
      FROM public.hipico_domain_events
      WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey}
        AND aggregate_kind=${input.aggregateKind} AND aggregate_key=${aggregateKey}
        AND source_message_key=${sourceMessageKey}
      ORDER BY event_timestamp ASC,id ASC
      LIMIT 2
    `;
    if(prior.length>1)throw new Error('HIPICO_DOMAIN_SOURCE_IDENTITY_CORRUPT');
    if(prior[0]){
      assertDomainReplay(prior[0],input.event);
      const {
        eventType:_eventType,sourceMessageId:_sourceMessageId,rawMessage:_rawMessage,normalizedPayload:_normalizedPayload,
        actorRef:_actorRef,source:_source,parserVersion:_parserVersion,schemaVersion:_schemaVersion,
        eventTimestamp:_eventTimestamp,originalEventId:_originalEventId,operatorConfirmed:_operatorConfirmed,
        confirmationReason:_confirmationReason,...existing
      }=prior[0];
      return{...existing,duplicate:true,stateChanged:false};
    }

    const row=rows[0];
    const current={
      ...initialHipicoState(input.aggregateKind),
      status:row.status as HipicoState,
      stateVersion:Number(row.stateVersion||0)
    };

    if(input.event.type==='CORRECTION'||input.event.type==='REVERSAL'){
      const originalId=String(input.event.originalEventId||'').trim();
      if(!originalId)throw new Error('HIPICO_ORIGINAL_EVENT_REQUIRED');
      const originals=await tx.$queryRaw<Array<{id:string}>>`
        SELECT id FROM public.hipico_domain_events
        WHERE id=${originalId} AND owner_id=${ownerId}::uuid AND group_key=${groupKey}
          AND aggregate_kind=${input.aggregateKind} AND aggregate_key=${aggregateKey}
        LIMIT 1
      `;
      if(!originals[0])throw new Error('HIPICO_ORIGINAL_EVENT_NOT_FOUND');
      if(input.event.type==='REVERSAL'){
        const reversals=await tx.$queryRaw<Array<{id:string}>>`
          SELECT id FROM public.hipico_domain_events
          WHERE original_event_id=${originalId} AND event_type='REVERSAL'
            AND owner_id=${ownerId}::uuid AND group_key=${groupKey}
            AND aggregate_kind=${input.aggregateKind} AND aggregate_key=${aggregateKey}
          LIMIT 1
        `;
        if(reversals[0])throw new Error('HIPICO_EVENT_ALREADY_REVERSED');
      }
    }

    const reduction=reduceHipicoDomainEvent(current,input.event);
    const eventId=String(input.event.eventId||crypto.randomUUID());
    const timestamp=validTimestamp(input.event.timestamp);
    const normalized=input.event.normalizedPayload==null?null:JSON.stringify(input.event.normalizedPayload);
    await tx.$executeRaw`
      INSERT INTO public.hipico_domain_events(
        id,owner_id,group_key,aggregate_kind,aggregate_key,source_message_id,source_message_key,event_type,
        disposition,previous_state,next_state,reason,original_event_id,raw_message,normalized_payload,
        actor_ref,source,parser_version,schema_version,event_timestamp,operator_confirmed,confirmation_reason
      ) VALUES (
        ${eventId},${ownerId}::uuid,${groupKey},${input.aggregateKind},${aggregateKey},${input.event.sourceMessageId||null},
        ${sourceMessageKey},${input.event.type},${reduction.disposition},${reduction.previousState},${reduction.nextState},
        ${reduction.reason},${input.event.originalEventId||null},${input.event.rawMessage||null},${normalized}::jsonb,
        ${input.event.actorRef||null},${input.event.source||'system'},${input.event.parserVersion||null},
        ${Number(input.event.schemaVersion||1)},${timestamp},${confirmation.operatorConfirmed},${confirmation.confirmationReason}
      )
    `;

    if(reduction.disposition==='applied'){
      const affected=await tx.$executeRaw`
        UPDATE public.hipico_domain_aggregates
        SET status=${reduction.nextState}, state_version=state_version+1, updated_at=now()
        WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey}
          AND aggregate_kind=${input.aggregateKind} AND aggregate_key=${aggregateKey}
          AND state_version=${current.stateVersion}
      `;
      if(affected!==1)throw new Error('HIPICO_DOMAIN_STATE_CONFLICT');
    }

    return{
      id:eventId,
      disposition:reduction.disposition,
      previousState:reduction.previousState,
      nextState:reduction.nextState,
      reason:reduction.reason,
      duplicate:false,
      stateChanged:reduction.disposition==='applied'
    };
  });
}

export const __test__={
  assertDomainReplay,canonicalJson,normalizedInstant,confirmationAudit,incomingRequiresReview,
  persistedRequiresReview,unavailablePersistenceReadiness,persistenceInputIssue,validTimestamp
};
