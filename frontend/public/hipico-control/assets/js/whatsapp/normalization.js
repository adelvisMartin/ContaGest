const DEFAULT_TRACKS = [
  'DEL MAR', 'SARATOGA', 'WOODBINE', 'INDIANAPOLIS', 'INDIANÁPOLIS',
  'CHARLES TOWN', 'CHARLESTOWN', 'GULFSTREAM PARK', 'GULFSTREAM',
  'PARX RACING', 'PARX', 'BELMONT', 'CHURCHILL DOWNS', 'CHURCHILL DOWN', 'COLONIAL DOWNS', 'COLONIAL DOWN',
  'LAUREL PARK', 'SANTA ANITA', 'AQUEDUCT', 'KEENELAND', 'PIMLICO',
  'MONMOUTH PARK', 'ELLIS PARK', 'HORSESHOE INDIANAPOLIS', 'LA RINCONADA',
  'VALENCIA'
];

export function plain(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function compact(value) {
  return plain(value).toUpperCase().replace(/\s+/g, ' ').trim();
}

export function idPart(value) {
  return compact(value).replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'MENSAJE';
}

function parseClock(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})\s*([ap])/i);
  if (!match) return { hour: 0, minute: 0 };
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridian = match[3].toLowerCase();
  if (meridian === 'p' && hour < 12) hour += 12;
  if (meridian === 'a' && hour === 12) hour = 0;
  return { hour, minute };
}

export function parseDateTime(dateText, timeText) {
  const parts = String(dateText || '').split('/').map(Number);
  if (parts.length !== 3) return null;
  let [day, month, year] = parts;
  if (year < 100) year += 2000;
  const { hour, minute } = parseClock(timeText);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function amountValue(raw, unit = '') {
  const text = String(raw || '').replace(/\./g, '').replace(',', '.');
  const number = Number(text);
  if (!Number.isFinite(number)) return 0;
  const normalizedUnit = compact(unit);
  if (['K', 'MIL'].includes(normalizedUnit)) return number * 1000;
  if (['M', 'MM', 'MILLON', 'MILLONES'].includes(normalizedUnit)) return number * 1000000;
  return number;
}

export function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits : '';
}

export function normalizeSender(value) {
  return String(value || '').replace(/^~/, '').trim();
}

export function findTrack(text, catalog = []) {
  const haystack = compact(text);
  const tracks = [...new Set([...catalog, ...DEFAULT_TRACKS].filter(Boolean).map(String))]
    .sort((a, b) => b.length - a.length);
  const found = tracks.find((track) => haystack.includes(compact(track)));
  if (!found) return '';
  const normalized = compact(found);
  if (normalized === 'INDIANAPOLIS') return 'Horseshoe Indianapolis';
  if (normalized === 'CHARLESTOWN') return 'Charles Town';
  if (normalized === 'PARX') return 'Parx Racing';
  if (normalized === 'GULFSTREAM') return 'Gulfstream Park';
  if (normalized === 'CHURCHILL DOWN') return 'Churchill Downs';
  if (normalized === 'COLONIAL DOWN') return 'Colonial Downs';
  return found.toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export function normalizeChatPlay(raw) {
  const value = compact(raw).replace(/\s/g, '');
  if (!value) return '';
  if (/^[1-6]Y[1-6]$/.test(value)) return value.replace('Y', '/');
  if (/^[1-6]\/[1-6]$/.test(value)) return value;
  if (/^[1-6]NN$/.test(value)) return `${value[0]}N`;
  if (/^[1-6][NP]$/.test(value)) return value;
  if (/^10A/.test(value)) return value.replace(',', '.');
  const aliases = { SHOW: 'SHOW', PP: 'PP', PK: 'PK', MAR: 'MAR', PLA: 'PLA', RET: 'RET', TF: 'TF', LOGRO: 'LOGRO' };
  return aliases[value] || value;
}

export function extractAmount(text) {
  const matches = [...String(text || '').matchAll(/(\d+(?:[.,]\d+)?)\s*(k|mil|mm?|mill[oó]n(?:es)?|bs\.?)\b/gi)];
  if (matches.length) {
    const match = matches.at(-1);
    return { amount: amountValue(match[1], match[2]), raw: match[0], index: match.index ?? -1 };
  }
  const con = String(text || '').match(/\bcon\s+(\d+(?:[.,]\d+)?)/i);
  if (con) return { amount: amountValue(con[1]), raw: con[0], index: con.index ?? -1 };
  return { amount: 0, raw: '', index: -1 };
}

export function extractHorse(textBeforeAmount, playMatches) {
  const normalized = compact(textBeforeAmount);
  const del = normalized.match(/\bDEL?\s+([0-9]+(?:\s*[X*]\s*[0-9]+)?|PA|IM|RE)\b/i);
  if (del) return del[1].replace(/\s/g, '').replace(/X/g, '*');
  const tokens = [...normalized.matchAll(/\b([0-9]+(?:\s*[X*]\s*[0-9]+)?|PA|IM|RE)\b/gi)];
  const playEnds = playMatches.map((match) => (match.index ?? 0) + match[0].length);
  const candidates = tokens.filter((token) => !playEnds.some((end) => (token.index ?? 0) < end && (token.index ?? 0) + token[0].length <= end));
  return candidates.at(-1)?.[1]?.replace(/\s/g, '').replace(/X/g, '*') || '';
}

export function detectPairOnly(textBeforeAmount) {
  const body = compact(textBeforeAmount).replace(/^(JUEGO|JUEGA|CONSIGO|CONSIGUE)\s+/, '');
  const match = body.match(/^(\d+)\s*[X*]\s*(\d+)(?:\s+|$)/);
  return match ? `${match[1]}*${match[2]}` : '';
}

export const __test__ = Object.freeze({ DEFAULT_TRACKS, amountValue, parseClock });
