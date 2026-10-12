import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { atomicWriteJson } from './spool-journal.mjs';
import { normalize } from './runtime-utils.mjs';
import { normalizeGroupId } from './group-identity.mjs';
import { parseLabRaceSlotReply, validLabTrack, validLabDate } from './lab-race-slots.mjs';

// LAB-only non-authoritative conversation hints. No message content, money or sender names are persisted.
const SCHEMA_VERSION = 1;
const DEFAULT_TTL_MS = 20 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 300;
const RACE_PATTERN = /\bcarrera\s*(?:n(?:umero|ro)?\s*)?(\d{1,2})\b/;
const ORDINAL_NUMBER_PATTERN = /\b(?:la\s+)?([1-9]\d?)\s*(?:ra|da|ta|ma)\b/;
const ORDINAL_WORD_PATTERN = /\bla\s+(primera|segunda|tercera|cuarta|quinta|sexta|septima|octava|novena|decima)\b/;
const ORDINAL_WORDS = Object.freeze({primera:1,segunda:2,tercera:3,cuarta:4,quinta:5,sexta:6,septima:7,octava:8,novena:9,decima:10});
const FOLLOW_UP_PATTERN = /\b(?:esa|ese|esta|este|misma|mismo|anterior|participantes|caballos|corren|resultado)\b/;
const QUESTION_PATTERN = /[¿?]|\b(?:quien|quienes|cual|cuando|donde|como|sigue|proxima|proximo)\b/;
const BOT_PATTERN = /\b(?:bot|control hipico)\b/;
const SUMMARY_PATTERN = /\b(?:resumen|resumeme|resumir|recapitulacion|que hemos hablado)\b/;

// Participant identity is accepted only when a WhatsApp DOM message ID contains
// exactly one participant JID. Display names are not stable or unique; never key
// shared memory by a nickname or raw message content.
export function stableLabSenderKey(messageId){
  const id=String(messageId||'');
  const matches=[...id.matchAll(/(?:^|_)(\d{6,}(?:-\d+)?@c\.us|\d{6,}@lid)(?=_|$)/gi)]
    .map(match=>match[1].toLowerCase());
  const unique=[...new Set(matches)];
  return unique.length===1?unique[0]:'';
}

function validRaceNumber(number) {
  return Number.isInteger(number) && number >= 1 && number <= 99;
}

function safeRaceScope(value) {
  if (!value || !validRaceNumber(value.raceNumber)) return null;
  const racetrack = String(value.racetrack || '').trim();
  const raceDate = String(value.raceDate || '');
  if (racetrack.length < 2 || racetrack.length > 80 ||
      !/^[\p{L}\p{N} -]+$/u.test(racetrack) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) return null;
  const [year, month, day] = raceDate.split('-').map(Number);
  const actual = new Date(Date.UTC(year, month - 1, day));
  if (actual.getUTCFullYear() !== year || actual.getUTCMonth() !== month - 1 ||
      actual.getUTCDate() !== day) return null;
  return { raceNumber: value.raceNumber, racetrack, raceDate };
}

function mentionedRaceNumber(normalized) {
  const explicit = normalized.match(RACE_PATTERN);
  const numeric = normalized.match(ORDINAL_NUMBER_PATTERN);
  const word = normalized.match(ORDINAL_WORD_PATTERN);
  const value = explicit ? Number(explicit[1])
    : numeric ? Number(numeric[1]) : word ? ORDINAL_WORDS[word[1]] : null;
  return validRaceNumber(value) ? value : null;
}

// A follow-up that supplies only track + ISO date may complete a *previous*
// race number from the SAME pinned LAB sender and unexpired memory entry.
// Never mine free-form prose, implicit "today" dates, money, or a new race.
export function resolveLabRaceClarification(text, priorContext, classification) {
  if (classification?.risk !== 'safe' || classification?.intent !== 'conversation') return null;
  const slots = parseLabRaceSlotReply(text, priorContext);
  if (!slots) return null;
  // Omit parser metadata from public planner contracts.
  const { complete, ...reference } = slots;
  return reference;
}

