import crypto from 'node:crypto';

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}
export function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function splitGroupMatches(value) {
  return String(value || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function sourceTitleMatches(title, matches) {
  const nTitle = normalize(title);
  return matches.some((candidate) => nTitle === normalize(candidate) || nTitle.includes(normalize(candidate)));
}

export function parseRetryAfterMs(headers, now = Date.now()) {
  const raw = headers?.get?.('retry-after') || '';
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1000, Math.ceil(seconds * 1000));
    const date = Date.parse(raw);
    if (Number.isFinite(date)) return Math.max(1000, date - now);
  }

  // express-rate-limit standard headers may expose remaining/reset information.
  const reset = headers?.get?.('ratelimit-reset') || headers?.get?.('x-ratelimit-reset') || '';
  if (reset) {
    const numeric = Number(reset);
    if (Number.isFinite(numeric)) {
      if (numeric > 10_000_000_000) return Math.max(1000, numeric - now); // epoch ms
      if (numeric > 1_000_000_000) return Math.max(1000, numeric * 1000 - now); // epoch sec
      return Math.max(1000, numeric * 1000); // delta sec
    }
  }
  return null;
}

export function computeBackoffMs(attempts, {
  baseMs = 5000,
  maxMs = 900000,
  jitter = 0
} = {}) {
  const exp = Math.min(20, Math.max(0, Number(attempts || 0) - 1));
  const raw = Math.min(maxMs, baseMs * (2 ** exp));
  if (!jitter) return raw;
  const delta = Math.round(raw * Math.min(0.5, Math.max(0, jitter)));
  return raw + Math.floor(Math.random() * (delta * 2 + 1)) - delta;
}

function normalizeMeridiem(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s/g, '')
    .replace(/a\.?m\.?/g, 'am')
    .replace(/p\.?m\.?/g, 'pm');
}

export function parseWhatsAppPre(pre, fallbackNow = new Date()) {
  const raw = String(pre || '').trim();
  const bracket = raw.match(/^\[([^\]]+)\]\s*(.*?):\s*$/);
  if (!bracket) {
    return { timestamp: fallbackNow.toISOString(), senderLabel: '', parsed: false };
  }

  const stamp = bracket[1].trim();
  const senderLabel = bracket[2].trim();
  const parts = stamp.split(',').map((part) => part.trim()).filter(Boolean);
  let datePart = '';
  let timePart = '';

  for (const part of parts) {
    if (/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(part)) datePart = part;
    else if (/\d{1,2}:\d{2}/.test(part)) timePart = part;
  }

  if (!datePart || !timePart) {
    return { timestamp: fallbackNow.toISOString(), senderLabel, parsed: false };
  }

  const dm = datePart.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  const tm = timePart.match(/(\d{1,2}):(\d{2})\s*(.*)$/);
  if (!dm || !tm) return { timestamp: fallbackNow.toISOString(), senderLabel, parsed: false };

  let day = Number(dm[1]);
  let month = Number(dm[2]);
  let year = Number(dm[3]);
  if (year < 100) year += 2000;
  let hour = Number(tm[1]);
  const minute = Number(tm[2]);
  const meridiem = normalizeMeridiem(tm[3]);

  if (meridiem.includes('pm') && hour < 12) hour += 12;
  if (meridiem.includes('am') && hour === 12) hour = 0;

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(date.getTime())) return { timestamp: fallbackNow.toISOString(), senderLabel, parsed: false };
  return { timestamp: date.toISOString(), senderLabel, parsed: true };
}

