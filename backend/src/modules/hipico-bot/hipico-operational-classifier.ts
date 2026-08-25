export type OperationalOffer={
  role:'player'|'receiver';
  play:string;
  horse:string;
  amount:number|null;
  participant?:string;
  counterparty?:string;
  raw:string;
};

export type OperationalBalance={participant:string;available:number};
export type OperationalSettlementRow={role:'player'|'receiver';participant:string;amount:number};

export type OperationalEntities={
  role?:'player'|'receiver';
  play?:string;
  horse?:string;
  amount?:number|null;
  participant?:string;
  counterparty?:string;
  raceNumber?:number|null;
  board?:string[];
  balances?:OperationalBalance[];
  offers?:OperationalOffer[];
  settlementRows?:OperationalSettlementRow[];
  confirmation?:string;
};

export type IntentResult={
  intent:string;
  risk:'safe'|'review'|'monetary';
  confidence:number;
  suggestion:string;
  autoEligible:boolean;
  reason:string;
  entities?:OperationalEntities;
};

/**
 * Classifier/analyzer for the language already used by the recovered Control
 * Hipico RC1 WhatsApp workflow. Operational intents are deliberately NEVER
 * auto-eligible. Structured entities are observation-only evidence for shadow
 * QA; this module never mutates race state, balances, results or settlements.
 */

