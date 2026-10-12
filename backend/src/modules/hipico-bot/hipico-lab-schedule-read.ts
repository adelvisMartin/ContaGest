import { RaceQueryService } from '../hipico/race-query.service.js';
import { RaceLifecycleStore } from '../hipico/race.store.js';
import { parseExplicitLabMeeting } from './hipico-lab-meeting-selection.js';
import { versionLabScheduleSnapshot } from './hipico-lab-schedule-version.js';

export type LabSchedulePurpose='next'|'active'|'schedule';
type ReadStore=Pick<RaceLifecycleStore,'listRaces'|'listMeetings'|'getMeeting'|'findMeetingsForLabQuery'>;
const AUTHORITY={sourceWriteAllowed:false,financialAuthority:false,domainEffectsAllowed:false,officiality:'NOT_EXTERNALLY_VERIFIED'} as const;
const ALLOWED_STATES=new Set(['DISCOVERED','ANNOUNCED','OPEN','CLOSING','RUNNING']);
const QUERY_TEXT:Record<LabSchedulePurpose,string>={
  next:'¿Cuál es la próxima carrera?',
  active:'¿Cuál es la carrera activa?',
  schedule:'programación de carreras'
};
function safeNumber(value:unknown){
  const parsed=Number(value);
  return Number.isInteger(parsed)&&parsed>=1&&parsed<=99?parsed:null;
}
function safeDate(value:unknown){
  const date=value instanceof Date?value:new Date(typeof value==='string'?value:'');
  return Number.isFinite(date.getTime())?date.toISOString():null;
}
const unavailable=(reason:string,text:string)=>({available:false,reason,text,authority:AUTHORITY});

/**
 * No raw resultData, bookmaker participants, unverified odds or personal details
 * leave this projection. The store is the existing tenant-scoped lifecycle store.
 */
export async function readScopedLabSchedule(input:{
  ownerId:string;groupKey:string;purpose:LabSchedulePurpose;text?:string
},store:ReadStore=new RaceLifecycleStore(),nowMs=Date.now()){
  if(!Object.hasOwn(QUERY_TEXT,input.purpose)){
    return unavailable('LAB_SCHEDULE_PURPOSE_INVALID','La consulta no tiene un propósito de solo lectura permitido.');
  }
  // Only natural-language DATE [+VENUE] can select a meeting. Never accept
  // arbitrary meetingId, owner or group key from a WhatsApp request.
  const selector=parseExplicitLabMeeting(input.text||'');
  if(selector.kind==='invalid'){
    return unavailable('CANONICAL_MEETING_SELECTOR_INVALID',
      'La fecha o el hipódromo de la reunión no son válidos. Indica reunión del AAAA-MM-DD en el hipódromo correspondiente.');
  }
  const meetings=selector.kind==='explicit'
    ? await store.findMeetingsForLabQuery(input.ownerId,input.groupKey,selector.meetingDate,selector.venue)
    : await store.listMeetings(input.ownerId,input.groupKey,2);
  if(meetings.length!==1){
    return unavailable(meetings.length?'CANONICAL_MEETING_AMBIGUOUS':'CANONICAL_MEETING_NOT_FOUND',
      meetings.length
        ?'Hay varias reuniones que coinciden. Indica la reunión del AAAA-MM-DD en el hipódromo correspondiente.'
        :'No encuentro una reunión que coincida con esos datos registrados.');
  }
  // One bounded DB result set is reused for the answer and its fingerprint.
  // 201 rows indicate truncation risk: never attest a partial program.
  const rows=await store.listRaces(input.ownerId,input.groupKey,String(meetings[0].id),201);
  const revision=versionLabScheduleSnapshot(String(meetings[0].id),rows);
  if(!revision){
    return unavailable('CANONICAL_SCHEDULE_REVISION_UNAVAILABLE',
      'La programación no tiene una revisión íntegra verificable. Solicita al operador revisar los datos de la reunión.');
  }
  const evidence={...revision,state:input.purpose.toUpperCase()+'_SNAPSHOT'};
  const query=new RaceQueryService(store);
  let result;
  try{
    result=await query.execute({...input,meetingId:String(meetings[0].id),text:QUERY_TEXT[input.purpose]},rows);
  }catch(error){
    const code=String((error as {code?:string})?.code||'');
    if(code==='RACE_QUERY_AMBIGUOUS'||code==='RACE_QUERY_CONTEXT_REQUIRED'){
      return unavailable('CANONICAL_RACE_CONTEXT_REQUIRED','No hay una carrera única y verificable para responder.');
    }
    throw error;
  }
  if(input.purpose==='next'||input.purpose==='active'){
    const race=result.answer as Record<string,unknown>|null;
    if(!race)return unavailable('CANONICAL_RACE_NOT_FOUND','No encuentro una carrera registrada para esta consulta.');
    const number=safeNumber(race.number);
    const state=String(race.state||'');
    const when=safeDate(race.scheduledAt);
    if(number===null||!ALLOWED_STATES.has(state)){
      return unavailable('CANONICAL_RACE_UNVERIFIED','La carrera encontrada no tiene datos suficientes para publicarse.');
    }
    if(input.purpose==='next'&&(!when||Date.parse(when)<nowMs)){
      return unavailable('CANONICAL_SCHEDULE_STALE','La fecha de la próxima carrera no está verificada o ya pasó. Se requiere actualizar la programación.');
    }
    return {
      available:true,reason:input.purpose==='next'?'CANONICAL_NEXT_RACE':'CANONICAL_ACTIVE_RACE',
      ...evidence,
      text:input.purpose==='next'
        ?'Próxima carrera registrada: número '+number+', programada '+when+' (estado interno '+state+'). La programación no certifica ejecución.'
        :'La carrera número '+number+' figura en estado interno '+state+'. La información no certifica que esté corriendo en tiempo real.',
      authority:AUTHORITY
    };
  }
  const races=Array.isArray(result.answer)?result.answer:[];
  const projected=races.map((row:Record<string,unknown>)=>({
    number:safeNumber(row.number),date:safeDate(row.scheduledAt),state:String(row.state||'')
  })).filter(row=>row.number!==null&&row.date&&Date.parse(row.date)>=nowMs&&ALLOWED_STATES.has(row.state))
    .sort((a,b)=>Date.parse(a.date!)-Date.parse(b.date!)||a.number!-b.number!);
  if(!projected.length){
    return unavailable('CANONICAL_SCHEDULE_NOT_FOUND','No hay programación futura suficientemente verificada para esta reunión.');
  }
  const lines=projected.slice(0,10).map(x=>'Carrera '+x.number+': '+x.date+' (estado '+x.state+')');
  return{available:true,reason:'CANONICAL_SCHEDULE_FOUND',
    ...evidence,
    text:['Programación registrada de la reunión seleccionada:',...lines,
      'Los horarios pueden cambiar y no constituyen resultados oficiales.'].join('\n').slice(0,1500),
    authority:AUTHORITY};
}
