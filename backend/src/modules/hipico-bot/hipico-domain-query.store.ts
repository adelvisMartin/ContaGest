import { prisma } from '../../database/prisma.js';
import type { HipicoAggregateKind } from './hipico-domain-state.js';

type DomainReadInput={
  ownerId:string;
  groupKey:string;
  aggregateKind:HipicoAggregateKind;
  aggregateKey:string;
  limit?:number;
};

type AggregateReadRow={
  status:string;
  stateVersion:bigint|number;
  createdAt:Date;
  updatedAt:Date;
};

type DomainEventReadRow={
  id:string;
  sourceMessageId:string|null;
  sourceMessageKey:string;
  eventType:string;
  disposition:string;
  previousState:string;
  nextState:string;
  reason:string;
  originalEventId:string|null;
  normalizedPayload:unknown;
  actorRef:string|null;
  source:string|null;
  parserVersion:string|null;
  schemaVersion:number;
  eventTimestamp:Date;
  operatorConfirmed:boolean;
  confirmationReason:string|null;
};

export function normalizeDomainReadLimit(value:unknown){
  const numeric=Number(value);
  if(!Number.isFinite(numeric))return 50;
  return Math.max(1,Math.min(200,Math.trunc(numeric)));
}

export async function readHipicoDomainAggregate(input:DomainReadInput){
  const ownerId=String(input.ownerId||'').trim();
  const groupKey=String(input.groupKey||'').trim();
  const aggregateKey=String(input.aggregateKey||'').trim();
  if(!ownerId||!groupKey||!aggregateKey)throw new Error('HIPICO_DOMAIN_READ_SCOPE_REQUIRED');
  const limit=normalizeDomainReadLimit(input.limit);

  const aggregate=await prisma.$queryRaw<AggregateReadRow[]>`
    SELECT status,
           state_version AS "stateVersion",
           created_at AS "createdAt",
           updated_at AS "updatedAt"
    FROM public.hipico_domain_aggregates
    WHERE owner_id=${ownerId}::uuid
      AND group_key=${groupKey}
      AND aggregate_kind=${input.aggregateKind}
      AND aggregate_key=${aggregateKey}
    LIMIT 1
  `;
  if(!aggregate[0])return null;

  const events=await prisma.$queryRaw<DomainEventReadRow[]>`
    SELECT id,
           source_message_id AS "sourceMessageId",
           source_message_key AS "sourceMessageKey",
           event_type AS "eventType",
           disposition,
           previous_state AS "previousState",
           next_state AS "nextState",
           reason,
           original_event_id AS "originalEventId",
           normalized_payload AS "normalizedPayload",
           actor_ref AS "actorRef",
           source,
           parser_version AS "parserVersion",
           schema_version AS "schemaVersion",
           event_timestamp AS "eventTimestamp",
           operator_confirmed AS "operatorConfirmed",
           confirmation_reason AS "confirmationReason"
    FROM public.hipico_domain_events
    WHERE owner_id=${ownerId}::uuid
      AND group_key=${groupKey}
      AND aggregate_kind=${input.aggregateKind}
      AND aggregate_key=${aggregateKey}
    ORDER BY event_timestamp DESC,id DESC
    LIMIT ${limit}
  `;

  return{
    aggregate:{
      kind:input.aggregateKind,
      key:aggregateKey,
      groupKey,
      status:aggregate[0].status,
      stateVersion:Number(aggregate[0].stateVersion||0),
      createdAt:aggregate[0].createdAt,
      updatedAt:aggregate[0].updatedAt
    },
    events
  };
}