const plain=(value:string)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const canonical=(value:string)=>plain(value)
  .replace(/[“”"'`]/g,'')
  .replace(/\s+/g,' ')
  .trim()
  .toUpperCase();

const raceClose=/\b(?:CIERRA|CIERRE|CERRAR|CERRAMOS|CIERREN|CERRADA|CERRADO|NO\s+MAS\s+JUGADAS?|NO\s+VA\s+MAS|CARRERA\s+CERRADA|CERRADO\s+CERRADO|FIN\s+DE\s+CARRERA)\b/;
const dayClose=/\b(?:ESTO\s+ES\s+TODO\s+POR\s+EL\s+DIA\s+DE\s+HOY|LOS\s+ESPERAMOS\s+MANANA|CIERRE\s+DE\s+JORNADA|CERRAMOS\s+LA\s+JORNADA)\b/;
const resultWord=/\b(?:LLEGADA|PIZARRA|RESULTADO|GANO|PRIMERO|SEGUNDO|TERCERO)\b/;
const balanceSnapshot=/\bTERCIO\s+DISPONIBLE\b/;
const settlementWord=/\b(?:LIQUIDACION|LIQUIDAR|LIQUIDADO|CUADRE|CUADRE\s+FINAL)\b/;
const planWord=/\bTERCIOS\b/;
const playerOffer=/^(?:JUEGO|JUEGA)\b/;
const receiverOffer=/^(?:CONSIGO|CONSIGUE)\b/;
const pendingConfirmation=/\b(?:DEBE\s+CONFIRMAR|POR\s+CONFIRMAR|FALTA\s+CONFIRMAR|ESPERANDO\s+CONFIRMACION)\b/;
const exactConfirmation=/^(?:J|JUGANDO|SF|S\s*\/\s*F|SE\s+FUE|OK|CONFIRMADO)$/;
const cancelOrCorrection=/\b(?:ANULA|ANULADO|ANULAR|CANCELA|CANCELADO|CANCELAR|CORRIGE|CORREGIR|CORRECCION|BORRA\s+(?:ESA|LA)\s+JUGADA|CAMBIA\s+(?:ESA|LA)\s+JUGADA)\b/;
const pollaOrParley=/\b(?:POLLA|PARLEY)\b/;
const genericMonetary=/\b(?:APUESTA|JUGADA|MONTO|SALDO|DISPONIBLE|DISPONIBLES|DEBO|DEBE|PAGO|COBRO|PREMIO|RIESGO)\b|\b\d[\d.,]*\s*(?:K|MIL|MM?|MILLON(?:ES)?|BS\.?|USD|\$)\b/;
const greeting=/^(?:HOLA|BUENAS?|SALUDOS|BUEN\s+DIA|BUENAS\s+TARDES|BUENAS\s+NOCHES)\b/;
const help=/\b(?:AYUDA|COMO\s+FUNCIONA|INSTRUCCIONES|MENU|OPCIONES)\b/;
const status=/\b(?:ESTADO|RECIBIDO|PENDIENTE|REVISANDO|YA\s+LLEGO)\b/;

const PLAY_RE=/(?:\d{1,2}\s*A\s*\d{1,2}(?:[.,]\d+)?|[1-6]\s*(?:Y|\/)\s*[1-6]|[1-6]NN?|[1-6]P|PP|PK|MAR|PLA|SHOW|RET|TF|LOGRO)/i;
const NUMBER_SOURCE='[+-]?(?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d+)?)';
const UNIT_SOURCE='(?:K|MIL|MM?|MILLON(?:ES)?|BS\\.?|USD|\\$)?';

function numeric(raw:string){
  const value=String(raw||'').trim();
  if(!value)return null;
  let normalized=value;
  if(value.includes(',')&&value.includes('.'))normalized=value.replace(/\./g,'').replace(',','.');
  else if(value.includes(','))normalized=value.replace(',','.');
  else if(/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(value))normalized=value.replace(/\./g,'');
  const number=Number(normalized);
  return Number.isFinite(number)?number:null;
}

function withUnit(value:number|null,unit:string){
  if(value===null)return null;
  const u=canonical(unit).replace(/\./g,'');
  if(u==='K'||u==='MIL')return value*1000;
  if(u==='M'||u==='MM'||u==='MILLON'||u==='MILLONES')return value*1000000;
  return value;
}

function normalizePlay(raw:string){
  let value=canonical(raw).replace(/\s/g,'');
  if(/^[1-6]Y[1-6]$/.test(value))value=value.replace('Y','/');
  if(/^[1-6]NN$/.test(value))value=`${value[0]}N`;
  if(/^\d{1,2}A\d{1,2}/.test(value))value=value.replace(',','.');
  return value;
}

function extractAmount(raw:string){
  const source=plain(raw);
  const con=[...source.matchAll(new RegExp(`\\bcon\\s+(${NUMBER_SOURCE})\\s*(${UNIT_SOURCE})`,'gi'))].at(-1);
  if(con)return withUnit(numeric(con[1]),con[2]||'');
  const units=[...source.matchAll(new RegExp(`(?:BS\\.?\\s*)?(${NUMBER_SOURCE})\\s*(K|MIL|MM?|MILLON(?:ES)?|BS\\.?|USD|\\$)\\b`,'gi'))].at(-1);
  return units?withUnit(numeric(units[1]),units[2]||''):null;
}

function normalizeHorse(raw:string){
  return String(raw||'').replace(/\s/g,'').replace(/X/gi,'*').toUpperCase();
}

function extractHorse(raw:string){
  const c=canonical(raw);
  const direct=c.match(/\b(?:DEL?|CABALLO|EL)\s+(\d+(?:\s*[X*]\s*\d+)?|PA|IM|RE)\b/);
  if(direct)return normalizeHorse(direct[1]);
  const al=c.match(/\bAL\s+(?:CABALLO\s+)?(\d+(?:\s*[X*]\s*\d+)?|PA|IM|RE)\b/);
  if(al)return normalizeHorse(al[1]);
  const parenthesized=c.match(new RegExp(`${PLAY_RE.source}\\s*\\(\\s*(\\d+|PA|IM|RE)\\s*\\)`,'i'));
  if(parenthesized)return normalizeHorse(parenthesized[1]);
  const pair=c.replace(/^(?:JUEGO|JUEGA|CONSIGO|CONSIGUE)\s+/,'').match(/^(\d+)\s*[X*]\s*(\d+)\b/);
  if(pair)return `${pair[1]}*${pair[2]}`;
  const playMatch=c.match(PLAY_RE);
  if(playMatch?.index!==undefined){
    const after=c.slice(playMatch.index+playMatch[0].length).trim();
    const bare=after.match(/^(\d+|PA|IM|RE)\b/);
    if(bare)return normalizeHorse(bare[1]);
  }
  return '';
}

function planParties(raw:string):{participant?:string;counterparty?:string}{
  const source=plain(raw).trim();
  if(!/^JUEGA\b/i.test(source))return{};
  const re=new RegExp(`^JUEGA\\s+(.+?)\\s+(${PLAY_RE.source})\\s*(?:\\([^)]*\\))?\\s+CON\\b[\\s\\S]*?\\bDA\\s+(.+?)\\s*$`,'i');
  const match=source.match(re);
  return match?{participant:match[1].trim(),counterparty:match[3].trim()}:{};
}

function offerFromLine(raw:string):OperationalOffer|null{
  const c=canonical(raw);
  const player=playerOffer.test(c);
  const receiver=receiverOffer.test(c);
  if(!player&&!receiver)return null;
  const pair=c.replace(/^(?:JUEGO|JUEGA|CONSIGO|CONSIGUE)\s+/,'').match(/^(\d+)\s*[X*]\s*(\d+)\b/);
  const playMatch=c.match(PLAY_RE);
  const parties=planParties(raw);
  return{
    role:receiver?'receiver':'player',
    play:pair?'PP':(playMatch?normalizePlay(playMatch[0]):''),
    horse:extractHorse(raw),
    amount:extractAmount(raw),
    ...parties,
    raw:String(raw||'').trim()
  };
}

function parseOffers(text:string){
  return String(text||'').split(/\n+/).map((line)=>offerFromLine(line)).filter(Boolean) as OperationalOffer[];
}

function parseBoard(text:string){
  const source=plain(text);
  const arrival=source.match(/\bllegada\s+(?:\d{1,2}\s*(?:na|ra|da|ta)\s+)?([0-9][0-9.\s,\-]*)/i);
  const board=source.match(/\bpizarra\s*[:\-]?\s*([0-9][0-9.\s,\-]*)/i);
  const resultMatch=source.match(/\bresultado\s*[:\-]?\s*([0-9][0-9.\s,\-]*)/i);
  const match=arrival||board||resultMatch;
  return match?match[1].split(/[.\s,\-]+/).map((item)=>item.trim()).filter(Boolean).slice(0,6):[];
}

function parseRaceNumber(text:string){
  const c=canonical(text);
  const explicit=c.match(/\bCARRERA\s+(\d{1,3})\b/);
  if(explicit)return Number(explicit[1]);
  const short=c.match(/\b(?:CIERRA|CIERRE|CERRAR|CERRAMOS|CIERREN|NO\s+VA\s+MAS)\s+(?:LA\s+)?(\d{1,3})\b/);
  return short?Number(short[1]):null;
}

function parseBalances(text:string){
  const lines=String(text||'').split(/\n+/).map((line)=>line.trim()).filter(Boolean);
  const start=lines.findIndex((line)=>balanceSnapshot.test(canonical(line)));
  if(start<0)return [];
  const rows:OperationalBalance[]=[];
  for(const line of lines.slice(start+1)){
    const match=line.match(/^(.+?)\s+(?:Bs\.?\s*)?([+-]?[\d.]+(?:,\d{1,2})?)\s*$/i);
    if(!match)continue;
    const available=numeric(match[2]);
    if(available===null)continue;
    rows.push({participant:match[1].trim(),available});
  }
  return rows;
}

function parseSettlementRows(text:string){
  const rows:OperationalSettlementRow[]=[];
  for(const line of String(text||'').split(/\n+/).map((item)=>item.trim()).filter(Boolean)){
    const match=line.match(/^(Juega|Consigue)\s+(.+?)\s+Bs\.?\s+([+-]?[\d.]+(?:,\d{1,2})?)\s*$/i);
    if(!match)continue;
    const amount=numeric(match[3]);
    if(amount===null)continue;
    rows.push({role:/^Consigue$/i.test(match[1])?'receiver':'player',participant:match[2].trim(),amount});
  }
  return rows;
}

const operational=(intent:string,risk:'review'|'monetary',confidence:number,suggestion:string,reason:string,entities:OperationalEntities={}):IntentResult=>({
  intent,risk,confidence,suggestion,autoEligible:false,reason,entities
});

export const OPERATIONAL_INTENTS=new Set([
  'offer_player','offer_receiver','offer_confirmation','pending_confirmation','cancel_or_correction',
  'race_close','day_close','race_result','balance_snapshot','plan_snapshot','settlement_snapshot',
  'polla_or_parley','betting_or_balance'
]);

export function classify(text:string):IntentResult {
  const body=String(text||'').trim();
  if(!body)return{intent:'empty',risk:'review',confidence:0,suggestion:'No recibi texto para analizar.',autoEligible:false,reason:'EMPTY'};
  const c=canonical(body);
  const board=parseBoard(body);
  const hasJuega=/\bJUEGA\b/.test(c);
  const hasConsigue=/\bCONSIGUE\b/.test(c);
  const settlementRows=parseSettlementRows(body);

  if(dayClose.test(c))return operational('day_close','review',.995,'Cierre de jornada detectado. Queda registrado para revision; no se cambia automaticamente el estado de la jornada.','DAY_CLOSE_REVIEW_GATE');
  if(raceClose.test(c))return operational('race_close','review',.995,'Cierre de carrera detectado. Se validara la carrera activa antes de aceptar cualquier cambio de estado.','CLOSE_REVIEW_GATE',{raceNumber:parseRaceNumber(body)});
  if(balanceSnapshot.test(c))return operational('balance_snapshot','monetary',.995,'Snapshot de disponibles detectado. Se conserva para conciliacion y revision; no modifica saldos automaticamente.','BALANCE_SNAPSHOT_REVIEW_GATE',{balances:parseBalances(body)});
  if(settlementWord.test(c)||settlementRows.length>0||(planWord.test(c)&&hasJuega&&hasConsigue))return operational('settlement_snapshot','monetary',.99,'Liquidacion o cuadre detectado. Requiere conciliacion completa antes de afectar saldos o premios.','SETTLEMENT_REVIEW_GATE',{board,offers:parseOffers(body),settlementRows});
  if(planWord.test(c)&&hasJuega)return operational('plan_snapshot','monetary',.985,'Plano de tercios detectado. Se registra para comparar ofertas y confirmaciones; no ejecuta jugadas.','PLAN_REVIEW_GATE',{board,offers:parseOffers(body)});
  if(resultWord.test(c)&&board.length)return operational('race_result','review',.99,'Llegada o pizarra detectada. Se validara contra la carrera activa antes de aplicar resultados.','RESULT_REVIEW_GATE',{board});
  if(pendingConfirmation.test(c))return operational('pending_confirmation','monetary',.985,'Confirmacion pendiente detectada. La jugada permanece sin efecto hasta quedar vinculada y validada.','PENDING_CONFIRMATION_GATE',{confirmation:c});
  if(cancelOrCorrection.test(c))return operational('cancel_or_correction','monetary',.985,'Anulacion o correccion detectada. Debe vincularse a la jugada original antes de cualquier cambio.','CORRECTION_REVIEW_GATE');
  if(exactConfirmation.test(c))return operational('offer_confirmation','monetary',.98,'Confirmacion corta detectada. Debe enlazarse con la oferta correcta antes de confirmar la operacion.','CONFIRMATION_REVIEW_GATE',{confirmation:c});

  if(receiverOffer.test(c)||playerOffer.test(c)){
    const offer=offerFromLine(body);
    const receiver=Boolean(offer?.role==='receiver');
    const entities=offer?{
      role:offer.role,play:offer.play,horse:offer.horse,amount:offer.amount,
      participant:offer.participant,counterparty:offer.counterparty,offers:[offer]
    }:{};
    return operational(receiver?'offer_receiver':'offer_player','monetary',.995,receiver?'Oferta CONSIGUE detectada. Queda pendiente de emparejamiento y validacion; no afecta saldos.':'Oferta JUEGA detectada. Queda pendiente de emparejamiento y validacion; no afecta saldos.',receiver?'RECEIVER_OFFER_REVIEW_GATE':'PLAYER_OFFER_REVIEW_GATE',entities);
  }

  if(pollaOrParley.test(c))return operational('polla_or_parley','monetary',.99,'Operacion POLLA/PARLEY detectada. Requiere revision del operador antes de cualquier efecto monetario.','POLLA_PARLEY_REVIEW_GATE',{amount:extractAmount(body)});
  if(genericMonetary.test(c))return operational('betting_or_balance','monetary',.97,'Contenido monetario u operativo detectado. Queda pendiente de revision antes de afectar jugadas, riesgo o saldos.','MONETARY_REVIEW_GATE',{amount:extractAmount(body)});

  if(greeting.test(c))return{intent:'greeting',risk:'safe',confidence:.99,suggestion:'Hola. Soy el asistente de Control Hipico. Puedo recibir consultas operativas; jugadas, saldos, cierres y resultados pasan controles adicionales.',autoEligible:true,reason:'SAFE_GREETING'};
  if(help.test(c))return{intent:'help',risk:'safe',confidence:.96,suggestion:'Puedo ayudar con el flujo de carrera y dudas de uso. Jugadas, saldos, cierres y resultados requieren validacion.',autoEligible:true,reason:'SAFE_HELP'};
  if(status.test(c))return{intent:'status_non_monetary',risk:'safe',confidence:.9,suggestion:'Mensaje de estado recibido. Si la consulta implica dinero o una jugada, no se confirmara automaticamente.',autoEligible:true,reason:'SAFE_STATUS'};

  return{intent:'conversation',risk:'review',confidence:.65,suggestion:'Mensaje recibido para revision. No se ejecuto ninguna operacion automatica.',autoEligible:false,reason:'AMBIGUOUS'};
}