export function labConversationInput(row, classification, priorContext = null) {
  const content = String(row?.text || '').trim();
  if (!row?.id || row.fromMe || row.hasMedia || !content || content.length > 4000) return { eligible: false, reason: 'IGNORED' };
  if (/\[(?:SHADOW|LABTEST):|🧪\s*CONTROL HÍPICO/i.test(content)) return { eligible: false, reason: 'BOT_ECHO' };
  if (classification?.intent === 'empty') return { eligible: false, reason: 'EMPTY' };
  const normalized = normalize(content);
  if (classification?.intent === 'conversation' && !QUESTION_PATTERN.test(normalized) && !BOT_PATTERN.test(normalized) && !SUMMARY_PATTERN.test(normalized) && !resolveLabRaceClarification(content, priorContext, classification)) {
    return { eligible: false, reason: 'CASUAL_CHAT' };
  }
  return { eligible: true, reason: 'RESPONSE_CANDIDATE' };
}

export function planLabConversation(row, classification, priorContext = null, suppliedScope = null) {
  const normalized = normalize(row?.text);
  const sender = stableLabSenderKey(row?.id);
  const risk = classification?.risk || 'review';
  const safeRace = mentionedRaceNumber(normalized);
  const isQuestion = QUESTION_PATTERN.test(normalized) || classification?.intent === 'status_non_monetary';
  const summaryRequested = risk === 'safe' && SUMMARY_PATTERN.test(normalized);
  // The LAB backend now supports status and internally confirmed results; unavailable topics remain explicit.
  const unsupportedQuestion = /\b(?:retiros|horario|hora|oficial)\b/.test(normalized);
  const statusQuestion = /\b(?:estado|estatus|situacion|como va|abierta|abierto|cerrada|cerrado)\b/.test(normalized);
  const resultQuestion = /\b(?:resultado|ganador|gano|llegada|pizarra)\b/.test(normalized);
  const participantsQuestion = /\b(?:participantes|quienes corren|caballos|ejemplares|inscritos)\b/.test(normalized);
  const queryCategory = risk === 'safe' && isQuestion && !summaryRequested
    ? (unsupportedQuestion ? 'UNSUPPORTED' : resultQuestion ? 'RESULT' : participantsQuestion ? 'PARTICIPANTS' : statusQuestion ? 'STATUS' : 'UNKNOWN')
    : 'NONE';
  const followUp = FOLLOW_UP_PATTERN.test(normalized);
  // Monetary/state-changing messages never inherit or store a race reference.
  const previousRace = risk === 'safe' && sender && validRaceNumber(priorContext?.raceNumber)
    ? priorContext.raceNumber : null;
  const previousScope = sender ? safeRaceScope(priorContext?.raceScope) : null;
  const clarification = risk === 'safe' && sender && !suppliedScope
    ? resolveLabRaceClarification(row?.text, priorContext, classification) : null;
  const clarificationScope = safeRaceScope(clarification);
  const explicitScope = risk === 'safe' ? (safeRaceScope(suppliedScope) || clarificationScope) : null;
  // A message mentioning race X cannot inherit (or overwrite) scope Y.
  const conflictingRace = Boolean(explicitScope && safeRace && explicitScope.raceNumber !== safeRace);
  const reuseReference = followUp || summaryRequested || Boolean(clarification);
  const raceNumber = risk === 'safe' && !conflictingRace
    ? (safeRace ?? explicitScope?.raceNumber ?? (reuseReference ? previousRace : null))
    : null;
  const raceScope = risk === 'safe' && !conflictingRace
    ? (explicitScope ?? (reuseReference && previousScope?.raceNumber === raceNumber ? previousScope : null))
    : null;
  let guidance = '';
  if (conflictingRace) {
    guidance = 'Se mencionaron carreras diferentes; confirma una sola referencia antes de consultar datos.';
  } else if (risk !== 'safe') {
    guidance = 'Se detectó una operación que requiere revisión; no se registró ni confirmó ningún efecto.';
  } else if (clarificationScope) {
    guidance = 'Referencia de carrera completada con hipódromo y fecha aportados explícitamente.';
  } else if (clarification) {
    guidance = 'Referencia parcial de carrera recibida; solicita el dato faltante.';
  } else if (isQuestion && raceNumber) {
    guidance = 'La consulta se refiere a la carrera ' + raceNumber + '; los estados y resultados deben venir de datos canónicos.';
  } else if (isQuestion && followUp && !raceNumber) {
    guidance = '¿A cuál carrera te refieres? Necesito el número para consultar datos fiables.';
  } else if (classification?.intent === 'help') {
    guidance = 'Puedo ayudarte a consultar datos verificados. Las operaciones sensibles requieren revisión.';
  } else if (classification?.intent === 'greeting') {
    guidance = '¡Buenas! ¿Qué carrera quieres consultar?';
  } else if (isQuestion) {
    guidance = 'Para consultar un registro necesito número de carrera, hipódromo y fecha.';
  } else {
    guidance = 'Consulta recibida en el laboratorio, sin cambios de estado ni dinero.';
  }
  const samePreviousRace = previousRace !== null && previousRace === raceNumber;
  const raceTrack = risk === 'safe' && raceNumber && !raceScope
    ? (validLabTrack(clarification?.racetrack) ||
        (samePreviousRace && reuseReference ? validLabTrack(priorContext?.raceTrack) : null))
    : null;
  const raceDate = risk === 'safe' && raceNumber && !raceScope
    ? (validLabDate(clarification?.raceDate) ? clarification.raceDate :
        samePreviousRace && reuseReference && validLabDate(priorContext?.raceDate) ? priorContext.raceDate : null)
    : null;
  return {
    sender, raceNumber, raceScope, raceTrack, raceDate, isQuestion, summaryRequested, queryCategory,
    clarificationCompleted: Boolean(clarificationScope),
    clarificationPending: clarification && !clarificationScope ? (raceTrack && !raceDate ? 'date' : !raceTrack && raceDate ? 'track' : null) : null,
    guidance,
    rememberRace: risk === 'safe' && Boolean(sender) && validRaceNumber(raceNumber)
  };
}

export function createLabConversationContext({ file, groupId, now = Date.now, ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES }) {
  const pinnedGroup=normalizeGroupId(groupId);
  if (!file || typeof file !== 'string' || !pinnedGroup) throw new Error('LAB_CONTEXT_IDENTITY_REQUIRED');
  if (!Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > DEFAULT_TTL_MS || !Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > DEFAULT_MAX_ENTRIES) throw new Error('LAB_CONTEXT_LIMITS_INVALID');
  let secret;
  let entries = {};
  let initialized = false;
  const keyFor = (sender) => {
    const stable=stableLabSenderKey(sender);
    if (!stable || !secret) return null;
    return crypto.createHmac('sha256', secret).update(`${pinnedGroup}\0${stable}`).digest('hex');
  };
  const retained = () => {
    const current = now();
    return Object.fromEntries(Object.entries(entries)
      .filter(([key, row]) => /^[a-f0-9]{64}$/.test(key) && validRaceNumber(row?.raceNumber) && Number.isFinite(row.updatedAt)
        && row.updatedAt <= current && current - row.updatedAt < ttlMs)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, maxEntries)
      .map(([key, row]) => {
        const scope = safeRaceScope(row.raceScope);
        const track = validLabTrack(row.raceTrack);
        const date = validLabDate(row.raceDate) ? row.raceDate : null;
        return [key, { raceNumber: row.raceNumber,
          ...(scope?.raceNumber === row.raceNumber ? { raceScope: scope } : {
            ...(track ? { raceTrack: track } : {}), ...(date ? { raceDate: date } : {})
          }),
          updatedAt: row.updatedAt }];
      }));
  };
  const assertInitialized = () => { if (!initialized) throw new Error('LAB_CONTEXT_NOT_INITIALIZED'); };
  return {
    async initialize() {
      if (initialized) return;
      try {
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024) throw new Error('LAB_CONTEXT_STORAGE_INVALID');
        const saved = JSON.parse(await fs.readFile(file, 'utf8'));
        if (saved?.schemaVersion !== SCHEMA_VERSION || saved?.groupIdHash !== crypto.createHash('sha256').update(pinnedGroup).digest('hex')
          || typeof saved.secret !== 'string' || !/^[a-f0-9]{64}$/.test(saved.secret)
          || !saved.entries || typeof saved.entries !== 'object' || Array.isArray(saved.entries)) throw new Error('LAB_CONTEXT_STORAGE_INVALID');
        secret = saved.secret;
        entries = saved.entries;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        secret = crypto.randomBytes(32).toString('hex');
      }
      entries = retained();
      initialized = true;
    },
    get(sender) {
      assertInitialized();
      const key = keyFor(sender);
      const entry = key ? retained()[key] : null;
      return entry ? { raceNumber: entry.raceNumber,
        ...(safeRaceScope(entry.raceScope)?.raceNumber === entry.raceNumber
          ? { raceScope: safeRaceScope(entry.raceScope) }
          : { ...(validLabTrack(entry.raceTrack) ? { raceTrack: validLabTrack(entry.raceTrack) } : {}),
              ...(validLabDate(entry.raceDate) ? { raceDate: entry.raceDate } : {}) }) } : null;
    },
    async remember(sender, raceNumber, raceScope = null, partial = null) {
      assertInitialized();
      const key = keyFor(sender);
      if (!key || !validRaceNumber(raceNumber)) return false;
      const previous = entries;
      const scope = safeRaceScope(raceScope);
      const track = !scope ? validLabTrack(partial?.raceTrack) : null;
      const date = !scope && validLabDate(partial?.raceDate) ? partial.raceDate : null;
      entries = { ...retained(), [key]: { raceNumber,
        ...(scope?.raceNumber === raceNumber ? { raceScope: scope } : {
          ...(track ? { raceTrack: track } : {}),
          ...(date ? { raceDate: date } : {})
        }),
        updatedAt: now() } };
      entries = retained();
      try {
        await atomicWriteJson(file, { schemaVersion: SCHEMA_VERSION,
          groupIdHash: crypto.createHash('sha256').update(pinnedGroup).digest('hex'), secret, entries });
      } catch (error) {
        entries = previous;
        throw error;
      }
      return true;
    }
  };
}
