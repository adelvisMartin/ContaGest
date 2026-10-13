import {stableLabSenderKey} from './lab-conversation-context.mjs';
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
const MONEY=/\b(?:apuesta|apostar|juega|jugada|consigue|pagar|cobrar|saldo|liquidar|cerrar|abrir|registrar|premio|dinero|bs|usdt)\b|\$/;
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
  const currentRace=normalizeQuery(row.text).match(/\bcarrera\s*(?:numero|nro)?\.?\s*(\d{1,3})\b/);
  if(currentRace&&Number(currentRace[1])!==scope.raceNumber)return null;
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
  // A lost HTTP response after the backend commit is retried once using the
  // exact same request identity, before any WhatsApp send intent exists.
  for(let attempt=0;attempt<2;attempt++){
  try{
    const response=await fetchImpl(url,{
      method:'POST',redirect:'manual',cache:'no-store',
      headers:{'Content-Type':'application/json','x-hipico-bridge-token':token},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(Math.min(5000,Math.max(500,timeoutMs)))
    });
    if(response.status!==200||!response.headers.get('content-type')?.toLowerCase().includes('application/json')){
      return{available:false,reason:'LAB_CANONICAL_UNAVAILABLE'};
    }
    const length=Number(response.headers.get('content-length')||0);
    if(length>16_384)return{available:false,reason:'LAB_CANONICAL_INVALID_RESPONSE'};
    const raw=await response.text();
    if(raw.length>16_384)return{available:false,reason:'LAB_CANONICAL_INVALID_RESPONSE'};
    const body=JSON.parse(raw);
    const authority=body?.authority;
    if(body?.ok!==true||body?.mode!=='shadow'||
       authority?.sourceWriteAllowed!==false||
       authority?.financialAuthority!==false||
       authority?.domainEffectsAllowed!==false||
       typeof body.text!=='string'||body.text.length>1500||
       !/^[A-Z0-9_]{4,80}$/.test(String(body.status||''))){
      return{available:false,reason:'LAB_CANONICAL_INVALID_RESPONSE'};
    }
    return{available:true,reason:String(body.status),text:body.text};
  }catch{
    if(attempt===1)return{available:false,reason:'LAB_CANONICAL_UNAVAILABLE'};
  }
  }
  return{available:false,reason:'LAB_CANONICAL_UNAVAILABLE'};
}
