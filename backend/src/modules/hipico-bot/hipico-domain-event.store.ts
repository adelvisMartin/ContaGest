import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
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
  sourceMessageId:string|null;rawMessage:string|null;actorRef:string|null;source:string|null;originalEventId:string|null;
};

function validTimestamp(value?:string){
  const date=value?new Date(value):new Date();
  if(!Number.isFinite(date.getTime()))throw new Error('HIPICO_INVALID_EVENT_TIMESTAMP');
  return date;
}
function sameNullable(left:unknown,right:unknown){return String(left??'')===String(right??'');}
function assertDomainReplay(existing:EventRow,event:HipicoDomainEventInput){
  const same=existing.eventType===event.type
    && sameNullable(existing.sourceMessageId,event.sourceMessageId)
    && sameNullable(existing.rawMessage,event.rawMessage)
    && sameNullable(existing.actorRef,event.actorRef)
    && sameNullable(existing.source,event.source||'system')
    && sameNullable(existing.originalEventId,event.originalEventId);
  if(!same){
    throw Object.assign(new Error('Domain replay changed immutable source facts for the same source message.'),{code:'HIPICO_DOMAIN_REPLAY_MISMATCH'});
  }
}

export async function persistHipicoDomainEvent(input:PersistInput){
  const ownerId=String(input.ownerId||'').trim();
  const groupKey=String(input.groupKey||'').trim();
  const aggregateKey=String(input.aggregateKey||'').trim();
  const sourceMessageKey=String(input.event.sourceMessageKey||'').trim();
  if(!ownerId||!groupKey||!aggregateKey||!sourceMessageKey)throw new Error('HIPICO_DOMAIN_EVENT_SCOPE_REQUIRED');

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
             source_message_id AS "sourceMessageId",raw_message AS "rawMessage",actor_ref AS "actorRef",source,
             original_event_id AS "originalEventId"
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
      const {eventType:_eventType,sourceMessageId:_sourceMessageId,rawMessage:_rawMessage,actorRef:_actorRef,source:_source,originalEventId:_originalEventId,...existing}=prior[0];
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
        actor_ref,source,parser_version,schema_version,event_timestamp
      ) VALUES (
        ${eventId},${ownerId}::uuid,${groupKey},${input.aggregateKind},${aggregateKey},${input.event.sourceMessageId||null},
        ${sourceMessageKey},${input.event.type},${reduction.disposition},${reduction.previousState},${reduction.nextState},
        ${reduction.reason},${input.event.originalEventId||null},${input.event.rawMessage||null},${normalized}::jsonb,
        ${input.event.actorRef||null},${input.event.source||'system'},${input.event.parserVersion||null},
        ${Number(input.event.schemaVersion||1)},${timestamp}
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

export const __test__={assertDomainReplay};
