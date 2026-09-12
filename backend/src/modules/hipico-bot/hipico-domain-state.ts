export type HipicoAggregateKind='race'|'day';
export type HipicoDisposition='applied'|'evidence_only'|'duplicate'|'review'|'rejected';

export const RACE_STATES=['PREPARING','OPEN','CLOSED','RESULT_RECEIVED','SETTLEMENT_READY','SETTLED','BALANCED','PUBLISHED','ARCHIVED'] as const;
export const DAY_STATES=['PREPARING','OPEN','CLOSING','CLOSED','ARCHIVED'] as const;
export type HipicoRaceState=typeof RACE_STATES[number];
export type HipicoDayState=typeof DAY_STATES[number];
export type HipicoState=HipicoRaceState|HipicoDayState;

export type HipicoDomainEventType=
  |'PLAN_RECORDED'|'RACE_OPENED'|'BET_RECORDED'|'RACE_CLOSED'|'RESULT_RECORDED'
  |'SETTLEMENT_READY'|'SETTLEMENT_RECORDED'|'BALANCE_CONFIRMED'|'RACE_PUBLISHED'|'RACE_ARCHIVED'
  |'DAY_OPENED'|'DAY_CLOSING'|'DAY_CLOSED'|'DAY_ARCHIVED'
  |'CORRECTION'|'REVERSAL'|'AMBIGUOUS'|'UNKNOWN';

export type HipicoDomainEventInput={
  type:HipicoDomainEventType;
  sourceMessageKey:string;
  eventId?:string;
  sourceMessageId?:string|null;
  rawMessage?:string|null;
  normalizedPayload?:unknown;
  actorRef?:string|null;
  source?:string;
  parserVersion?:string|null;
  schemaVersion?:number;
  timestamp?:string;
  originalEventId?:string|null;
  requiresReview?:boolean;
  operatorConfirmed?:boolean;
  confirmationReason?:string|null;
};

export type HipicoReducerState={
  kind:HipicoAggregateKind;
  status:HipicoState;
  stateVersion:number;
  seenSourceMessageKeys:ReadonlySet<string>;
};

export type HipicoReduction={
  state:HipicoReducerState;
  disposition:HipicoDisposition;
  previousState:HipicoState;
  nextState:HipicoState;
  reason:string;
};

const RACE_TRANSITIONS:Record<HipicoRaceState,ReadonlySet<HipicoRaceState>>={
  PREPARING:new Set<HipicoRaceState>(['OPEN','CLOSED']),
  OPEN:new Set<HipicoRaceState>(['CLOSED']),
  CLOSED:new Set<HipicoRaceState>(['RESULT_RECEIVED']),
  RESULT_RECEIVED:new Set<HipicoRaceState>(['SETTLEMENT_READY']),
  SETTLEMENT_READY:new Set<HipicoRaceState>(['SETTLED']),
  SETTLED:new Set<HipicoRaceState>(['BALANCED','PUBLISHED']),
  BALANCED:new Set<HipicoRaceState>(['PUBLISHED']),
  PUBLISHED:new Set<HipicoRaceState>(['ARCHIVED']),
  ARCHIVED:new Set<HipicoRaceState>()
};

const DAY_TRANSITIONS:Record<HipicoDayState,ReadonlySet<HipicoDayState>>={
  PREPARING:new Set<HipicoDayState>(['OPEN']),
  OPEN:new Set<HipicoDayState>(['CLOSING']),
  CLOSING:new Set<HipicoDayState>(['CLOSED']),
  CLOSED:new Set<HipicoDayState>(['ARCHIVED']),
  ARCHIVED:new Set<HipicoDayState>()
};

