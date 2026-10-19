import {stableLabSenderKey,planLabConversation} from './lab-conversation-context.mjs';
import {classifyLocal} from './runtime-utils.mjs';
// Query-only LAB transport: exactly the existing bridge origin and service credential.
// Never used for SOURCE writes; it cannot create an outbox or accept arbitrary URLs.
export function labCanonicalQueryUrl(ingestUrl){
  try{
    const url=new URL(String(ingestUrl||''));
    const local=url.hostname==='localhost'||url.hostname==='127.0.0.1'||url.hostname==='[::1]';
    if(!(url.protocol==='https:'||(url.protocol==='http:'&&local))||
       url.username||url.password||url.search||url.hash||
       !url.pathname.endsWith('/bridge/events'))return null;
    url.pathname=url.pathname.slice(0,-'/bridge/events'.length)+'/bridge/lab/query';
    return url.toString();
  }catch{return null;}
}

// Never turn an arbitrary syntactically valid backend status into permission
// to send a WhatsApp LAB answer. This is the closed catalog emitted by the
// canonical race/schedule readers and immutable receipt reconciliation.
// Deny unknown or write-oriented purposes before even calling the backend.
const READ_ONLY_LAB_PURPOSES=new Set(['next','active','schedule','summary','result','participants','status']);
const SAFE_LAB_INFORMATION_STATUSES=new Set([
  'CANONICAL_RESULT_NOT_CONFIRMED',
  'CANONICAL_RESULT_EVIDENCE_MISSING',
  'CANONICAL_RESULT_EVIDENCE_INVALID',
  'CANONICAL_RESULT_CONFIRMED_INTERNAL',
  'EXPLICIT_RACE_CONTEXT_REQUIRED',
  'INVALID_RACE_CONTEXT',
  'CANONICAL_RACE_NOT_FOUND',
  'CANONICAL_RACE_UNVERIFIED',
  'CANONICAL_ENTRIES_UNAVAILABLE',
  'CANONICAL_RACE_SUMMARY',
  'CANONICAL_STATE_FOUND',
  'CANONICAL_MEETING_SELECTOR_INVALID',
  'CANONICAL_MEETING_AMBIGUOUS',
  'CANONICAL_MEETING_NOT_FOUND',
  'CANONICAL_SCHEDULE_NOT_FOUND',
  'CANONICAL_SCHEDULE_REVISION_UNAVAILABLE',
  'CANONICAL_RACE_CONTEXT_REQUIRED',
  'CANONICAL_SCHEDULE_STALE',
  'CANONICAL_NEXT_RACE',
  'CANONICAL_ACTIVE_RACE',
  'CANONICAL_SCHEDULE_FOUND',
  'LAB_CANONICAL_RECOVERED',
  'LAB_CANONICAL_REVISION_CHANGED'
]);

// Successful verified facts have exactly one read-only purpose. A response
// belonging to a different race question cannot authorize WhatsApp Enter.
const CANONICAL_FACT_PURPOSE=Object.freeze({
  CANONICAL_STATE_FOUND:'status',
  CANONICAL_RESULT_CONFIRMED_INTERNAL:'result',
  CANONICAL_RACE_SUMMARY:'summary',
  CANONICAL_NEXT_RACE:'next',
  CANONICAL_ACTIVE_RACE:'active',
  CANONICAL_SCHEDULE_FOUND:'schedule'
});
const CANONICAL_RECEIPT_PURPOSES=new Set([
  'status','result','summary','next','active','schedule'
]);

const MAX_LAB_CANONICAL_BYTES=16_384;
// Bound decompressed UTF-8 bytes as they arrive, before allocating a full body.
// Native fetch exposes body.getReader(); streamless test adapters use text().
async function readBoundedLabCanonicalBody(response){
  if(typeof response.body?.getReader==='function'){
    const reader=response.body.getReader();
    const decoder=new TextDecoder('utf-8',{fatal:true});
    let bytes=0,raw='',complete=false;
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done){complete=true;break;}
        if(!(value instanceof Uint8Array))return null;
        bytes+=value.byteLength;
        if(bytes>MAX_LAB_CANONICAL_BYTES)return null;
        try{raw+=decoder.decode(value,{stream:true});}catch{return null;}
      }
      try{return raw+decoder.decode();}catch{return null;}
    }finally{
      if(!complete)void reader.cancel().catch(()=>{});
      try{reader.releaseLock();}catch{}
    }
  }
  const raw=await response.text();
  return new TextEncoder().encode(raw).byteLength<=MAX_LAB_CANONICAL_BYTES?raw:null;
}