const plain = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const canonical = (value) => plain(value).replace(/[“”"'`]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const raceClose = /\b(?:CIERRA|CIERRE|CERRAR|CERRAMOS|CIERREN|CERRADA|CERRADO|NO\s+MAS\s+JUGADAS?|NO\s+VA\s+MAS|CARRERA\s+CERRADA|CERRADO\s+CERRADO|FIN\s+DE\s+CARRERA)\b/;
const dayClose = /\b(?:ESTO\s+ES\s+TODO\s+POR\s+EL\s+DIA\s+DE\s+HOY|LOS\s+ESPERAMOS\s+MANANA|CIERRE\s+DE\s+JORNADA|CERRAMOS\s+LA\s+JORNADA)\b/;
const result = /\b(?:LLEGADA|PIZARRA|RESULTADO|GANO|PRIMERO|SEGUNDO|TERCERO)\b/;
const balanceSnapshot = /\bTERCIO\s+DISPONIBLE\b/;
const settlementWord = /\b(?:LIQUIDACION|LIQUIDAR|LIQUIDADO|CUADRE|CUADRE\s+FINAL)\b/;
const planWord = /\bTERCIOS\b/;
const playerOffer = /^(?:JUEGO|JUEGA)\b/;
const receiverOffer = /^(?:CONSIGO|CONSIGUE)\b/;
const pendingConfirmation = /\b(?:DEBE\s+CONFIRMAR|POR\s+CONFIRMAR|FALTA\s+CONFIRMAR|ESPERANDO\s+CONFIRMACION)\b/;
const exactConfirmation = /^(?:J|JUGANDO|SF|S\s*\/\s*F|SE\s+FUE|OK|CONFIRMADO)$/;
const cancelOrCorrection = /\b(?:ANULA|ANULADO|ANULAR|CANCELA|CANCELADO|CANCELAR|CORRIGE|CORREGIR|CORRECCION|BORRA\s+(?:ESA|LA)\s+JUGADA|CAMBIA\s+(?:ESA|LA)\s+JUGADA)\b/;
const pollaOrParley = /\b(?:POLLA|PARLEY)\b/;
const genericMonetary = /\b(?:APUESTA|JUGADA|MONTO|SALDO|DISPONIBLE|DISPONIBLES|DEBO|DEBE|PAGO|COBRO|PREMIO|RIESGO)\b|\b\d+(?:[.,]\d+)?\s*(?:K|MIL|MM?|MILLON(?:ES)?|BS|USD|\$)\b/;
const greeting = /^(?:HOLA|BUENAS?|SALUDOS|BUEN\s+DIA|BUENAS\s+TARDES|BUENAS\s+NOCHES)\b/;
const help = /\b(?:AYUDA|COMO\s+FUNCIONA|INSTRUCCIONES|MENU|OPCIONES)\b/;
const status = /\b(?:ESTADO|RECIBIDO|PENDIENTE|REVISANDO|YA\s+LLEGO)\b/;

function parseBoard(text) {
  const source = plain(text);
  const arrival = source.match(/\bllegada\s+(?:\d{1,2}\s*(?:na|ra|da|ta)\s+)?([0-9][0-9.\s,\-]*)/i);
  const board = source.match(/\bpizarra\s*[:\-]?\s*([0-9][0-9.\s,\-]*)/i);
  const resultMatch = source.match(/\bresultado\s*[:\-]?\s*([0-9][0-9.\s,\-]*)/i);
  const match = arrival || board || resultMatch;
  return match ? match[1].split(/[.\s,\-]+/).map((item) => item.trim()).filter(Boolean).slice(0, 6) : [];
}

function parseRaceNumber(text) {
  const c = canonical(text);
  const explicit = c.match(/\bCARRERA\s+(\d{1,3})\b/);
  if (explicit) return Number(explicit[1]);
  const short = c.match(/\b(?:CIERRA|CIERRE|CERRAR|CERRAMOS|CIERREN|NO\s+VA\s+MAS)\s+(?:LA\s+)?(\d{1,3})\b/);
  return short ? Number(short[1]) : null;
}

function basicOffer(text, role) {
  const c = canonical(text);
  const amountMatch = c.match(/\bCON\s+(\d+(?:[.,]\d+)?)\s*(K|MIL|MM?|MILLON(?:ES)?|BS|USD)?\b/) ||
    c.match(/^(?:JUEGO|JUEGA|CONSIGO|CONSIGUE)\s+(\d+(?:[.,]\d+)?)\s+(?:AL|AL\s+CABALLO|CABALLO)\b/);
  let amount = amountMatch ? Number(String(amountMatch[1]).replace(',', '.')) : null;
  const unit = amountMatch?.[2] || '';
  if (amount != null && /^(K|MIL)$/i.test(unit)) amount *= 1000;
  if (amount != null && /^(M|MM|MILLON|MILLONES)$/i.test(unit)) amount *= 1000000;
  const horseMatch = c.match(/\b(?:DEL?|CABALLO|AL)\s+(?:CABALLO\s+)?([0-9]+(?:\s*[X*]\s*[0-9]+)?|PA|IM|RE)\b/);
  const playMatch = c.match(/\b(?:[1-6]\s*(?:Y|\/)\s*[1-6]|[1-6]NN?|[1-6]P|PP|PK|MAR|PLA|SHOW|RET|TF|LOGRO)\b/);
  return {
    role,
    amount,
    horse: horseMatch ? horseMatch[1].replace(/\s/g, '').replace(/X/g, '*') : '',
    play: playMatch ? playMatch[0].replace(/Y/g, '/').replace(/\s/g, '') : ''
  };
}

export function classifyLocal(text) {
  const body = String(text || '').trim();
  if (!body) return { intent: 'empty', risk: 'review', confidence: 0, entities: {} };
  const c = canonical(body);
  if (dayClose.test(c)) return { intent: 'day_close', risk: 'review', confidence: 0.995, entities: {} };
  if (raceClose.test(c)) return { intent: 'race_close', risk: 'review', confidence: 0.995, entities: { raceNumber: parseRaceNumber(body) } };
  if (result.test(c)) return { intent: 'race_result', risk: 'review', confidence: 0.99, entities: { board: parseBoard(body) } };
  if (balanceSnapshot.test(c)) return { intent: 'balance_snapshot', risk: 'monetary', confidence: 0.995, entities: {} };
  const hasJuega = /\bJUEGA\b/.test(c);
  const hasConsigue = /\bCONSIGUE\b/.test(c);
  if (settlementWord.test(c) || (planWord.test(c) && hasJuega && hasConsigue)) return { intent: 'settlement_snapshot', risk: 'monetary', confidence: 0.985, entities: {} };
  if (planWord.test(c) && hasJuega) return { intent: 'plan_snapshot', risk: 'monetary', confidence: 0.98, entities: {} };
  if (pendingConfirmation.test(c)) return { intent: 'pending_confirmation', risk: 'monetary', confidence: 0.985, entities: { confirmation: c } };
  if (cancelOrCorrection.test(c)) return { intent: 'cancel_or_correction', risk: 'monetary', confidence: 0.985, entities: {} };
  if (exactConfirmation.test(c)) return { intent: 'offer_confirmation', risk: 'monetary', confidence: 0.98, entities: { confirmation: c } };
  if (receiverOffer.test(c)) return { intent: 'offer_receiver', risk: 'monetary', confidence: 0.995, entities: basicOffer(body, 'receiver') };
  if (playerOffer.test(c)) return { intent: 'offer_player', risk: 'monetary', confidence: 0.995, entities: basicOffer(body, 'player') };
  if (pollaOrParley.test(c)) return { intent: 'polla_or_parley', risk: 'monetary', confidence: 0.99, entities: {} };
  if (genericMonetary.test(c)) return { intent: 'betting_or_balance', risk: 'monetary', confidence: 0.92, entities: {} };
  if (greeting.test(c)) return { intent: 'greeting', risk: 'safe', confidence: 0.995, entities: {} };
  if (help.test(c)) return { intent: 'help', risk: 'safe', confidence: 0.99, entities: {} };
  if (status.test(c)) return { intent: 'status_non_monetary', risk: 'safe', confidence: 0.97, entities: {} };
  return { intent: 'conversation', risk: 'safe', confidence: 0.9, entities: {} };
}
