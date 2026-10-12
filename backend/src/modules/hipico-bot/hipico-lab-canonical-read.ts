import { operationalRaceContextKey } from './hipico-race-context-key.js';
import { normalizedRaceTrack } from '../hipico/hipico-domain.js';
import { readHipicoDomainAggregate } from './hipico-domain-query.store.js';

export type LabRaceScope = {raceNumber:number;racetrack:string;raceDate:string};
export type LabRaceQuestion = 'status'|'result'|'participants'|'summary';
type Reader=typeof readHipicoDomainAggregate;

const STATES=new Set(['PREPARING','OPEN','CLOSED','RESULT_RECEIVED','SETTLEMENT_READY','SETTLED','BALANCED','PUBLISHED','ARCHIVED']);
const STATE_LABEL:Record<string,string>={
  PREPARING:'en preparación',OPEN:'abierta',CLOSED:'cerrada',
  RESULT_RECEIVED:'con resultado registrado',SETTLEMENT_READY:'pendiente de liquidación',
  SETTLED:'liquidada',BALANCED:'conciliada',PUBLISHED:'publicada internamente',
  ARCHIVED:'archivada'
};
const AUTHORITY={sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false,officiality:'NOT_EXTERNALLY_VERIFIED'} as const;

type Snapshot=NonNullable<Awaited<ReturnType<Reader>>>;
type ResultEvidence={
  reason:'CANONICAL_RESULT_NOT_CONFIRMED'|'CANONICAL_RESULT_EVIDENCE_MISSING'|
    'CANONICAL_RESULT_EVIDENCE_INVALID'|'CANONICAL_RESULT_CONFIRMED_INTERNAL';
  board:string[]|null;
};

// The existing result and the new summary must use exactly the same evidence
// on the same DB snapshot. No inferred placements, account balances or
// external officiality are ever promoted into a reply.
function verifiedInternalResult(snapshot:Snapshot,key:string,state:string):ResultEvidence{
  if(!new Set(['RESULT_RECEIVED','SETTLEMENT_READY','SETTLED','BALANCED','PUBLISHED','ARCHIVED']).has(state)){
    return{reason:'CANONICAL_RESULT_NOT_CONFIRMED',board:null};
  }
  const events=Array.isArray(snapshot.events)?snapshot.events:[];
  const resultIndex=events.findIndex(event=>event.eventType==='RESULT_RECORDED');
  if(resultIndex<0||events.slice(0,resultIndex).some(event=>
    event.eventType==='CORRECTION'||event.eventType==='REVERSAL'||event.eventType==='RESULT_RECORDED'
  )){
    return{reason:'CANONICAL_RESULT_EVIDENCE_MISSING',board:null};
  }
  const result=events[resultIndex];
  const payload=result.normalizedPayload;
  const details=(payload && typeof payload==='object' && !Array.isArray(payload))
    ? payload as Record<string,unknown> : null;
  const board=Array.isArray(details?.board)?details.board:[];
  const matchingScope=Boolean(details?.raceContextComplete===true&&
    operationalRaceContextKey({
      racetrack:details?.racetrack,raceNumber:details?.raceNumber,raceDate:details?.raceDate
    })===key);
  if(result.disposition!=='applied'||result.operatorConfirmed!==true||
     result.nextState!=='RESULT_RECEIVED'||result.previousState!=='CLOSED'||
     !matchingScope||board.length<1||board.length>20||
     board.some(value=>typeof value!=='string'||!/^[1-9][0-9]{0,2}$/.test(value))||
     new Set(board).size!==board.length){
    return{reason:'CANONICAL_RESULT_EVIDENCE_INVALID',board:null};
  }
  return{reason:'CANONICAL_RESULT_CONFIRMED_INTERNAL',board:board as string[]};
}

export async function readCanonicalLabRace(
  input:{ownerId:string;groupKey:string;race:LabRaceScope|null;purpose?:LabRaceQuestion},
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
    aggregateKind:'race',aggregateKey:key,limit:30
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
  const stamp=data.aggregate.updatedAt;
  if(!(stamp instanceof Date)||!Number.isFinite(stamp.getTime()))throw new Error('HIPICO_CANONICAL_UPDATED_AT_INVALID');
  const updatedAt=stamp.toISOString();
  if(input.purpose==='participants'){
    // Participant names in settlement/balance payloads are private financial
    // counterparties, NOT a verified horse-entry catalog. Never repurpose them.
    return{available:false,reason:'CANONICAL_ENTRIES_UNAVAILABLE',
      text:'El registro interno no contiene todavía una lista de ejemplares inscritos verificada para esta carrera. No puedo identificar participantes con seguridad.',
      authority:AUTHORITY};
  }
  if(input.purpose==='result'||input.purpose==='summary'){
    const evidence=verifiedInternalResult(data,key,state);
    const resultText=evidence.board
      ? 'Llegada confirmada internamente por operador: '+evidence.board.join(' - ')+'.'
      : 'No hay una llegada validada y confirmada por operador que pueda mostrar.';
    if(input.purpose==='summary'){
      // Single canonical snapshot. A summary is not a recap of WhatsApp,
      // a payout statement or proof of external officiality.
      return{available:true,reason:'CANONICAL_RACE_SUMMARY',
        state,version,updatedAt,
        text:'Resumen del registro interno de carrera '+context.raceNumber+' en '+
          safeTrack+' ('+context.raceDate+'): estado '+STATE_LABEL[state]+'. '+
          resultText+' Sin confirmación de oficialidad externa ni operaciones monetarias.',
        authority:AUTHORITY};
    }
    if(!evidence.board){
      const reasons:Record<Exclude<ResultEvidence['reason'],'CANONICAL_RESULT_CONFIRMED_INTERNAL'>,string>={
        CANONICAL_RESULT_NOT_CONFIRMED:'Todavía no existe un resultado confirmado de esta carrera en los registros internos.',
        CANONICAL_RESULT_EVIDENCE_MISSING:'No hay una llegada confirmada y libre de correcciones pendientes para mostrar.',
        CANONICAL_RESULT_EVIDENCE_INVALID:'La evidencia de llegada no cumple los controles para publicarse como resultado confirmado.'
      };
      return{available:false,reason:evidence.reason,
        text:reasons[evidence.reason as Exclude<ResultEvidence['reason'],'CANONICAL_RESULT_CONFIRMED_INTERNAL'>],
        authority:AUTHORITY};
    }
    return{available:true,reason:'CANONICAL_RESULT_CONFIRMED_INTERNAL',
      state,version,updatedAt,board:evidence.board,
      text:'La llegada confirmada por operador en el registro interno para la carrera '+
        context.raceNumber+' ('+safeTrack+', '+context.raceDate+') es: '+
        evidence.board.join(' - ')+'. Esta confirmación interna no prueba oficialidad externa ni implica pagos.',
      authority:AUTHORITY};
  }
  return{available:true,reason:'CANONICAL_STATE_FOUND',state,version,updatedAt,
    text:'Según el registro interno, la carrera '+context.raceNumber+' en '+safeTrack+' ('+context.raceDate+') está '+STATE_LABEL[state]+'. No implica resultado oficial externo ni confirma jugadas o saldos.',
    authority:AUTHORITY
  };
}