export function explicitLabRaceScope(text){
  const raw=String(text||'');
  const match=raw.match(/\bcarrera\s*(?:n(?:[úu]mero|ro)?\.?\s*)?(\d{1,3})\s+en\s+(?:(?:el\s+)?hip[oó]dromo\s+)?([\p{L}0-9 ]{2,90}?)\s+(?:el|fecha)\s+(\d{4}-\d{2}-\d{2})\b/iu);
  if(!match)return null;
  const raceNumber=Number(match[1]);
  const racetrack=match[2].trim().replace(/\s+/g,' ');
  if(raceNumber<1||raceNumber>999||!racetrack||!Number.isInteger(raceNumber))return null;
  // Invalid calendar dates are rejected again at the canonical backend boundary.
  return{raceNumber,racetrack,raceDate:match[3]};
}

const TOPIC={
  next:/\b(?:proxima carrera|carrera sigue|siguiente carrera)\b/,
  active:/\b(?:carrera activa|carrera abierta|cual esta abierta)\b/,
  schedule:/\b(?:programacion|cartelera|programa de carreras|carreras programadas)\b/,
  result:/\b(?:resultado|llegada|pizarra|ganador|gano|primero|segundo|tercero)\b/,
  participants:/\b(?:participantes|ejemplares|caballos|inscritos|quienes\s+corren)\b/,
  status:/\b(?:estado|estatus|situacion|abierta|cerrada|como\s+va)\b/,
  summary:/\b(?:resumen|resumeme|sintesis|recapitulacion)\b/
};
const MONEY=/\b(?:apostar|apuestas?|jugadas?|juega|consigue|pagos?|pagar|cobros?|cobrar|depositar|depositos?|retirar|retiros?|saldos?|abonar|liquidacion(?:es)?|liquidar|ganancias?|deudas?|transferencias?|cerrar|abrir|registrar|editar|actualizar|cancelar|confirmar|montos?|dineros?|premios?|bolivares?|balances?|bs|usdt)\b|\$/;
const normalizeQuery=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function labReadOnlyQueryPurpose(text,classification){
  const value=normalizeQuery(text);
  if(!value||value.length>1200||MONEY.test(value)||
    classification?.risk==='monetary'||
    !['safe','review'].includes(classification?.risk)||
    !['conversation','status_non_monetary','help'].includes(classification?.intent))return null;
  if(TOPIC.summary.test(value) && /\b(?:chat|conversacion|mensajes?|historial|hablamos)\b/.test(value))return null;
  if(TOPIC.summary.test(value) && !/\b(?:carrera|hipodromo)\b/.test(value))return null;
  if(!/[¿?]/.test(text)&&!/^(?:consulta|dime|muestra|indica|dame|hazme|resumen|resumeme|sintesis|recapitulacion|resultado|participantes|pizarra|estado)/.test(value))return null;
  for(const key of ['next','active','schedule','summary','result','participants','status']){
    if(TOPIC[key].test(value))return key;
  }
  return null;
}

export function resolveQuotedLabRaceScope(row,visibleRows){
  const quotedId=String(row?.quotedId||'');
  if(!quotedId||quotedId===row?.id||!Array.isArray(visibleRows))return null;
  const sender=stableLabSenderKey(row.id);
  if(!sender)return null;
  const prior=visibleRows.find(previous=>previous?.id===quotedId);
  if(!prior||prior.fromMe||prior.hasMedia||stableLabSenderKey(prior.id)!==sender)return null;
  const scope=explicitLabRaceScope(prior.text);
  if(!scope)return null;
  // Visible quoted messages bypass the confirmed-ACK hint journal. Subject
  // them to the same single-race and safety restrictions; otherwise a
  // message naming both race 5 and 6 can silently become a scoped quote.
  const safety=classifyLocal(prior.text);
  if(safety.risk!=='safe'||MONEY.test(normalizeQuery(prior.text)))return null;
  const quotedPlan=planLabConversation(prior,safety,null,scope);
  if(quotedPlan.scopeConflict||!quotedPlan.raceScope||
     quotedPlan.raceScope.raceNumber!==scope.raceNumber)return null;
  // A follow-up may name a different race via "carrera 6", "6ta",
  // "la sexta", or multiple references. Never let quoting race 5 override it.
  const followup=planLabConversation(row,classifyLocal(row.text),null,scope);
  if(followup.scopeConflict||!followup.raceScope||
     followup.raceScope.raceNumber!==scope.raceNumber)return null;
  return scope;
}

