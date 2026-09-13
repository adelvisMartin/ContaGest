export const RACE_LIFECYCLE_STATES = [
  'DISCOVERED','ANNOUNCED','OPEN','CLOSING','CLOSED','RUNNING','PROVISIONAL_RESULT','OFFICIAL_RESULT','ARCHIVED',
  'POSTPONED','CANCELLED','SUSPENDED'
] as const;
export type RaceLifecycleState=typeof RACE_LIFECYCLE_STATES[number];

export const RACE_COMMANDS = [
  'DISCOVER','ANNOUNCE','OPEN','BEGIN_CLOSING','CLOSE','START','RECORD_PROVISIONAL_RESULT','MARK_OFFICIAL_RESULT','ARCHIVE',
  'POSTPONE','CANCEL','SUSPEND','RESUME'
] as const;
export type RaceCommand=typeof RACE_COMMANDS[number];
export type RaceActorType='operator'|'agent'|'system';
export type EvidenceAuthority='official'|'trusted'|'operator'|'group_evidence'|'unknown';

export type RaceEvidence={source:string;authority:EvidenceAuthority;confidence:number;reference?:string|null};
export type RaceCommandInput={
  command:RaceCommand;
  expectedState:RaceLifecycleState;
  requestId:string;
  actorId:string;
  actorType:RaceActorType;
  correlationId:string;
  evidence?:RaceEvidence[];
  payload?:Record<string,unknown>;
};

export type RaceTransition={
  allowed:boolean;
  from:RaceLifecycleState;
  to:RaceLifecycleState;
  reason:string;
  resultStage:'none'|'observed'|'provisional'|'verified'|'official';
};

const DIRECT:Record<RaceLifecycleState,Partial<Record<RaceCommand,RaceLifecycleState>>>={
  DISCOVERED:{ANNOUNCE:'ANNOUNCED',OPEN:'OPEN',POSTPONE:'POSTPONED',CANCEL:'CANCELLED',SUSPEND:'SUSPENDED'},
  ANNOUNCED:{OPEN:'OPEN',POSTPONE:'POSTPONED',CANCEL:'CANCELLED',SUSPEND:'SUSPENDED'},
  OPEN:{BEGIN_CLOSING:'CLOSING',CLOSE:'CLOSED',POSTPONE:'POSTPONED',CANCEL:'CANCELLED',SUSPEND:'SUSPENDED'},
  CLOSING:{CLOSE:'CLOSED',SUSPEND:'SUSPENDED',CANCEL:'CANCELLED'},
  CLOSED:{START:'RUNNING',RECORD_PROVISIONAL_RESULT:'PROVISIONAL_RESULT',SUSPEND:'SUSPENDED',CANCEL:'CANCELLED'},
  RUNNING:{RECORD_PROVISIONAL_RESULT:'PROVISIONAL_RESULT',SUSPEND:'SUSPENDED',CANCEL:'CANCELLED'},
  PROVISIONAL_RESULT:{MARK_OFFICIAL_RESULT:'OFFICIAL_RESULT',SUSPEND:'SUSPENDED'},
  OFFICIAL_RESULT:{ARCHIVE:'ARCHIVED'},
  ARCHIVED:{},
  POSTPONED:{RESUME:'ANNOUNCED',CANCEL:'CANCELLED'},
  CANCELLED:{ARCHIVE:'ARCHIVED'},
  SUSPENDED:{RESUME:'ANNOUNCED',CANCEL:'CANCELLED'}
};

function strongEvidence(evidence:RaceEvidence[]){
  return evidence.filter((item)=>
    (item.authority==='official'||item.authority==='trusted')&&Number(item.confidence)>=0.8&&String(item.source||'').trim()
  );
}

function independentEvidenceCount(evidence:RaceEvidence[]){
  return new Set(strongEvidence(evidence).map((item)=>item.source)).size;
}

function officialEvidence(evidence:RaceEvidence[]){
  return evidence.some((item)=>item.authority==='official'&&Number(item.confidence)>=0.9&&String(item.source||'').trim());
}

export function resultStageForRaceState(state:RaceLifecycleState):RaceTransition['resultStage']{
  if(state==='PROVISIONAL_RESULT')return 'provisional';
  if(state==='OFFICIAL_RESULT'||state==='ARCHIVED')return 'official';
  return 'none';
}

export function evaluateRaceCommand(current:RaceLifecycleState,input:RaceCommandInput):RaceTransition{
  if(input.expectedState!==current)return{allowed:false,from:current,to:current,reason:'EXPECTED_STATE_MISMATCH',resultStage:resultStageForRaceState(current)};
  const target=DIRECT[current]?.[input.command];
  if(!target)return{allowed:false,from:current,to:current,reason:'INVALID_TRANSITION',resultStage:resultStageForRaceState(current)};
  const evidence=input.evidence||[];
  if(input.command==='OPEN'&&input.actorType!=='operator'&&independentEvidenceCount(evidence)<2){
    return{allowed:false,from:current,to:current,reason:'OPEN_REQUIRES_CORROBORATED_EVIDENCE',resultStage:resultStageForRaceState(current)};
  }
  if(input.command==='MARK_OFFICIAL_RESULT'&&!officialEvidence(evidence)){
    return{allowed:false,from:current,to:current,reason:'OFFICIAL_RESULT_REQUIRES_OFFICIAL_EVIDENCE',resultStage:'provisional'};
  }
  return{allowed:true,from:current,to:target,reason:'VALID_TRANSITION',resultStage:resultStageForRaceState(target)};
}

export function normalizeRaceCommandInput(input:RaceCommandInput):RaceCommandInput{
  const requestId=String(input.requestId||'').trim();const actorId=String(input.actorId||'').trim();const correlationId=String(input.correlationId||'').trim();
  if(!/^[A-Za-z0-9._:-]{8,120}$/.test(requestId))throw new Error('RACE_COMMAND_REQUEST_ID_INVALID');
  if(!actorId||actorId.length>220)throw new Error('RACE_COMMAND_ACTOR_INVALID');
  if(!/^[A-Za-z0-9._:-]{8,120}$/.test(correlationId))throw new Error('RACE_COMMAND_CORRELATION_ID_INVALID');
  const evidence=(input.evidence||[]).slice(0,20).map((item)=>({
    source:String(item.source||'').trim().slice(0,160),authority:item.authority,confidence:Math.max(0,Math.min(1,Number(item.confidence)||0)),reference:item.reference?String(item.reference).slice(0,320):null
  }));
  return{...input,requestId,actorId,correlationId,evidence,payload:input.payload||{}};
}

export type RaceQueryIntent='NEXT_RACE'|'ACTIVE_RACE'|'LAST_RESULT'|'SCHEDULE'|'SCRATCHES'|'STATUS'|'UNKNOWN';
export function classifyRaceQueryIntent(text:string):RaceQueryIntent{
  const value=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  if(/proxima carrera|que carrera sigue/.test(value))return 'NEXT_RACE';
  if(/carrera activa|carrera abierta|cual esta abierta/.test(value))return 'ACTIVE_RACE';
  if(/ultimo resultado|ultima llegada|ultima pizarra/.test(value))return 'LAST_RESULT';
  if(/programacion|programa de carreras|cartelera/.test(value))return 'SCHEDULE';
  if(/retirados|retiros|scratch/.test(value))return 'SCRATCHES';
  if(/estado de la carrera|estatus de la carrera|como va la carrera/.test(value))return 'STATUS';
  return 'UNKNOWN';
}
