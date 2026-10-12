import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { atomicWriteJson } from './spool-journal.mjs';
import { normalize, parseWhatsAppPre } from './runtime-utils.mjs';

// LAB-only non-authoritative conversation hints. No message content, money or sender names are persisted.
const SCHEMA_VERSION = 1;
const DEFAULT_TTL_MS = 20 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 300;
const RACE_PATTERN = /\bcarrera\s*(?:n(?:umero|ro)?\s*)?(\d{1,2})\b/;
const FOLLOW_UP_PATTERN = /\b(?:esa|ese|esta|este|misma|mismo|anterior|participantes|caballos|corren|resultado)\b/;
const QUESTION_PATTERN = /[¿?]|\b(?:quien|quienes|cual|cuando|donde|como|sigue|proxima|proximo)\b/;
const BOT_PATTERN = /\b(?:bot|control hipico)\b/;

function validRaceNumber(number) {
  return Number.isInteger(number) && number >= 1 && number <= 99;
}

export function labConversationInput(row, classification) {
  const content = String(row?.text || '').trim();
  if (!row?.id || row.fromMe || row.hasMedia || !content || content.length > 4000) return { eligible: false, reason: 'IGNORED' };
  if (/\[(?:SHADOW|LABTEST):|🧪\s*CONTROL HÍPICO/i.test(content)) return { eligible: false, reason: 'BOT_ECHO' };
  if (classification?.intent === 'empty') return { eligible: false, reason: 'EMPTY' };
  const normalized = normalize(content);
  if (classification?.intent === 'conversation' && !QUESTION_PATTERN.test(normalized) && !BOT_PATTERN.test(normalized)) {
    return { eligible: false, reason: 'CASUAL_CHAT' };
  }
  return { eligible: true, reason: 'RESPONSE_CANDIDATE' };
}

export function planLabConversation(row, classification, priorContext = null) {
  const normalized = normalize(row?.text);
  const parsedSender = parseWhatsAppPre(row?.pre).senderLabel;
  const sender = parsedSender && parsedSender.toLowerCase() !== 'unknown' ? parsedSender : '';
  const risk = classification?.risk || 'review';
  const explicitRace = normalized.match(RACE_PATTERN);
  const mentionedRace = explicitRace ? Number(explicitRace[1]) : null;
  const safeRace = validRaceNumber(mentionedRace) ? mentionedRace : null;
  const isQuestion = QUESTION_PATTERN.test(normalized);
  const followUp = FOLLOW_UP_PATTERN.test(normalized);
  // Monetary or state-changing intents must never inherit a race from conversation memory.
  const previousRace = risk === 'safe' && sender && validRaceNumber(priorContext?.raceNumber)
    ? priorContext.raceNumber : null;
  const raceNumber = risk === 'safe' ? (safeRace ?? (followUp ? previousRace : null)) : null;
  let guidance = '';
  if (risk !== 'safe') {
    guidance = 'Se detectó una operación que requiere revisión; no se registró ni confirmó ningún efecto.';
  } else if (isQuestion && raceNumber) {
    guidance = `Tu consulta se refiere a la carrera ${raceNumber}. Debo consultar los datos autorizados antes de afirmar participantes, resultados o estados.`;
  } else if (isQuestion && followUp && !raceNumber) {
    guidance = '¿A cuál carrera te refieres? Necesito el número para consultar datos fiables.';
  } else if (classification?.intent === 'help') {
    guidance = 'Puedo ayudarte a interpretar mensajes y consultar información verificada; las operaciones sensibles requieren revisión.';
  } else if (classification?.intent === 'greeting') {
    guidance = '¡Hola! Puedes consultar por una carrera indicando su número.';
  } else if (isQuestion) {
    guidance = 'Necesito una referencia concreta para consultar datos verificados. Puedes indicar el número de carrera.';
  } else {
    guidance = 'Consulta recibida en el laboratorio, sin cambios de estado ni dinero.';
  }
  return { sender, raceNumber, guidance, rememberRace: risk === 'safe' && Boolean(sender) && validRaceNumber(raceNumber) };
}

export function createLabConversationContext({ file, groupId, now = Date.now, ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES }) {
  if (!file || typeof file !== 'string' || !groupId || typeof groupId !== 'string') throw new Error('LAB_CONTEXT_IDENTITY_REQUIRED');
  if (!Number.isInteger(ttlMs) || ttlMs < 1000 || !Number.isInteger(maxEntries) || maxEntries < 1) throw new Error('LAB_CONTEXT_LIMITS_INVALID');
  let secret;
  let entries = {};
  let initialized = false;
  const keyFor = (sender) => {
    if (!String(sender || '').trim() || !secret) return null;
    return crypto.createHmac('sha256', secret).update(`${groupId}\0${normalize(sender)}`).digest('hex');
  };
  const retained = () => {
    const current = now();
    return Object.fromEntries(Object.entries(entries)
      .filter(([key, row]) => /^[a-f0-9]{64}$/.test(key) && validRaceNumber(row?.raceNumber) && Number.isFinite(row.updatedAt)
        && row.updatedAt <= current && current - row.updatedAt < ttlMs)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, maxEntries));
  };
  const assertInitialized = () => { if (!initialized) throw new Error('LAB_CONTEXT_NOT_INITIALIZED'); };
  return {
    async initialize() {
      if (initialized) return;
      try {
        const saved = JSON.parse(await fs.readFile(file, 'utf8'));
        if (saved?.schemaVersion !== SCHEMA_VERSION || saved?.groupIdHash !== crypto.createHash('sha256').update(groupId).digest('hex')
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
      return entry ? { raceNumber: entry.raceNumber } : null;
    },
    async remember(sender, raceNumber) {
      assertInitialized();
      const key = keyFor(sender);
      if (!key || !validRaceNumber(raceNumber)) return false;
      const previous = entries;
      entries = { ...retained(), [key]: { raceNumber, updatedAt: now() } };
      entries = retained();
      try {
        await atomicWriteJson(file, { schemaVersion: SCHEMA_VERSION,
          groupIdHash: crypto.createHash('sha256').update(groupId).digest('hex'), secret, entries });
      } catch (error) {
        entries = previous;
        throw error;
      }
      return true;
    }
  };
}