// #892: A canonical read must preserve the complete original identity and
// question. Truncating either can collide dedupe IDs or discard a dangerous
// trailing qualifier while still allowing a LAB reply from the backend.
function validCanonicalLabEnvelope({token,labGroupId,labChannelKey,messageId,senderId,
  text,timestamp,race,quotedMessageId,timeoutMs}){
  const bounded=(value,max,allowLines=false)=>typeof value==='string'&&value.length>0&&
    value.length<=max&&value.trim().length>0&&
    !(allowLines ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ :
      /[\u0000-\u001f\u007f]/).test(value);
  if(!bounded(token,4096)||!bounded(labGroupId,160)||
     !bounded(labChannelKey,128)||!bounded(messageId,320)||
     !bounded(senderId,160)||!bounded(text,1200,true)||
     !Number.isFinite(timeoutMs)||timeoutMs<0||timeoutMs>30000)return false;
  // Input must already be a normalized server/DOM observation timestamp.
  if(typeof timestamp!=='string'||
     !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(timestamp))return false;
  const parsed=Date.parse(timestamp);
  if(!Number.isFinite(parsed)||new Date(parsed).toISOString()!==timestamp)return false;
  if(quotedMessageId!==null&&!bounded(quotedMessageId,320))return false;
  if(race!==null){
    if(!race||typeof race!=='object'||Array.isArray(race)||
       Object.keys(race).length!==3||
       !['raceNumber','racetrack','raceDate'].every(key=>
         Object.prototype.hasOwnProperty.call(race,key))||
       !Number.isInteger(race.raceNumber)||race.raceNumber<1||race.raceNumber>99||
       !bounded(race.racetrack,80)||race.racetrack.trim().length<2||
       !/^[\p{L}\p{N} -]+$/u.test(race.racetrack)||
       typeof race.raceDate!=='string'||
       !/^\d{4}-\d\d-\d\d$/.test(race.raceDate))return false;
    const date=Date.parse(race.raceDate+'T00:00:00.000Z');
    if(!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==race.raceDate)return false;
  }
  return true;
}

