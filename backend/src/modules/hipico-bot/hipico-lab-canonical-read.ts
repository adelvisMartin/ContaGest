import { operationalRaceContextKey } from './hipico-race-context-key.js';
import { normalizedRaceTrack } from '../hipico/hipico-domain.js';
import { readHipicoDomainAggregate } from './hipico-domain-query.store.js';

export type LabRaceScope = {raceNumber:number;racetrack:string;raceDate:string};
type Reader=typeof readHipicoDomainAggregate;

const STATES=new Set(['PREPARING','OPEN','CLOSED','RESULT_RECEIVED','SETTLEMENT_READY','SETTLED','BALANCED','PUBLISHED','ARCHIVED']);
const STATE_LABEL:Record<string,string>={
  PREPARING:'en preparación',OPEN:'abierta',CLOSED:'cerrada',
  RESULT_RECEIVED:'con resultado registrado',SETTLEMENT_READY:'pendiente de liquidación',
  SETTLED:'liquidada',BALANCED:'conciliada',PUBLISHED:'publicada internamente',
  ARCHIVED:'archivada'
};
const AUTHORITY={sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false,officiality:'NOT_EXTERNALLY_VERIFIED'} as const;

export async function readCanonicalLabRace(
  input:{ownerId:string;groupKey:string;race:LabRaceScope|null},
  read:Reader=readHipicoDomainAggregate
){
  const context=input.race;
  if(!context){
    return{available:false,reason:'EXPLICIT_RACE_CONTEXT_REQUIRED',text:'Para consultar el estado registrado, indica carrera, hipódromo y fecha (AAAA-MM-DD).',authority:AUTHORITY};
  }
  const safeTrack=normalizedRaceTrack(context.racetrack).slice(0,80);
  const key=operationalRaceContextKey(context);
  if(!key || !context.raceDate || !safeTrack){
    return{available:false,reason:'INVALID_RACE_CONTEXT',text:'La referencia de carrera no es válida. Verifica número, hipódromo y fecha.',authority:AUTHORITY};
  }
  const data=await read({
    ownerId:input.ownerId,groupKey:input.groupKey,
    aggregateKind:'race',aggregateKey:key,limit:1
  });
  if(!data){
    return{available:false,reason:'CANONICAL_RACE_NOT_FOUND',
      text:'No encuentro un estado confirmado para esa carrera en los registros autorizados. No puedo afirmar participantes ni resultados.',authority:AUTHORITY};
  }
  const state=String(data.aggregate.status||'');
  const version=Number(data.aggregate.stateVersion||0);
  if(!STATES.has(state)||!Number.isSafeInteger(version)||version<1){
    return{available:false,reason:'CANONICAL_RACE_UNVERIFIED',text:'El registro todavía no tiene un estado validado para consulta.',authority:AUTHORITY};
  }
  const stamp=new Date(data.aggregate.updatedAt);
  if(!Number.isFinite(stamp.getTime()))throw new Error('HIPICO_CANONICAL_UPDATED_AT_INVALID');
  const updatedAt=stamp.toISOString();
  return{available:true,reason:'CANONICAL_STATE_FOUND',state,version,updatedAt,
    text:'Según el registro interno, la carrera '+context.raceNumber+' en '+safeTrack+' ('+context.raceDate+') está '+STATE_LABEL[state]+'. No implica resultado oficial externo ni confirma jugadas o saldos.',
    authority:AUTHORITY
  };
}
