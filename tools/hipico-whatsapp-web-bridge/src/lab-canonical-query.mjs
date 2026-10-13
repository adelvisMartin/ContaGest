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
const MONEY=/\b(?:apostar|apuestas?|jugadas?|juega|consigue|pagos?|pagar|cobros?|cobrar|depositar|depositos?|retirar|retiros?|saldos?|abonar|liquidaciones?|liquidar|cerrar|abrir|registrar|editar|actualizar|cancelar|confirmar|montos?|dineros?|premios?|bolivares?|balances?|bs|usdt)\b|\$/;
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

export async function queryCanonicalLab({
  ingestUrl,token,labGroupId,labChannelKey,messageId,senderId,text,
  timestamp=new Date().toISOString(),race=null,purpose='status',quotedMessageId=null,timeoutMs=4500,fetchImpl=fetch
}={}){
  const url=labCanonicalQueryUrl(ingestUrl);
  if(!url||!token||!labGroupId||!labChannelKey||!senderId||!messageId){
    return{available:false,reason:'LAB_CANONICAL_DISABLED'};
  }
  const payload={
    externalMessageId:String(messageId).slice(0,320),
    groupId:labGroupId,channelRole:'lab',channelKey:labChannelKey,
    labChannelKey,shadowMode:true,senderId,
    timestamp,text:String(text||'').slice(0,1200),race,purpose,
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
       typeof body.text!=='string'||!body.text.trim()||body.text.length>1500||
       !/^[A-Z0-9_]{4,80}$/.test(String(body.status||''))){
      return{available:false,reason:'LAB_CANONICAL_INVALID_RESPONSE'};
    }
    return{available:true,reason:String(body.status),text:body.text};
  }
  return{available:false,reason:'LAB_CANONICAL_UNAVAILABLE'};
}