export async function queryCanonicalLab({
  ingestUrl,token,labGroupId,labChannelKey,messageId,senderId,text,
  timestamp=new Date().toISOString(),race=null,purpose='status',quotedMessageId=null,timeoutMs=4500,fetchImpl=fetch
}={}){
  const url=labCanonicalQueryUrl(ingestUrl);
  if(!url||!READ_ONLY_LAB_PURPOSES.has(purpose)||
     !validCanonicalLabEnvelope({token,labGroupId,labChannelKey,messageId,
       senderId,text,timestamp,race,quotedMessageId,timeoutMs})){
    return{available:false,reason:'LAB_CANONICAL_DISABLED'};
  }
  const payload={
    externalMessageId:messageId,
    groupId:labGroupId,channelRole:'lab',channelKey:labChannelKey,
    labChannelKey,shadowMode:true,senderId,
    timestamp,text,race,purpose,
    quotedExternalMessageId:quotedMessageId
  };
  // Read-only query: a lost HTTP response has no committed send/domain effect.
  // One immediate retry is safe; never retry auth, rate limits or invalid contracts.
  for(let attempt=0;attempt<2;attempt++){
    let response;
    try{
      response=await fetchImpl(url,{
        method:'POST',redirect:'manual',cache:'no-store',
        headers:{'Content-Type':'application/json','x-hipico-bridge-token':token},
        body:JSON.stringify(payload),signal:AbortSignal.timeout(Math.min(5000,Math.max(500,timeoutMs)))
      });
    }catch{
      if(attempt===0)continue;
      return{available:false,reason:'LAB_CANONICAL_UNAVAILABLE'};
    }
    // 503 is an explicit overload/unavailable signal; do not amplify it.
    if([502,504].includes(response.status)&&attempt===0)continue;
    // Reject JSONP, mixed MIME types or misleading substrings in HTTP metadata.
    const mediaType=response.headers.get('content-type')?.split(';',1)[0]?.trim().toLowerCase();
    if(response.status!==200||mediaType!=='application/json'){
      return{available:false,reason:'LAB_CANONICAL_UNAVAILABLE'};
    }
    const lengthHeader=response.headers.get('content-length');
    if(lengthHeader!==null&&(!/^\d+$/.test(lengthHeader)||
      !Number.isSafeInteger(Number(lengthHeader))||
      Number(lengthHeader)>MAX_LAB_CANONICAL_BYTES)){
      return{available:false,reason:'LAB_CANONICAL_INVALID_RESPONSE'};
    }
    let raw;
    try{raw=await readBoundedLabCanonicalBody(response);}catch{
      if(attempt===0)continue;
      return{available:false,reason:'LAB_CANONICAL_UNAVAILABLE'};
    }
    if(raw===null)return{available:false,reason:'LAB_CANONICAL_INVALID_RESPONSE'};
    let body;
    try{body=JSON.parse(raw);}catch{return{available:false,reason:'LAB_CANONICAL_INVALID_RESPONSE'};}
    const authority=body?.authority;
    if(body?.ok!==true||body?.mode!=='shadow'||
       authority?.sourceWriteAllowed!==false||
       authority?.financialAuthority!==false||
       authority?.domainEffectsAllowed!==false||
       !/^[A-Z0-9_]{4,80}$/.test(String(body.status||''))){
      return{available:false,reason:'LAB_CANONICAL_INVALID_RESPONSE'};
    }
    // The authoritative backend intentionally uses an empty text on takeover.
    // This is an explicit DENY, never an answer or a send authorization.
    // Only the exact no-text handoff contract may cancel a pending LAB replay.
    if(body.status==='LAB_HANDOFF_HELD'){
      return body.text===''
        ? {available:false,reason:'LAB_HANDOFF_HELD'}
        : {available:false,reason:'LAB_CANONICAL_INVALID_RESPONSE'};
    }
    // REVIEW_REQUIRED is a terminal *human review* decision, not a
    // verified informational answer. A nonempty review notice must never
    // become automatic send authority or be re-queried after release.
    if(body.status==='REVIEW_REQUIRED'){
      return typeof body.text==='string'&&body.text.trim()&&body.text.length<=1500
        ? {available:false,reason:'LAB_CANONICAL_REVIEW_REQUIRED'}
        : {available:false,reason:'LAB_CANONICAL_INVALID_RESPONSE'};
    }
    // Receipt refusal or stale/cancelled authority must never become an
    // automatic message. A persisted review decision is terminal in both
    // visible and off-DOM paths, just like the explicit REVIEW_REQUIRED state.
    if(['LAB_CANONICAL_HUMAN_HANDOFF','LAB_CANONICAL_REQUEST_STALE',
        'LAB_CANONICAL_RECEIPT_NOT_VERIFIABLE'].includes(body.status)){
      // Receipt refusals from backend have unavailable canonical state and
      // a bounded human notice. Contradictory or missing data is invalid.
      return body.canonical?.available===false&&
        typeof body.text==='string'&&body.text.trim()&&body.text.length<=1500
        ? {available:false,reason:'LAB_CANONICAL_REVIEW_REQUIRED'}
        : {available:false,reason:'LAB_CANONICAL_INVALID_RESPONSE'};
    }
    if(!SAFE_LAB_INFORMATION_STATUSES.has(body.status)||
       (CANONICAL_FACT_PURPOSE[body.status] && CANONICAL_FACT_PURPOSE[body.status]!==purpose)||
       (['LAB_CANONICAL_RECOVERED','LAB_CANONICAL_REVISION_CHANGED'].includes(body.status)&&
        !CANONICAL_RECEIPT_PURPOSES.has(purpose))||
       typeof body.text!=='string'||!body.text.trim()||body.text.length>1500){
      return{available:false,reason:'LAB_CANONICAL_INVALID_RESPONSE'};
    }
    return{available:true,reason:String(body.status),text:body.text};
  }
  return{available:false,reason:'LAB_CANONICAL_UNAVAILABLE'};
}
