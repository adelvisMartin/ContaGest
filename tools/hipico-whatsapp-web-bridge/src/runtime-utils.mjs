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

  const reset = headers?.get?.('ratelimit-reset') || headers?.get?.('x-ratelimit-reset') || '';
  if (reset) {
    const numeric = Number(reset);
    if (Number.isFinite(numeric)) {
      if (numeric > 10_000_000_000) return Math.max(1000, numeric - now);
      if (numeric > 1_000_000_000) return Math.max(1000, numeric * 1000 - now);
      return Math.max(1000, numeric * 1000);
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

  const day = Number(dm[1]);
  const month = Number(dm[2]);
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
const resultWord = /\b(?:LLEGADA|PIZARRA|RESULTADO|GANO|PRIMERO|SEGUNDO|TERCERO)\b/;
const balanceSnapshot = /\bTERCIO\s+DISPONIBLE\b/;
const settlementWord = /\b(?:LIQUIDACION|LIQUIDAR|LIQUIDADO|CUADRE|CUADRE\s+FINAL)\b/;
const planWord = /\bTERCIOS\b/;
const playerOffer = /^(?:JUEGO|JUEGA)\b/;
const receiverOffer = /^(?:CONSIGO|CONSIGUE)\b/;
const pendingConfirmation = /\b(?:DEBE\s+CONFIRMAR|POR\s+CONFIRMAR|FALTA\s+CONFIRMAR|ESPERANDO\s+CONFIRMACION)\b/;
const exactConfirmation = /^(?:J|JUGANDO|SF|S\s*\/\s*F|SE\s+FUE|OK|CONFIRMADO)$/;
const cancelOrCorrection = /\b(?:ANULA|ANULADO|ANULAR|CANCELA|CANCELADO|CANCELAR|CORRIGE|CORREGIR|CORRECCION|BORRA\s+(?:ESA|LA)\s+JUGADA|CAMBIA\s+(?:ESA|LA)\s+JUGADA)\b/;
const pollaOrParley = /\b(?:POLLA|PARLEY)\b/;
const genericMonetary = /\b(?:APUESTA|JUGADA|MONTO|SALDO|DISPONIBLE|DISPONIBLES|DEBO|DEBE|PAGO|COBRO|PREMIO|RIESGO)\b|\b\d[\d.,]*\s*(?:K|MIL|MM?|MILLON(?:ES)?|BS\.?|USD|\$)\b/;
const greeting = /^(?:HOLA|BUENAS?|SALUDOS|BUEN\s+DIA|BUENAS\s+TARDES|BUENAS\s+NOCHES)\b/;
const help = /\b(?:AYUDA|COMO\s+FUNCIONA|INSTRUCCIONES|MENU|OPCIONES)\b/;
const status = /\b(?:ESTADO|RECIBIDO|PENDIENTE|REVISANDO|YA\s+LLEGO)\b/;

const PLAY_RE = /(?:\d{1,2}\s*A\s*\d{1,2}(?:[.,]\d+)?|[1-6]\s*(?:Y|\/)\s*[1-6]|[1-6]NN?|[1-6]P|PP|PK|MAR|PLA|SHOW|RET|TF|LOGRO)/i;
const NUMBER_SOURCE = '[+-]?(?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d+)?)';
const UNIT_SOURCE = '(?:K|MIL|MM?|MILLON(?:ES)?|BS\\.?|USD|\\$)?';

function numeric(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  let normalized = value;
  if (value.includes(',') && value.includes('.')) normalized = value.replace(/\./g, '').replace(',', '.');
  else if (value.includes(',')) normalized = value.replace(',', '.');
  else if (/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(value)) normalized = value.replace(/\./g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function withUnit(value, unit) {
  if (value == null) return null;
  const u = canonical(unit).replace(/\./g, '');
  if (u === 'K' || u === 'MIL') return value * 1000;
  if (u === 'M' || u === 'MM' || u === 'MILLON' || u === 'MILLONES') return value * 1000000;
  return value;
}

function normalizePlay(raw) {
  let value = canonical(raw).replace(/\s/g, '');
  if (/^[1-6]Y[1-6]$/.test(value)) value = value.replace('Y', '/');
  if (/^[1-6]NN$/.test(value)) value = `${value[0]}N`;
  if (/^\d{1,2}A\d{1,2}/.test(value)) value = value.replace(',', '.');
  return value;
}

function extractAmount(raw) {
  const source = plain(raw);
  const con = [...source.matchAll(new RegExp(`\\bcon\\s+(${NUMBER_SOURCE})\\s*(${UNIT_SOURCE})`, 'gi'))].at(-1);
  if (con) return withUnit(numeric(con[1]), con[2] || '');
  const units = [...source.matchAll(new RegExp(`(?:BS\\.?\\s*)?(${NUMBER_SOURCE})\\s*(K|MIL|MM?|MILLON(?:ES)?|BS\\.?|USD|\\$)\\b`, 'gi'))].at(-1);
  return units ? withUnit(numeric(units[1]), units[2] || '') : null;
}

function normalizeHorse(raw) {
  return String(raw || '').replace(/\s/g, '').replace(/X/gi, '*').toUpperCase();
}

function extractHorse(raw) {
  const c = canonical(raw);
  const direct = c.match(/\b(?:DEL?|CABALLO|EL)\s+(\d+(?:\s*[X*]\s*\d+)?|PA|IM|RE)\b/);
  if (direct) return normalizeHorse(direct[1]);
  const al = c.match(/\bAL\s+(?:CABALLO\s+)?(\d+(?:\s*[X*]\s*\d+)?|PA|IM|RE)\b/);
  if (al) return normalizeHorse(al[1]);
  const parenthesized = c.match(new RegExp(`${PLAY_RE.source}\\s*\\(\\s*(\\d+|PA|IM|RE)\\s*\\)`, 'i'));
  if (parenthesized) return normalizeHorse(parenthesized[1]);
  const pair = c.replace(/^(?:JUEGO|JUEGA|CONSIGO|CONSIGUE)\s+/, '').match(/^(\d+)\s*[X*]\s*(\d+)\b/);
  if (pair) return `${pair[1]}*${pair[2]}`;
  const playMatch = c.match(PLAY_RE);
  if (playMatch?.index != null) {
    const after = c.slice(playMatch.index + playMatch[0].length).trim();
    const bare = after.match(/^(\d+|PA|IM|RE)\b/);
    if (bare) return normalizeHorse(bare[1]);
  }
  return '';
}

function planParties(raw) {
  const source = plain(raw).trim();
  if (!/^JUEGA\b/i.test(source)) return {};
  const re = new RegExp(`^JUEGA\\s+(.+?)\\s+(${PLAY_RE.source})\\s*(?:\\([^)]*\\))?\\s+CON\\b[\\s\\S]*?\\bDA\\s+(.+?)\\s*$`, 'i');
  const match = source.match(re);
  if (!match) return {};
  return { participant: match[1].trim(), counterparty: match[3].trim() };
}

export function parseOperationalOffer(raw) {
  const c = canonical(raw);
  const player = playerOffer.test(c);
  const receiver = receiverOffer.test(c);
  if (!player && !receiver) return null;
  const pair = c.replace(/^(?:JUEGO|JUEGA|CONSIGO|CONSIGUE)\s+/, '').match(/^(\d+)\s*[X*]\s*(\d+)\b/);
  const playMatch = c.match(PLAY_RE);
  const parties = planParties(raw);
  return {
    role: receiver ? 'receiver' : 'player',
    play: pair ? 'PP' : (playMatch ? normalizePlay(playMatch[0]) : ''),
    horse: extractHorse(raw),
    amount: extractAmount(raw),
    ...parties,
    raw: String(raw || '').trim()
  };
}

function parseOffers(text) {
  return String(text || '').split(/\n+/).map((line) => parseOperationalOffer(line)).filter(Boolean);
}

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

function parseBalances(text) {
  const lines = String(text || '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => balanceSnapshot.test(canonical(line)));
  if (start < 0) return [];
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^(.+?)\s+(?:Bs\.?\s*)?([+-]?[\d.]+(?:,\d{1,2})?)\s*$/i);
    if (!match) continue;
    const available = numeric(match[2]);
    if (available == null) continue;
    rows.push({ participant: match[1].trim(), available });
  }
  return rows;
}

function parseSettlementRows(text) {
  const rows = [];
  for (const line of String(text || '').split(/\n+/).map((item) => item.trim()).filter(Boolean)) {
    const match = line.match(/^(Juega|Consigue)\s+(.+?)\s+Bs\.?\s+([+-]?[\d.]+(?:,\d{1,2})?)\s*$/i);
    if (!match) continue;
    const amount = numeric(match[3]);
    if (amount == null) continue;
    rows.push({ role: /^Consigue$/i.test(match[1]) ? 'receiver' : 'player', participant: match[2].trim(), amount });
  }
  return rows;
}

export function classifyLocal(text) {
  const body = String(text || '').trim();
  if (!body) return { intent: 'empty', risk: 'review', confidence: 0, entities: {} };
  const c = canonical(body);
  const board = parseBoard(body);
  const hasJuega = /\bJUEGA\b/.test(c);
  const hasConsigue = /\bCONSIGUE\b/.test(c);
  const settlementRows = parseSettlementRows(body);

  if (dayClose.test(c)) return { intent: 'day_close', risk: 'review', confidence: 0.995, entities: {} };
  if (raceClose.test(c)) return { intent: 'race_close', risk: 'review', confidence: 0.995, entities: { raceNumber: parseRaceNumber(body) } };
  if (balanceSnapshot.test(c)) return { intent: 'balance_snapshot', risk: 'monetary', confidence: 0.995, entities: { balances: parseBalances(body) } };
  if (settlementWord.test(c) || settlementRows.length > 0 || (planWord.test(c) && hasJuega && hasConsigue)) {
    return { intent: 'settlement_snapshot', risk: 'monetary', confidence: 0.99, entities: { board, offers: parseOffers(body), settlementRows } };
  }
  if (planWord.test(c) && hasJuega) {
    return { intent: 'plan_snapshot', risk: 'monetary', confidence: 0.985, entities: { board, offers: parseOffers(body) } };
  }
  if (resultWord.test(c) && board.length) return { intent: 'race_result', risk: 'review', confidence: 0.99, entities: { board } };
  if (pendingConfirmation.test(c)) return { intent: 'pending_confirmation', risk: 'monetary', confidence: 0.985, entities: { confirmation: c } };
  if (cancelOrCorrection.test(c)) return { intent: 'cancel_or_correction', risk: 'monetary', confidence: 0.985, entities: {} };
  if (exactConfirmation.test(c)) return { intent: 'offer_confirmation', risk: 'monetary', confidence: 0.98, entities: { confirmation: c } };
  if (receiverOffer.test(c) || playerOffer.test(c)) {
    const offer = parseOperationalOffer(body);
    return { intent: offer?.role === 'receiver' ? 'offer_receiver' : 'offer_player', risk: 'monetary', confidence: 0.995, entities: offer || {} };
  }
  if (pollaOrParley.test(c)) return { intent: 'polla_or_parley', risk: 'monetary', confidence: 0.99, entities: { amount: extractAmount(body) } };
  if (genericMonetary.test(c)) return { intent: 'betting_or_balance', risk: 'monetary', confidence: 0.92, entities: { amount: extractAmount(body) } };
  if (greeting.test(c)) return { intent: 'greeting', risk: 'safe', confidence: 0.995, entities: {} };
  if (help.test(c)) return { intent: 'help', risk: 'safe', confidence: 0.99, entities: {} };
  if (status.test(c)) return { intent: 'status_non_monetary', risk: 'safe', confidence: 0.97, entities: {} };
  return { intent: 'conversation', risk: 'safe', confidence: 0.9, entities: {} };
}