const RACE_TARGET:Partial<Record<HipicoDomainEventType,HipicoRaceState>>={
  PLAN_RECORDED:'OPEN',RACE_OPENED:'OPEN',RACE_CLOSED:'CLOSED',RESULT_RECORDED:'RESULT_RECEIVED',
  SETTLEMENT_READY:'SETTLEMENT_READY',SETTLEMENT_RECORDED:'SETTLED',BALANCE_CONFIRMED:'BALANCED',
  RACE_PUBLISHED:'PUBLISHED',RACE_ARCHIVED:'ARCHIVED'
};
const DAY_TARGET:Partial<Record<HipicoDomainEventType,HipicoDayState>>={
  DAY_OPENED:'OPEN',DAY_CLOSING:'CLOSING',DAY_CLOSED:'CLOSED',DAY_ARCHIVED:'ARCHIVED'
};
const EVIDENCE_ONLY=new Set<HipicoDomainEventType>(['BET_RECORDED','CORRECTION','REVERSAL']);

export function initialHipicoState(kind:HipicoAggregateKind):HipicoReducerState{
  return{kind,status:'PREPARING',stateVersion:0,seenSourceMessageKeys:new Set<string>()};
}

export function canHipicoTransition(kind:HipicoAggregateKind,from:HipicoState,to:HipicoState){
  return kind==='race'
    ?Boolean(RACE_TRANSITIONS[from as HipicoRaceState]?.has(to as HipicoRaceState))
    :Boolean(DAY_TRANSITIONS[from as HipicoDayState]?.has(to as HipicoDayState));
}

export function reduceHipicoDomainEvent(current:HipicoReducerState,event:HipicoDomainEventInput):HipicoReduction{
  const key=String(event.sourceMessageKey||'').trim();
  if(!key)throw new Error('HIPICO_SOURCE_MESSAGE_KEY_REQUIRED');
  const previousState=current.status;
  if(current.seenSourceMessageKeys.has(key)){
    return{state:current,disposition:'duplicate',previousState,nextState:previousState,reason:'DUPLICATE_SOURCE_MESSAGE'};
  }
  const seen=new Set<string>(current.seenSourceMessageKeys);seen.add(key);
  const withSeen:HipicoReducerState={...current,seenSourceMessageKeys:seen};

  if(event.type==='AMBIGUOUS'||event.type==='UNKNOWN'||event.requiresReview){
    return{state:withSeen,disposition:'review',previousState,nextState:previousState,reason:'AMBIGUOUS_OR_UNKNOWN'};
  }
  if(EVIDENCE_ONLY.has(event.type)){
    return{state:withSeen,disposition:'evidence_only',previousState,nextState:previousState,reason:'APPEND_ONLY_EVIDENCE'};
  }
  const target=current.kind==='race'?RACE_TARGET[event.type]:DAY_TARGET[event.type];
  if(!target){
    return{state:withSeen,disposition:'review',previousState,nextState:previousState,reason:'EVENT_NOT_VALID_FOR_AGGREGATE'};
  }
  if(target===previousState){
    return{state:withSeen,disposition:'evidence_only',previousState,nextState:previousState,reason:'SAME_STATE_EVIDENCE'};
  }
  if(!canHipicoTransition(current.kind,previousState,target)){
    return{state:withSeen,disposition:'rejected',previousState,nextState:previousState,reason:'OUT_OF_ORDER_OR_INVALID_TRANSITION'};
  }
  return{
    state:{...withSeen,status:target,stateVersion:current.stateVersion+1},
    disposition:'applied',previousState,nextState:target,reason:'VALID_TRANSITION'
  };
}

export function mapOperationalIntentToDomainEvent(intent:string):HipicoDomainEventType{
  const map:Record<string,HipicoDomainEventType>={
    plan_snapshot:'PLAN_RECORDED',race_open:'RACE_OPENED',race_close:'RACE_CLOSED',race_result:'RESULT_RECORDED',
    settlement_snapshot:'SETTLEMENT_RECORDED',balance_snapshot:'BALANCE_CONFIRMED',day_close:'DAY_CLOSED'
  };
  return map[String(intent||'')]||'UNKNOWN';
}
