import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import {
  sha256,
  normalize,
  sourceTitleMatches,
  parseRetryAfterMs,
  computeBackoffMs,
  parseWhatsAppPre,
  classifyLocal
} from './runtime-utils.mjs';
import {
  VERSION,
  RUNTIME_MODES,
  assertRuntimeConfig,
  loadRuntimeConfig
} from './runtime-config.mjs';
import {
  assertPinnedGroupIdentity,
  extractGroupIds,
  redactGroupId,
  selectUniqueGroupId
} from './group-identity.mjs';
import { assessRuntimeReadiness } from './health-state.mjs';
import { createBridgeSpoolRuntime } from './spool-runtime.mjs';

const config = assertRuntimeConfig(loadRuntimeConfig());
const {
  runtimeMode: RUNTIME_MODE,
  dataDir: DATA_DIR,
  backendSyncEnabled: BACKEND_SYNC_ENABLED,
  ingestUrl: INGEST_URL,
  healthUrl: HEALTH_URL,
  token: TOKEN,
  sourceMatches: SOURCE_MATCHES,
  sourceGroupId: SOURCE_GROUP_ID,
  sourceChannelKey: SOURCE_CHANNEL_KEY,
  labGroupName: LAB_GROUP_NAME,
  labGroupId: LAB_GROUP_ID,
  labChannelKey: LAB_CHANNEL_KEY,
  labSendEnabled: LAB_SEND_ENABLED,
  sourceAutoReplyEnabled: SOURCE_AUTO_REPLY_ENABLED,
  requirePinnedGroupIds: REQUIRE_PINNED_GROUP_IDS,
  pollMs: POLL_MS,
  backendTimeoutMs: BACKEND_TIMEOUT_MS,
  backendMaxRps: BACKEND_MAX_RPS,
  backendMaxPerFlush: BACKEND_MAX_PER_FLUSH,
  backoffBaseMs: BACKOFF_BASE_MS,
  backoffMaxMs: BACKOFF_MAX_MS,
  trainingJournalEnabled: TRAINING_JOURNAL_ENABLED,
  diagnosticScreenshotsEnabled: DIAGNOSTIC_SCREENSHOTS_ENABLED,
  baselineIgnoreHistory: BASELINE_IGNORE_HISTORY,
  labTestInputEnabled: LAB_TEST_INPUT_ENABLED,
  labTestPollMs: LAB_TEST_POLL_MS,
  labTestBootstrapLimit: LAB_TEST_BOOTSTRAP_LIMIT
} = config;
const PROFILE_DIR = path.join(DATA_DIR, 'chrome-profile');
const LEGACY_EVENT_SPOOL_DIR = path.join(DATA_DIR, 'spool-events');
const LEGACY_MIRROR_SPOOL_DIR = path.join(DATA_DIR, 'spool-lab-mirror');
const LEGACY_DEADLETTER_DIR = path.join(DATA_DIR, 'dead-letter');
const SPOOL_V2_DIR = path.join(DATA_DIR, 'spool-v2');
const TRAINING_DIR = path.join(DATA_DIR, 'training');
const SEEN_FILE = path.join(DATA_DIR, 'seen-source-message-ids.json');
const LAB_SEEN_FILE = path.join(DATA_DIR, 'seen-lab-test-message-ids.json');
const LEGACY_SEEN_FILE = path.join(DATA_DIR, 'seen-message-ids.json');
const RETRY_STATE_FILE = path.join(DATA_DIR, 'retry-state.json');
const HEALTH_FILE = path.join(DATA_DIR, 'health.json');
const LOG_FILE = path.join(DATA_DIR, 'bridge.log');
const ERROR_SCREENSHOT = path.join(DATA_DIR, 'last-error.png');
const DOM_DIAGNOSTIC_FILE = path.join(DATA_DIR, 'dom-diagnostic.json');
const PROFILE_RESET_FLAG = path.join(DATA_DIR, 'profile-reset-required.flag');
const TRAINING_JOURNAL = path.join(TRAINING_DIR, `shadow-${new Date().toISOString().slice(0, 10)}.jsonl`);

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function isoNow() { return new Date().toISOString(); }

for (const dir of [DATA_DIR, PROFILE_DIR, LEGACY_EVENT_SPOOL_DIR, LEGACY_MIRROR_SPOOL_DIR, LEGACY_DEADLETTER_DIR, TRAINING_DIR]) {
  await fs.mkdir(dir, { recursive: true });
}

let context = null;
let page = null;
let seen = await loadSeen();
let labSeen = await loadLabSeen();
let sourceBaselineCompleted = false;
let activeSourceTitle = '';
let flushingEvents = false;
let flushingMirrors = false;
let flushingSourceReplies = false;
let stopping = false;
let seenSaveTimer = null;
let backendNextAllowedAt = 0;
let backendFailureStreak = 0;
let backendState = 'unknown';
let lastBackendReason = '';
let lastBackendOkAt = null;
let lastSourceSeenAt = null;
let capturedCount = 0;
let deliveredCount = 0;
let mirroredCount = 0;
let sourceReplyCount = 0;
let duplicateVisibleCount = 0;
let nonOperationalCount = 0;
let lastPostStartedAt = 0;
let lastLabTestPollAt = 0;
let labBootstrapCompleted = false;
let sourceDiscoveryFailures = 0;
let lastPrintedHealthLine = '';
let lastHealthHeartbeatAt = 0;

async function loadSeen() {
  for (const file of [SEEN_FILE, LEGACY_SEEN_FILE]) {
    try {
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      if (Array.isArray(data)) return new Set(data.filter(Boolean).slice(-20000));
    } catch {}
  }
  return new Set();
}

async function loadLabSeen() {
  try {
    const data = JSON.parse(await fs.readFile(LAB_SEEN_FILE, 'utf8'));
    if (Array.isArray(data)) return new Set(data.filter(Boolean).slice(-10000));
  } catch {}
  return new Set();
}

async function loadRetryState() {
  try {
    const data = JSON.parse(await fs.readFile(RETRY_STATE_FILE, 'utf8'));
    backendNextAllowedAt = Number(data.backendNextAllowedAt || 0);
    backendFailureStreak = Number(data.backendFailureStreak || 0);
  } catch {}
}
await loadRetryState();

async function saveRetryState() {
  await fs.writeFile(RETRY_STATE_FILE, JSON.stringify({
    backendNextAllowedAt,
    backendFailureStreak,
    backendState,
    lastBackendReason,
    updatedAt: isoNow()
  }, null, 2), 'utf8').catch(() => {});
}

async function saveSeenNow() {
  const values = [...seen].slice(-20000);
  await fs.writeFile(SEEN_FILE, JSON.stringify(values), 'utf8').catch(() => {});
}
function scheduleSeenSave() {
  if (seenSaveTimer) return;
  seenSaveTimer = setTimeout(() => {
    seenSaveTimer = null;
    saveSeenNow().catch(() => {});
  }, 250);
  seenSaveTimer.unref?.();
}
function rememberSeen(id) {
  if (!id) return;
  while (seen.size >= 20000) {
    const oldest = seen.values().next().value;
    if (!oldest) break;
    seen.delete(oldest);
  }
  seen.add(id);
  scheduleSeenSave();
}

async function saveLabSeenNow() {
  const values = [...labSeen].slice(-10000);
  await fs.writeFile(LAB_SEEN_FILE, JSON.stringify(values), 'utf8').catch(() => {});
}
function rememberLabSeen(id) {
  if (!id) return;
  while (labSeen.size >= 10000) {
    const oldest = labSeen.values().next().value;
    if (!oldest) break;
    labSeen.delete(oldest);
  }
  labSeen.add(id);
}

async function log(line) {
  await fs.appendFile(LOG_FILE, `[${isoNow()}] ${line}\n`, 'utf8').catch(() => {});
}

const spoolRuntime = createBridgeSpoolRuntime({
  rootDir: SPOOL_V2_DIR,
  legacyEventDir: LEGACY_EVENT_SPOOL_DIR,
  legacyMirrorDir: LEGACY_MIRROR_SPOOL_DIR,
  legacyDeadLetterDir: LEGACY_DEADLETTER_DIR,
  parserVersion: 'whatsapp-parser-v1',
  baseMs: BACKOFF_BASE_MS,
  maxMs: BACKOFF_MAX_MS,
  jitter: 0.1,
  logger: log
});
async function screenshot(tag = 'error') {
  if (!DIAGNOSTIC_SCREENSHOTS_ENABLED) return;
  if (!page || page.isClosed()) return;
  try {
    await page.screenshot({ path: ERROR_SCREENSHOT, fullPage: false });
    await log(`SCREENSHOT ${tag} ${ERROR_SCREENSHOT}`);
  } catch {}
}

async function writeHealth(extra = {}) {
  const now = Date.now();
  const spool = await spoolRuntime.snapshot();
  const counters = {
    captured: capturedCount,
    delivered: deliveredCount,
    mirrored: mirroredCount,
    duplicateVisible: duplicateVisibleCount,
    nonOperational: nonOperationalCount,
    seenIds: seen.size,
    labSeenIds: labSeen.size,
    eventSpool: spool.pendingBackend,
    mirrorSpool: spool.pendingLab,
    sourceReplySpool: spool.pendingSourceReplies,
    deadLetters: spool.quarantined,
    spoolStates: spool.counts
  };
  const readiness = assessRuntimeReadiness({
    runtimeMode: RUNTIME_MODE,
    backendState,
    activeSourceTitle,
    sourceMatches: SOURCE_MATCHES,
    eventSpool: counters.eventSpool,
    mirrorSpool: counters.mirrorSpool,
    deadLetters: counters.deadLetters
  });
  const payload = {
    version: VERSION,
    timestamp: isoNow(),
    mode: 'SOURCE_READ_ONLY_TO_LAB_SHADOW',
    runtimeMode: RUNTIME_MODE,
    readiness,
    sourceAliases: SOURCE_MATCHES,
    activeSourceTitle,
    labGroupName: LAB_GROUP_NAME,
    groupBinding: {
      required: REQUIRE_PINNED_GROUP_IDS,
      sourceBound: Boolean(SOURCE_GROUP_ID),
      labBound: Boolean(LAB_GROUP_ID)
    },
    labSendEnabled: LAB_SEND_ENABLED,
    labTestInputEnabled: LAB_TEST_INPUT_ENABLED,
    sourceAutoReplyEnabled: SOURCE_AUTO_REPLY_ENABLED,
    sourceSendPossible: Boolean(SOURCE_AUTO_REPLY_ENABLED && SOURCE_GROUP_ID && BACKEND_SYNC_ENABLED && RUNTIME_MODE === RUNTIME_MODES.PRODUCTION),
    backend: {
      state: backendState,
      failureStreak: backendFailureStreak,
      nextRetryAt: backendNextAllowedAt > now ? new Date(backendNextAllowedAt).toISOString() : null,
      lastReason: lastBackendReason,
      lastOkAt: lastBackendOkAt
    },
    counters,
    lastSourceSeenAt,
    ...extra
  };
  await fs.writeFile(HEALTH_FILE, JSON.stringify(payload, null, 2), 'utf8').catch(() => {});
}

function localSuggestion(classification) {
  const { intent, entities = {} } = classification;
  const map = {
    offer_player: `Oferta JUEGA detectada${entities.play ? ` · ${entities.play}` : ''}${entities.horse ? ` · caballo ${entities.horse}` : ''}${entities.amount != null ? ` · ${entities.amount}` : ''}. Pendiente de emparejamiento/revisión.`,
    offer_receiver: `Oferta CONSIGUE detectada${entities.play ? ` · ${entities.play}` : ''}${entities.horse ? ` · caballo ${entities.horse}` : ''}${entities.amount != null ? ` · ${entities.amount}` : ''}. Pendiente de emparejamiento/revisión.`,
    offer_confirmation: 'Confirmación corta detectada. Debe correlacionarse con una oferta única antes de confirmar.',
    race_close: 'Cierre detectado. Debe fijar corte temporal y bloquear jugadas posteriores tras validación.',
    day_close: 'Cierre de jornada detectado. Requiere conciliación final antes de publicar.',
    race_result: `Resultado detectado${entities.board?.length ? ` · ${entities.board.join('-')}` : ''}. Debe validarse contra la carrera activa.`,
    balance_snapshot: 'Snapshot de disponibles detectado. Solo conciliación; no sobrescribe saldos.',
    settlement_snapshot: 'Plano/liquidación detectado. Debe compararse contra el motor y el ledger.',
    plan_snapshot: 'Plano detectado. Se conserva como evidencia; no crea apuestas nuevas.',
    pending_confirmation: 'Pendiente de confirmación detectado. No produce efecto monetario.',
    cancel_or_correction: 'Corrección/anulación detectada. Debe vincularse a la operación original.',
    polla_or_parley: 'POLLA/PARLEY detectado. Mantener en revisión por motor especializado.',
    betting_or_balance: 'Mensaje monetario genérico detectado. Revisión obligatoria.',
    greeting: 'Conversación no operacional.',
    help: 'Consulta de ayuda no monetaria.',
    status_non_monetary: 'Consulta/estado no monetario.',
    conversation: 'Conversación no operacional.'
  };
  return map[intent] || 'Revisión shadow.';
}

function mirrorTagFor(externalMessageId) {
  return `[SHADOW:${sha256(externalMessageId).slice(0, 10)}]`;
}
function localMirrorText(event, classification) {
  const lines = [
    mirrorTagFor(event.externalMessageId),
    '🧪 CONTROL HÍPICO · SHADOW LOCAL',
    `Fuente: ${event.groupName}`,
    `Remitente: ${event.senderLabel || 'participante'}`,
    `Mensaje: ${(event.text || `[${event.mediaKind || 'media'}]`).slice(0, 1000)}`,
    `Lectura: ${classification.intent} · riesgo ${classification.risk} · confianza ${(classification.confidence * 100).toFixed(1)}%`,
    `Propuesta: ${localSuggestion(classification)}`,
    '⚠️ SOLO LABORATORIO. No registró ni modificó dinero, jugadas, resultados o saldos reales.'
  ];
  return lines.join('\n').slice(0, 3900);
}

function shouldMirror(classification) {
  return !['empty', 'conversation', 'greeting'].includes(classification.intent);
}

async function appendTraining(event, classification, backend = null) {
  if (!TRAINING_JOURNAL_ENABLED) return;
  const row = {
    recordedAt: isoNow(),
    sourceMessageKey: sha256(event.externalMessageId),
    sourceGroup: event.groupName,
    senderKey: sha256(event.senderId || event.senderLabel || 'unknown'),
    timestamp: event.timestamp,
    text: event.text,
    quotedMessageKey: event.quotedExternalMessageId ? sha256(event.quotedExternalMessageId) : null,
    mediaKind: event.mediaKind,
    local: classification,
    backend: backend ? {
      classification: backend.classification || null,
      duplicate: Boolean(backend.duplicate),
      intent: backend?.data?.intent || null,
      risk: backend?.data?.risk || null
    } : null,
    shadowOnly: true
  };
  await fs.appendFile(TRAINING_JOURNAL, `${JSON.stringify(row)}\n`, 'utf8').catch(() => {});
}

async function queueEvent(event) {
  return spoolRuntime.queueBackendEvent(event);
}
async function queueMirror(mirror) {
  return spoolRuntime.queueLabMirror(mirror);
}
async function queueSourceReply(reply) {
  return spoolRuntime.queueSourceReply(reply);
}

function classifyHttpFailure(response, body, raw) {
  const status = response.status;
  const message = body?.error || raw.slice(0, 240) || response.statusText || `HTTP ${status}`;
  const retryAfterMs = parseRetryAfterMs(response.headers);
  const retryable = body?.retryable !== false && (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500);
  return { status, message, retryAfterMs, retryable };
}

async function paceBackend() {
  const minGap = Math.ceil(1000 / BACKEND_MAX_RPS);
  const remaining = minGap - (Date.now() - lastPostStartedAt);
  if (remaining > 0) await sleep(remaining);
  lastPostStartedAt = Date.now();
}

async function backendPost(event) {
  if (!BACKEND_SYNC_ENABLED) {
    const error = new Error('Backend sync deshabilitado: modo local-first.');
    error.status = 0;
    error.retryable = false;
    throw error;
  }
  if (!INGEST_URL || !TOKEN) {
    const error = new Error('Backend sync habilitado pero faltan URL/token.');
    error.status = 0;
    error.retryable = false;
    throw error;
  }
  if (Date.now() < backendNextAllowedAt) {
    const error = new Error(`Backend en cooldown hasta ${new Date(backendNextAllowedAt).toLocaleTimeString()}`);
    error.code = 'COOLDOWN';
    error.retryable = true;
    throw error;
  }
  await paceBackend();
  const response = await fetch(INGEST_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hipico-bridge-token': TOKEN,
      'x-request-id': `hipico-${sha256(event.externalMessageId).slice(0, 24)}`
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS)
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) {
    const info = classifyHttpFailure(response, body, raw);
    const error = new Error(`Backend ${info.status}: ${info.message}`);
    Object.assign(error, info);
    throw error;
  }
  backendFailureStreak = 0;
  backendNextAllowedAt = 0;
  backendState = 'online';
  lastBackendReason = '';
  lastBackendOkAt = isoNow();
  await saveRetryState();
  return body;
}

async function backendHealth() {
  if (!BACKEND_SYNC_ENABLED) {
    return { ok: true, state: 'local-only', status: 0, retryAfterMs: 0 };
  }
  if (!HEALTH_URL || !TOKEN) {
    return { ok: false, state: 'misconfigured', status: 0, retryAfterMs: 0 };
  }
  try {
    const response = await fetch(HEALTH_URL, {
      method: 'GET',
      headers: { 'x-hipico-bridge-token': TOKEN, 'x-request-id': `hipico-health-${Date.now()}` },
      signal: AbortSignal.timeout(8000)
    });
    const raw = await response.text();
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    if (response.status === 404 || response.status === 405) {
      return RUNTIME_MODE === RUNTIME_MODES.PRODUCTION
        ? { state: 'health-endpoint-missing', ok: false, status: response.status }
        : { state: 'legacy', ok: true, status: response.status };
    }
    if (response.status === 401) return { state: 'unauthorized', ok: false, status: 401 };
    if (response.status === 429) return { state: 'rate-limited', ok: false, status: 429, retryAfterMs: parseRetryAfterMs(response.headers) };
    if (!response.ok) return { state: 'unavailable', ok: false, status: response.status };
    if (RUNTIME_MODE === RUNTIME_MODES.PRODUCTION && body?.ready !== true) {
      return { state: 'persistence-unready', ok: false, status: response.status, body };
    }
    return { state: 'online', ok: true, body };
  } catch (error) {
    return { state: 'offline', ok: false, error: error.message };
  }
}

async function enterBackendCooldown(error, meta) {
  if (error?.code === 'COOLDOWN') return;
  backendFailureStreak += 1;
  const serverWait = Number(error?.retryAfterMs || 0);
  const localWait = computeBackoffMs(backendFailureStreak, { baseMs: BACKOFF_BASE_MS, maxMs: BACKOFF_MAX_MS, jitter: 0.1 });
  const wait = Math.max(serverWait, localWait);
  backendNextAllowedAt = Date.now() + wait;
  backendState = error?.status === 429 ? 'throttled' : 'degraded';
  lastBackendReason = String(error?.message || 'Backend no disponible').slice(0, 400);
  await saveRetryState();
  await log(`BACKEND_COOLDOWN ms=${wait} streak=${backendFailureStreak} reason=${lastBackendReason} id=${meta?.externalMessageId || ''}`);
  console.log(`\n[BACKEND ${backendState.toUpperCase()}] Pausa ${Math.ceil(wait / 1000)}s. WhatsApp seguirá leyendo y guardando localmente.\n`);
}

async function deliverBackendEvent(event) {
  if (!event?.externalMessageId) {
    const error = new Error('Evento sin externalMessageId');
    error.retryable = false;
    throw error;
  }

  try {
    const result = await backendPost(event);
    await appendTraining(event, classifyLocal(event.text), result);
    if (LAB_SEND_ENABLED && result?.labSimulation?.text && event.channelRole === 'source') {
      await queueMirror({
        sourceExternalMessageId: event.externalMessageId,
        sourceGroupName: event.groupName,
        labGroupName: LAB_GROUP_NAME,
        mirrorTag: String(result.labSimulation.mirrorTag || mirrorTagFor(event.externalMessageId)),
        text: String(result.labSimulation.text).slice(0, 3900),
        source: 'backend',
        createdAt: isoNow()
      });
    }

    if (SOURCE_AUTO_REPLY_ENABLED && event.channelRole === 'source' && result?.autonomousReply) {
      const reply = result.autonomousReply;
      if (!SOURCE_GROUP_ID || String(reply.groupId || '').toLowerCase() !== SOURCE_GROUP_ID.toLowerCase()) {
        const error = new Error('AUTONOMOUS_REPLY_GROUP_ID_MISMATCH');
        error.retryable = false;
        throw error;
      }
      if (String(reply.sourceMessageId || '') !== String(event.externalMessageId || '')) {
        const error = new Error('AUTONOMOUS_REPLY_SOURCE_ID_MISMATCH');
        error.retryable = false;
        throw error;
      }
      if (!['AUTO_REPLY','ASK_CLARIFICATION','HUMAN_LAST_RESORT'].includes(String(reply.action || ''))) {
        const error = new Error('AUTONOMOUS_REPLY_ACTION_INVALID');
        error.retryable = false;
        throw error;
      }
      await queueSourceReply({
        replyId: String(reply.replyId || ''),
        sourceMessageId: String(reply.sourceMessageId || ''),
        groupId: String(reply.groupId || ''),
        groupKey: String(reply.groupKey || ''),
        action: String(reply.action || ''),
        text: String(reply.text || '').slice(0, 3600),
        humanRequired: Boolean(reply.humanRequired),
        createdAt: isoNow()
      });
    }
    deliveredCount += 1;
    await log(`DELIVERED ${event.externalMessageId} ${result?.classification || 'received'} duplicate=${Boolean(result?.duplicate)}`);
    return result;
  } catch (error) {
    if (error?.status === 401) {
      const retryAfterMs = 60 * 60 * 1000;
      backendState = 'unauthorized';
      lastBackendReason = error.message;
      backendNextAllowedAt = Date.now() + retryAfterMs;
      error.retryable = true;
      error.retryAfterMs = Math.max(Number(error.retryAfterMs || 0), retryAfterMs);
      await saveRetryState();
      console.error('\n[SEGURIDAD] Token del Bridge rechazado. Los eventos permanecen en spool v2; la captura local sigue activa.\n');
    } else if (error?.retryable === false || (error?.status >= 400 && error?.status < 500 && error?.status !== 408 && error?.status !== 409 && error?.status !== 425 && error?.status !== 429)) {
      error.retryable = false;
      console.error(`[QUARANTINE] ${event.externalMessageId}: ${error.message}`);
    } else {
      await enterBackendCooldown(error, event);
    }
    throw error;
  }
}

async function flushEventSpool(limit = BACKEND_MAX_PER_FLUSH) {
  if (!BACKEND_SYNC_ENABLED) return;
  if (flushingEvents || Date.now() < backendNextAllowedAt) return;
  flushingEvents = true;
  try {
    return await spoolRuntime.flushBackend(deliverBackendEvent, {
      limit,
      canContinue: () => (
        Date.now() >= backendNextAllowedAt &&
        !['unauthorized', 'throttled', 'degraded'].includes(backendState)
      )
    });
  } finally { flushingEvents = false; }
}

async function launchOfficialChrome() {
  const options = { headless: false, viewport: null, locale: 'es-VE', acceptDownloads: false, chromiumSandbox: true };
  try { return { context: await chromium.launchPersistentContext(PROFILE_DIR, { ...options, channel: 'chrome' }), channel: 'chrome' }; }
  catch (chromeError) {
    await log(`CHROME_LAUNCH_FAIL ${chromeError.message}`);
    try { return { context: await chromium.launchPersistentContext(PROFILE_DIR, { ...options, channel: 'msedge' }), channel: 'msedge' }; }
    catch (edgeError) { throw new Error(`No pude abrir Chrome ni Edge. Chrome: ${chromeError.message}. Edge: ${edgeError.message}`); }
  }
}

async function hasWhatsAppBrowserDatabaseError() {
  if (!page || page.isClosed()) return false;
  const text = await page.locator('body').innerText({ timeout: 1500 }).catch(() => '');
  const normalized = normalize(text);
  return normalized.includes('ocurrio un error en la base de datos de tu navegador') ||
    normalized.includes('browser database error') ||
    normalized.includes('database error in your browser');
}

async function requestCleanProfileReset(reason) {
  const payload = {
    at: new Date().toISOString(),
    version: VERSION,
    reason,
    profileDir: PROFILE_DIR,
    preserve: ['spool-v2', 'spool-events', 'spool-lab-mirror', 'dead-letter', 'training', 'seen-source-message-ids.json']
  };
  await fs.writeFile(PROFILE_RESET_FLAG, JSON.stringify(payload, null, 2), 'utf8').catch(() => {});
  await log(`PROFILE_RESET_REQUIRED ${reason}`);
  await screenshot('profile-database-error');
  console.error('\nWhatsApp Web reporto un error de base de datos del perfil controlado.');
  console.error('El launcher reparara SOLO el perfil del Bridge y volvera a abrir WhatsApp para vincularlo de nuevo.');
  process.exitCode = 42;
  stopping = true;
  try { await context?.close(); } catch {}
}

async function isLoggedIn() {
  if (!page || page.isClosed()) return false;
  return page.evaluate(() => Boolean(
    document.querySelector('#pane-side') ||
    document.querySelector('[data-testid="chat-list"]') ||
    document.querySelector('[aria-label*="Lista de chats"]') ||
    document.querySelector('[aria-label*="Chat list"]')
  )).catch(() => false);
}
async function chatDomSnapshot() {
  if (!page || page.isClosed()) return { currentTitle: '', headerText: '', titleAttrs: [], ariaLabels: [], panePreview: '' };
  return page.evaluate((authorizedNames) => {
    const norm = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim().toLowerCase();

    const mainHeader = document.querySelector('#main header') ||
      Array.from(document.querySelectorAll('header')).find((el) => el.closest('#main')) ||
      Array.from(document.querySelectorAll('header')).at(-1) || null;

    const headerText = String(mainHeader?.innerText || mainHeader?.textContent || '').replace(/\s+/g, ' ').trim();
    const titleAttrs = mainHeader ? Array.from(mainHeader.querySelectorAll('[title]'))
      .map((el) => String(el.getAttribute('title') || '').trim()).filter(Boolean).slice(0, 30) : [];
    const ariaLabels = mainHeader ? Array.from(mainHeader.querySelectorAll('[aria-label]'))
      .map((el) => String(el.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 30) : [];
    const textCandidates = mainHeader ? Array.from(mainHeader.querySelectorAll('[dir="auto"], [dir="ltr"], span, div'))
      .map((el) => String(el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((value) => value.length > 1 && value.length < 260)
      .slice(0, 120) : [];

    const allCandidates = [...titleAttrs, ...ariaLabels, ...textCandidates, headerText].filter(Boolean);
    let currentTitle = '';
    for (const authorized of authorizedNames) {
      const n = norm(authorized);
      if (allCandidates.some((candidate) => norm(candidate) === n || norm(candidate).includes(n))) {
        currentTitle = authorized;
        break;
      }
    }

    if (!currentTitle) {
      const noisy = /^(buscar|search|videollamada|video call|llamada|call|menu|más|more|archivado|archived)$/i;
      currentTitle = titleAttrs.find((v) => !noisy.test(v)) ||
        textCandidates.find((v) => !noisy.test(v) && !/^\+?\d[\d\s()-]{6,}$/.test(v)) || '';
    }

    const pane = document.querySelector('#pane-side') || document.querySelector('#side');
    const panePreview = String(pane?.innerText || '').replace(/\s+/g, ' ').slice(0, 2500);

    return { currentTitle, headerText, titleAttrs, ariaLabels, panePreview };
  }, [...SOURCE_MATCHES, LAB_GROUP_NAME]).catch(() => ({ currentTitle: '', headerText: '', titleAttrs: [], ariaLabels: [], panePreview: '' }));
}

async function currentChatTitle() {
  const snapshot = await chatDomSnapshot();
  return String(snapshot.currentTitle || '').trim();
}

async function currentChatGroupId(expectedId = '') {
  if (!page || page.isClosed()) return '';
  const values = await page.evaluate(() => {
    const root = document.querySelector('#main') || document.body;
    const result = [];
    for (const node of root.querySelectorAll('[data-id], [id], [data-testid]')) {
      for (const name of ['data-id', 'id', 'data-testid']) {
        const value = node.getAttribute?.(name);
        if (value && value.includes('@g.us')) result.push(value);
      }
      if (result.length >= 400) break;
    }
    return result;
  }).catch(() => []);
  return selectUniqueGroupId(extractGroupIds(values), expectedId);
}

async function assertCurrentSourceIdentity() {
  const title = await currentChatTitle();
  if (!sourceTitleMatches(title, SOURCE_MATCHES)) throw new Error('SOURCE_TITLE_MISMATCH');
  if (!SOURCE_GROUP_ID) return true;
  const actualId = await currentChatGroupId(SOURCE_GROUP_ID);
  assertPinnedGroupIdentity({ role: 'source', expectedId: SOURCE_GROUP_ID, actualId, actualTitle: title });
  return true;
}

async function assertCurrentLabIdentity() {
  const title = await currentChatTitle();
  const actualId = await currentChatGroupId(LAB_GROUP_ID);
  assertPinnedGroupIdentity({
    role: 'lab',
    expectedId: LAB_GROUP_ID,
    expectedTitle: LAB_GROUP_NAME,
    actualId,
    actualTitle: title,
    sourceId: SOURCE_GROUP_ID
  });
  return true;
}

async function currentChatIsSource() {
  const title = await currentChatTitle();
  if (!sourceTitleMatches(title, SOURCE_MATCHES)) return false;
  if (!SOURCE_GROUP_ID) return true;
  return (await currentChatGroupId(SOURCE_GROUP_ID)) === SOURCE_GROUP_ID.toLowerCase();
}

async function writeDomDiagnostic(reason) {
  if (!page || page.isClosed()) return;
  try {
    const snapshot = await chatDomSnapshot();
    const currentRole = sourceTitleMatches(snapshot.currentTitle, SOURCE_MATCHES)
      ? 'source'
      : normalize(snapshot.currentTitle) === normalize(LAB_GROUP_NAME)
        ? 'lab'
        : snapshot.currentTitle
          ? 'other'
          : 'none';
    const candidateRoles = [...snapshot.titleAttrs, ...snapshot.ariaLabels]
      .map((value) => sourceTitleMatches(value, SOURCE_MATCHES)
        ? 'source'
        : normalize(value) === normalize(LAB_GROUP_NAME)
          ? 'lab'
          : null)
      .filter(Boolean);
    const safeSnapshot = {
      currentRole,
      authorizedCandidateRoles: [...new Set(candidateRoles)],
      titleAttributeCount: snapshot.titleAttrs.length,
      ariaLabelCount: snapshot.ariaLabels.length,
      paneTextPersisted: false
    };
    const extra = await page.evaluate(() => {
      const rowCount = document.querySelectorAll('#pane-side [role="row"], #pane-side [data-testid="cell-frame-container"], #pane-side [tabindex], #side [role="row"]').length;
      const searchBoxCount = document.querySelectorAll('#side input, #side [contenteditable="true"], [role="textbox"]').length;
      return { rowCount, searchBoxCount, origin: location.origin, pathname: location.pathname };
    }).catch(() => ({}));
    await fs.writeFile(DOM_DIAGNOSTIC_FILE, JSON.stringify({ at: isoNow(), reason, snapshot: safeSnapshot, ...extra }, null, 2), 'utf8');
    await screenshot(`dom-${reason}`);
  } catch {}
}

async function clickGroupByNormalizedText(match) {
  return page.evaluate((target) => {
    const norm = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim().toLowerCase();
    const needle = norm(target);
    const roots = [document.querySelector('#pane-side'), document.querySelector('#side')].filter(Boolean);
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const candidates = [];
    for (const root of roots) {
      for (const el of root.querySelectorAll('[role="row"], [data-testid="cell-frame-container"], [tabindex], [title], span, div')) {
        if (!visible(el)) continue;
        const raw = String(el.getAttribute?.('title') || el.textContent || '').replace(/\s+/g, ' ').trim();
        const n = norm(raw);
        if (!n || !n.includes(needle)) continue;
        candidates.push({ el, score: raw.length });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    const chosen = candidates[0]?.el;
    if (!chosen) return false;
    const row = chosen.closest('[role="row"], [data-testid="cell-frame-container"], [tabindex="-1"]') || chosen;
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    row.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    row.click();
    return true;
  }, match).catch(() => false);
}

async function clickVisibleGroupCandidate(match, exact = true) {
  const pane = page.locator('#pane-side');
  if (await pane.count()) {
    const candidate = pane.getByText(match, { exact }).first();
    if (await candidate.count() && await candidate.isVisible().catch(() => false)) {
      await candidate.click({ timeout: 4000 }); await sleep(700); return true;
    }
  }
  const titled = page.locator('[title]').filter({ hasText: match }).first();
  if (await titled.count() && await titled.isVisible().catch(() => false)) {
    await titled.click({ timeout: 4000 }); await sleep(700); return true;
  }
  if (await clickGroupByNormalizedText(match)) { await sleep(800); return true; }
  return false;
}

async function clearAndTypeSearch(search, match) {
  await search.click({ timeout: 2500 });
  const tag = await search.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
  if (tag === 'input' || tag === 'textarea') {
    await search.fill(match).catch(async () => {
      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.insertText(match);
    });
  } else {
    await page.keyboard.press('Control+A').catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    await page.keyboard.insertText(match);
  }
}

async function openViaSearch(match, exact = true) {
  const searchCandidates = [
    page.locator('#side input[placeholder*="Buscar" i]').first(),
    page.locator('#side input[placeholder*="Search" i]').first(),
    page.locator('#side [contenteditable="true"][role="textbox"]').first(),
    page.locator('#side [contenteditable="true"]').first(),
    page.getByRole('textbox').first(),
    page.locator('div[contenteditable="true"][data-tab="3"]').first()
  ];
  for (const search of searchCandidates) {
    try {
      if (!(await search.count()) || !(await search.isVisible().catch(() => false))) continue;
      await clearAndTypeSearch(search, match);
      await sleep(1400);
      const clicked = await clickVisibleGroupCandidate(match, exact);
      if (clicked) {
        await sleep(800);
        const title = await currentChatTitle();
        if (exact ? normalize(title) === normalize(match) : normalize(title).includes(normalize(match))) return true;
      }
    } catch {}
  }
  return false;
}

async function openGroup(match, exact = true) {
  const title = await currentChatTitle();
  const currentMatches = exact ? normalize(title) === normalize(match) : normalize(title).includes(normalize(match));
  if (currentMatches) return true;
  if (await clickVisibleGroupCandidate(match, exact)) {
    const newTitle = await currentChatTitle();
    if (exact ? normalize(newTitle) === normalize(match) : normalize(newTitle).includes(normalize(match))) return true;
  }
  return openViaSearch(match, exact);
}

async function openSourceGroup() {
  if (await currentChatIsSource()) { sourceDiscoveryFailures = 0; return true; }
  for (const alias of SOURCE_MATCHES) {
    if (await openGroup(alias, false)) {
      if (await currentChatIsSource()) { sourceDiscoveryFailures = 0; return true; }
    }
  }
  sourceDiscoveryFailures += 1;
  if (sourceDiscoveryFailures === 1 || sourceDiscoveryFailures % 5 === 0) {
    await writeDomDiagnostic(`source-not-found-${sourceDiscoveryFailures}`);
  }
  return false;
}

async function extractVisibleMessages() {
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('[data-id]'));
    const rows = [];
    const used = new Set();
    for (const node of candidates) {
      const preNode = node.querySelector?.('[data-pre-plain-text]') || (node.matches?.('[data-pre-plain-text]') ? node : null);
      const id = String(node.getAttribute('data-id') || '').trim();
      if (!id || used.has(id)) continue;
      const messageContainer = node.closest?.('.message-in, .message-out') || (String(node.className || '').includes('message-') ? node : null);
      if (!preNode && !messageContainer) continue;
      const pre = String(preNode?.getAttribute?.('data-pre-plain-text') || '');
      const textRoot = preNode || messageContainer || node;
      const textNodes = Array.from(textRoot.querySelectorAll?.('span.selectable-text, span[dir="ltr"], span[dir="auto"]') || []);
      let text = textNodes.map((el) => (el.innerText || '').trim()).filter(Boolean).join('\n').trim();
      if (!text) text = String(textRoot.innerText || '').trim();
      const fromMe = Boolean(node.closest?.('.message-out')) || Boolean(messageContainer?.classList?.contains?.('message-out')) || String(node.className || '').includes('message-out');
      const hasVideo = Boolean(node.querySelector?.('video'));
      const hasAudio = Boolean(node.querySelector?.('audio, [data-icon*="audio"], [data-icon*="ptt"]'));
      const hasDocument = Boolean(node.querySelector?.('[data-icon*="document"], [data-icon*="doc"], a[href$=".pdf"], [aria-label$=".pdf"]'));
      const hasImage = Boolean(node.querySelector?.('img, canvas')) && !hasVideo;
      const hasMedia = hasImage || hasVideo || hasAudio || hasDocument;
      const mediaKind = hasDocument ? 'document' : hasAudio ? 'audio' : hasVideo ? 'video' : hasImage ? 'image' : 'none';
      const quoted = node.querySelector?.('[data-id*="quoted"], [data-testid*="quoted"], [aria-label*="Mensaje citado"], [aria-label*="Quoted"]');
      const quotedText = quoted ? String(quoted.innerText || '').trim().slice(0, 1000) : '';
      const quotedIdNode = quoted?.closest?.('[data-id]');
      const quotedId = quotedIdNode ? String(quotedIdNode.getAttribute('data-id') || '') : '';
      rows.push({ id, pre, text, fromMe, hasMedia, mediaKind, quotedText, quotedId });
      used.add(id);
    }
    return rows;
  });
}

async function baselineSourceMessages() {
  const rows = await extractVisibleMessages().catch(() => []);
  if (!BASELINE_IGNORE_HISTORY) {
    sourceBaselineCompleted = true;
    console.log(`Baseline configurado para procesar historial visible (${rows.length}).`);
    return;
  }
  let added = 0;
  for (const row of rows) { if (!seen.has(row.id)) added += 1; rememberSeen(row.id); }
  await saveSeenNow();
  sourceBaselineCompleted = true;
  console.log(`Baseline fuente: ${rows.length} mensaje(s) visibles ignorados como historial; ${added} ID(s) incorporados.`);
  await log(`SOURCE_BASELINE visible=${rows.length} added=${added}`);
}

function rowToSourceEvent(row) {
  const parsed = parseWhatsAppPre(row.pre, new Date());
  const externalId = String(row.id || '').slice(0, 320) || sha256(`${row.pre}|${row.text}`).slice(0, 64);
  return {
    bridgeVersion: `official-web-playwright-${VERSION}`,
    externalMessageId: externalId,
    groupId: SOURCE_GROUP_ID || `official-web:${sha256(SOURCE_CHANNEL_KEY).slice(0, 32)}`,
    groupName: activeSourceTitle || SOURCE_MATCHES[0],
    channelKey: SOURCE_CHANNEL_KEY,
    labChannelKey: LAB_CHANNEL_KEY,
    channelRole: 'source',
    shadowMode: true,
    senderId: String(row.fromMe ? 'self' : (parsed.senderLabel || 'unknown')).slice(0, 220),
    senderLabel: String(parsed.senderLabel || '').slice(0, 220),
    fromMe: Boolean(row.fromMe),
    timestamp: parsed.timestamp,
    type: row.hasMedia ? 'media' : 'chat',
    mediaKind: row.mediaKind || 'none',
    text: String(row.text || '').slice(0, 4000),
    hasMedia: Boolean(row.hasMedia),
    quotedExternalMessageId: row.quotedId ? String(row.quotedId).slice(0, 320) : null,
    rawMeta: JSON.stringify({ pre: row.pre, quotedText: row.quotedText || '', parsedTimestamp: parsed.parsed }).slice(0, 500)
  };
}

async function captureRow(row) {
  const event = rowToSourceEvent(row);
  const classification = classifyLocal(event.text);

  if (BACKEND_SYNC_ENABLED) {
    await queueEvent(event);
    if (Date.now() >= backendNextAllowedAt && backendState !== 'unauthorized') {
      await flushEventSpool(1);
    }
  }

  if (LAB_SEND_ENABLED && shouldMirror(classification)) {
    await queueMirror({
      sourceExternalMessageId: event.externalMessageId,
      sourceGroupName: event.groupName,
      labGroupName: LAB_GROUP_NAME,
      mirrorTag: mirrorTagFor(event.externalMessageId),
      text: localMirrorText(event, classification),
      source: 'local-fallback',
      createdAt: isoNow()
    });
  }

  rememberSeen(row.id);
  capturedCount += 1;
  lastSourceSeenAt = isoNow();
  if (['conversation', 'greeting', 'empty'].includes(classification.intent)) nonOperationalCount += 1;
  await appendTraining(event, classification, null);
}

async function processSourceRows() {
  const rows = await extractVisibleMessages();
  for (const row of rows) {
    if (seen.has(row.id)) { duplicateVisibleCount += 1; continue; }
    await captureRow(row);
  }
}

function labTestTagFor(externalMessageId) {
  return `[LABTEST:${sha256(externalMessageId).slice(0, 10)}]`;
}

function localLabTestReply(row, classification) {
  const textValue = String(row.text || '').slice(0, 1200);
  const entities = classification.entities || {};
  const details = [];
  if (entities.role) details.push(`Rol: ${entities.role === 'player' ? 'JUEGA' : 'CONSIGUE'}`);
  if (entities.play) details.push(`Jugada: ${entities.play}`);
  if (entities.horse) details.push(`Caballo: ${entities.horse}`);
  if (entities.amount != null) details.push(`Monto detectado: ${entities.amount}`);
  if (entities.raceNumber != null) details.push(`Carrera: ${entities.raceNumber}`);
  if (Array.isArray(entities.board) && entities.board.length) details.push(`Pizarra: ${entities.board.join('-')}`);
  return [
    labTestTagFor(row.id),
    '🧪 CONTROL HÍPICO · PRUEBA LAB',
    `Mensaje: ${textValue || '[sin texto]'}`,
    `Lectura: ${classification.intent} · riesgo ${classification.risk} · confianza ${(classification.confidence * 100).toFixed(1)}%`,
    ...details,
    `Propuesta: ${localSuggestion(classification)}`,
    '⚠️ PRUEBA LOCAL. No modifica jugadas, saldos, cierres ni resultados reales.'
  ].join('\n').slice(0, 3900);
}

async function clearComposerSafely(composer) {
  try { await composer.fill(''); return; } catch {}
  try {
    await composer.click({ timeout: 1000 });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
  } catch {}
}

async function messageComposer() {
  const candidates = [
    page.locator('footer div[contenteditable="true"][role="textbox"]').last(),
    page.locator('footer div[contenteditable="true"]').last(),
    page.locator('#main footer [contenteditable="true"]').last()
  ];
  for (const candidate of candidates) {
    if (await candidate.count() && await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

function sourceReplyTag(replyId) {
  return `[CHBOT:${sha256(replyId).slice(0, 10)}]`;
}

async function visibleSourceHasTag(tag) {
  await assertCurrentSourceIdentity();
  return page.evaluate((needle) => {
    const messages = Array.from(document.querySelectorAll('.message-out, [data-id]')).slice(-120);
    return messages.some((node) => String(node.innerText || '').includes(needle));
  }, tag).catch(() => false);
}

async function sendAutonomousReplyToSource(reply) {
  if (!SOURCE_AUTO_REPLY_ENABLED) {
    const error = new Error('SOURCE_AUTO_REPLY_DISABLED');
    error.retryable = true;
    throw error;
  }
  if (RUNTIME_MODE !== RUNTIME_MODES.PRODUCTION || !BACKEND_SYNC_ENABLED || !SOURCE_GROUP_ID) {
    const error = new Error('SOURCE_AUTO_REPLY_RUNTIME_NOT_AUTHORIZED');
    error.retryable = false;
    throw error;
  }
  if (String(reply.groupId || '').toLowerCase() !== SOURCE_GROUP_ID.toLowerCase()) {
    const error = new Error('SOURCE_AUTO_REPLY_DESTINATION_MISMATCH');
    error.retryable = false;
    throw error;
  }
  if (!(await openSourceGroup())) {
    const error = new Error('SOURCE_GROUP_NOT_AVAILABLE');
    error.retryable = true;
    throw error;
  }

  await assertCurrentSourceIdentity();
  const tag = sourceReplyTag(reply.replyId);
  if (await visibleSourceHasTag(tag)) {
    await log(`SOURCE_REPLY_ALREADY_VISIBLE ${reply.sourceMessageId} ${tag}`);
    return true;
  }

  const composer = await messageComposer();
  if (!composer) {
    const error = new Error('SOURCE_COMPOSER_NOT_FOUND');
    error.retryable = true;
    throw error;
  }

  const body = `${String(reply.text || '').trim().slice(0, 3600)}\n${tag}`.trim();
  if (!body || body.length > 3900) {
    const error = new Error('SOURCE_AUTO_REPLY_TEXT_INVALID');
    error.retryable = false;
    throw error;
  }

  await composer.click({ timeout: 3000 });
  await page.keyboard.insertText(body);
  try {
    await assertCurrentSourceIdentity();
  } catch (error) {
    await clearComposerSafely(composer);
    throw error;
  }

  await page.keyboard.press('Enter');
  await sleep(800);
  await assertCurrentSourceIdentity();
  if (!(await visibleSourceHasTag(tag))) {
    const error = new Error('SOURCE_REPLY_VISUAL_RECEIPT_MISSING');
    error.retryable = true;
    throw error;
  }

  sourceReplyCount += 1;
  await log(`SOURCE_REPLY_SENT ${reply.sourceMessageId} ${tag} action=${reply.action}`);
  return true;
}

async function flushSourceReplySpool() {
  if (!SOURCE_AUTO_REPLY_ENABLED || flushingSourceReplies) return;
  flushingSourceReplies = true;
  try {
    return await spoolRuntime.flushSourceReplies(sendAutonomousReplyToSource, { limit: 8 });
  } finally {
    flushingSourceReplies = false;
  }
}

async function sendTextInCurrentLab(textValue, tag) {
  await assertCurrentLabIdentity();
  if (tag && await visibleLabHasTag(tag)) return true;
  const composer = await messageComposer();
  if (!composer) throw new Error('No encontré el compositor del grupo LAB.');
  await composer.click({ timeout: 3000 });
  await page.keyboard.insertText(String(textValue).slice(0, 3900));
  try {
    await assertCurrentLabIdentity();
  } catch (error) {
    await clearComposerSafely(composer);
    throw error;
  }
  await page.keyboard.press('Enter');
  await sleep(700);
  await assertCurrentLabIdentity();
  if (tag && !(await visibleLabHasTag(tag))) throw new Error('No pude verificar la respuesta de prueba en LAB.');
  return true;
}

async function processLabTestInput() {
  if (!LAB_TEST_INPUT_ENABLED) return;
  const sourceBefore = await currentChatTitle();
  const opened = await openGroup(LAB_GROUP_NAME, true);
  if (!opened || normalize(await currentChatTitle()) !== normalize(LAB_GROUP_NAME)) {
    await log(`LAB_TEST_OPEN_FAIL current=${await currentChatTitle()}`);
    await writeDomDiagnostic('lab-test-open-fail');
    if (sourceTitleMatches(sourceBefore, SOURCE_MATCHES)) await openSourceGroup().catch(() => false);
    return;
  }
  try {
    await assertCurrentLabIdentity();
  } catch (error) {
    await log(`LAB_TEST_IDENTITY_FAIL ${error.message}`);
    await writeDomDiagnostic('lab-test-identity-fail');
    await openSourceGroup().catch(() => false);
    return;
  }

  const rows = await extractVisibleMessages().catch(() => []);
  const visible = labBootstrapCompleted ? rows : rows.slice(-LAB_TEST_BOOTSTRAP_LIMIT);
  let processed = 0;

  for (const row of visible) {
    if (!row?.id || labSeen.has(row.id)) continue;
    rememberLabSeen(row.id);
    const body = String(row.text || '').trim();
    if (!body) continue;
    if (body.includes('[SHADOW:') || body.includes('[LABTEST:') || body.includes('🧪 CONTROL HÍPICO · SHADOW')) continue;

    const classification = classifyLocal(body);
    const tag = labTestTagFor(row.id);
    try {
      await sendTextInCurrentLab(localLabTestReply(row, classification), tag);
      processed += 1;
      await log(`LAB_TEST_READ id=${row.id} intent=${classification.intent}`);
    } catch (error) {
      await log(`LAB_TEST_REPLY_FAIL id=${row.id} ${error.message}`);
    }
  }

  labBootstrapCompleted = true;
  await saveLabSeenNow();
  if (processed) console.log(`LAB prueba: ${processed} mensaje(s) leído(s) y clasificado(s).`);
  await openSourceGroup().catch(() => false);
  activeSourceTitle = await currentChatTitle();
}

async function visibleLabHasTag(tag) {
  return page.evaluate((needle) => {
    const messages = Array.from(document.querySelectorAll('.message-out, [data-id]')).slice(-100);
    return messages.some((node) => String(node.innerText || '').includes(needle));
  }, tag).catch(() => false);
}
async function sendMirrorToLab(mirror) {
  if (!LAB_SEND_ENABLED) return false;
  if (normalize(mirror.labGroupName) !== normalize(LAB_GROUP_NAME)) throw new Error('Destino lab no autorizado.');
  if (!(await openGroup(LAB_GROUP_NAME, true))) throw new Error(`No pude abrir el grupo lab exacto: ${LAB_GROUP_NAME}`);
  await assertCurrentLabIdentity();
  if (await visibleLabHasTag(mirror.mirrorTag)) return true;

  await sendTextInCurrentLab(String(mirror.text).slice(0, 3900), mirror.mirrorTag);
  mirroredCount += 1;
  await log(`LAB_SENT ${mirror.sourceExternalMessageId} ${mirror.mirrorTag} source=${mirror.source}`);
  return true;
}
async function deliverLabMirror(mirror) {
  try {
    const delivered = await sendMirrorToLab(mirror);
    if (!delivered) {
      const error = new Error('LAB_SEND_DISABLED');
      error.retryable = true;
      throw error;
    }
  } catch (error) {
    await log(`LAB_PENDING ${mirror?.sourceExternalMessageId || 'unknown'} ${error.message}`);
    throw error;
  } finally {
    if (await openSourceGroup().catch(() => false)) activeSourceTitle = await currentChatTitle();
  }
}
async function flushMirrorSpool() {
  if (!LAB_SEND_ENABLED || flushingMirrors) return;
  flushingMirrors = true;
  try {
    return await spoolRuntime.flushLab(deliverLabMirror, { limit: 8 });
  } finally { flushingMirrors = false; }
}

async function printHealthSummary(force = false) {
  const spool = await spoolRuntime.snapshot();
  const eventSpool = spool.pendingBackend;
  const mirrorSpool = spool.pendingLab;
  const deadLetters = spool.quarantined;
  const cooldown = Math.max(0, backendNextAllowedAt - Date.now());
  const backendLabel = BACKEND_SYNC_ENABLED ? backendState : 'local-only';
  const readiness = assessRuntimeReadiness({
    runtimeMode: RUNTIME_MODE,
    backendState,
    activeSourceTitle,
    sourceMatches: SOURCE_MATCHES,
    eventSpool,
    mirrorSpool,
    deadLetters
  });
  const line = `HEALTH ready=${readiness.ready} mode=${RUNTIME_MODE} source=${activeSourceTitle || 'buscando'} | backend=${backendLabel}${cooldown && BACKEND_SYNC_ENABLED ? ` cooldown=${Math.ceil(cooldown/1000)}s` : ''} | capturados=${capturedCount} | spool=${eventSpool} | labPend=${mirrorSpool} | dead=${deadLetters}`;
  const heartbeatDue = Date.now() - lastHealthHeartbeatAt >= 300000;
  if (force && (line !== lastPrintedHealthLine || heartbeatDue)) {
    console.log(line);
    lastPrintedHealthLine = line;
    lastHealthHeartbeatAt = Date.now();
  }
  await writeHealth({ summary: line });
}

async function monitor() {
  let lastStatus = '';
  let lastHealthPrint = 0;
  while (!stopping && page && !page.isClosed()) {
    try {
      if (await hasWhatsAppBrowserDatabaseError()) {
        await requestCleanProfileReset('WHATSAPP_BROWSER_DATABASE_ERROR');
        break;
      }

      if (!(await isLoggedIn())) {
        if (lastStatus !== 'login') {
          console.log('\nWhatsApp Web oficial está abierto. Si ves QR, vincúlalo desde Dispositivos vinculados.\n');
          lastStatus = 'login';
        }
        await sleep(1500); continue;
      }
      if (!(await currentChatIsSource())) {
        if (!(await openSourceGroup())) {
          if (lastStatus !== 'choose-source') {
            console.log(`\nNo encontré el grupo fuente. Busco cualquiera de estos nombres:`);
            for (const alias of SOURCE_MATCHES) console.log(`- ${alias}`);
            console.log('Puede estar archivado; se intenta también búsqueda global.');
            console.log(`Si ya ves el grupo abierto en Chrome, déjalo abierto: v${VERSION} detecta el encabezado aunque WhatsApp no exponga title.`);
            console.log(`Diagnóstico DOM: ${DOM_DIAGNOSTIC_FILE}\n`);
            lastStatus = 'choose-source';
          }
          await sleep(1200); continue;
        }
      }
      activeSourceTitle = await currentChatTitle();
      await assertCurrentSourceIdentity();
      if (lastStatus !== 'monitoring') {
        console.log(`\nFuente activa: ${activeSourceTitle}`);
        console.log(`Binding fuente: ${SOURCE_GROUP_ID ? redactGroupId(SOURCE_GROUP_ID) : 'solo nombre (LAB bloqueado)'}`);
        console.log('FUENTE: SOLO LECTURA. El Bridge no contiene ruta de envío hacia el grupo real.');
        console.log(`LAB: ${LAB_GROUP_NAME} (${LAB_SEND_ENABLED ? 'shadow habilitado con ID pinneado' : 'shadow deshabilitado'})`);
        console.log('Dinero/ledger/estado real: BLOQUEADOS.\n');
        await log(`SOURCE_ACTIVE title=${activeSourceTitle} key=${SOURCE_CHANNEL_KEY} sourceBound=${Boolean(SOURCE_GROUP_ID)} labBound=${Boolean(LAB_GROUP_ID)} labSend=${LAB_SEND_ENABLED}`);
        lastStatus = 'monitoring';
      }
      await assertCurrentSourceIdentity();
      if (!sourceBaselineCompleted) await baselineSourceMessages();
      else await processSourceRows();

      await flushEventSpool();
      await flushMirrorSpool();
      if (LAB_TEST_INPUT_ENABLED && Date.now() - lastLabTestPollAt >= LAB_TEST_POLL_MS) {
        lastLabTestPollAt = Date.now();
        await processLabTestInput();
      }
      if (Date.now() - lastHealthPrint > 15000) { await printHealthSummary(true); lastHealthPrint = Date.now(); }
      await sleep(POLL_MS);
    } catch (error) {
      console.error(`Monitor: ${error.message}`);
      await log(`MONITOR_ERROR ${error.stack || error.message}`);
      await screenshot('monitor-error');
      await sleep(2000);
    }
  }
}

async function main() {
  console.log('\n========================================================');
  console.log(` CONTROL HÍPICO - WHATSAPP WEB BRIDGE v${VERSION}`);
  console.log(' FUENTE REAL READ-ONLY -> LAB SHADOW + SPOOL V2 DURABLE');
  console.log(' Chrome/Edge oficial + Playwright 1.62.1');
  console.log('========================================================\n');
  console.log('No implementa el protocolo de WhatsApp: controla web.whatsapp.com real.');
  console.log('Aliases fuente autorizados:');
  for (const alias of SOURCE_MATCHES) console.log(`  - ${alias}`);
  console.log(`Laboratorio: ${LAB_GROUP_NAME}`);
  console.log(`Pinning IDs: ${REQUIRE_PINNED_GROUP_IDS ? 'OBLIGATORIO' : 'NO REQUERIDO'}`);
  console.log(`Fuente ID: ${SOURCE_GROUP_ID ? redactGroupId(SOURCE_GROUP_ID) : 'NO CONFIGURADO'}`);
  console.log(`LAB ID: ${LAB_GROUP_ID ? redactGroupId(LAB_GROUP_ID) : 'NO CONFIGURADO'}`);
  console.log(`Mirror LAB: ${LAB_SEND_ENABLED ? 'HABILITADO' : 'DESHABILITADO'}`);
  console.log(`Entrada de prueba LAB: ${LAB_TEST_INPUT_ENABLED ? 'HABILITADA' : 'DESHABILITADA'}`);
  console.log('Envío al grupo fuente: IMPOSIBLE POR DISEÑO.');
  console.log(`Seen IDs cargados: ${seen.size}`);
  console.log(`Modo runtime: ${RUNTIME_MODE}`);
  console.log(`Backend cloud: ${BACKEND_SYNC_ENABLED ? 'HABILITADO CON SPOOL V2 DURABLE' : 'DESACTIVADO - SHADOW LOCAL'}`);
  console.log(`Datos locales: ${DATA_DIR}\n`);

  const spoolInit = await spoolRuntime.initialize();
  const legacyMigrated = spoolInit.events.migrated + spoolInit.mirrors.migrated + spoolInit.dead.migrated;
  const legacyCorrupt = spoolInit.events.corrupt + spoolInit.mirrors.corrupt + spoolInit.dead.corrupt;
  if (legacyMigrated || legacyCorrupt) {
    console.log(`Spool v2: ${legacyMigrated} registro(s) legacy en cuarentena; ${legacyCorrupt} corrupto(s) aislado(s).`);
    await log(`SPOOL_V2_INIT legacy=${legacyMigrated} corrupt=${legacyCorrupt}`);
  }

  const health = await backendHealth();
  backendState = health.state;
  if (health.ok) {
    console.log(`Backend preflight: ${health.state.toUpperCase()}`);
    if (health.state === 'online') { backendFailureStreak = 0; backendNextAllowedAt = 0; lastBackendOkAt = isoNow(); }
    if (health.state === 'local-only') { backendFailureStreak = 0; backendNextAllowedAt = 0; backendState = 'local-only'; }
  } else if (health.state === 'unauthorized') {
    console.log('Backend preflight: TOKEN RECHAZADO. La captura local puede iniciar, pero el spool no se enviará.');
    backendState = 'unauthorized';
  } else if (health.state === 'rate-limited') {
    const wait = health.retryAfterMs || 60000;
    backendNextAllowedAt = Date.now() + wait;
    backendState = 'throttled';
    console.log(`Backend preflight: 429. Cooldown inicial ${Math.ceil(wait/1000)}s; la captura local seguirá funcionando.`);
  } else {
    console.log(`Backend preflight: ${health.state}. La captura local seguirá funcionando.`);
  }
  await saveRetryState();

  const launched = await launchOfficialChrome();
  context = launched.context;
  console.log(`Navegador controlado: ${launched.channel}`);
  page = context.pages()[0] || await context.newPage();
  context.on('page', (newPage) => { if (!page || page.isClosed()) page = newPage; });
  context.on('close', () => { stopping = true; });
  await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await log(`START v=${VERSION} browser=${launched.channel} seen=${seen.size} sourceBound=${Boolean(SOURCE_GROUP_ID)} labBound=${Boolean(LAB_GROUP_ID)}`);
  await writeHealth({ startup: true });
  await monitor();
}

async function shutdown() {
  stopping = true;
  console.log('\nCerrando Bridge de forma segura...');
  try { await saveSeenNow(); } catch {}
  try { await saveLabSeenNow(); } catch {}
  try { await saveRetryState(); } catch {}
  try { await writeHealth({ stopping: true }); } catch {}
  try { await context?.close(); } catch {}
}
process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });
process.on('uncaughtException', async (error) => {
  console.error('UNCAUGHT:', error);
  await log(`UNCAUGHT ${error.stack || error.message}`);
  await screenshot('uncaught');
});
process.on('unhandledRejection', async (reason) => {
  console.error('UNHANDLED:', reason);
  await log(`UNHANDLED ${reason?.stack || reason}`);
  await screenshot('unhandled');
});

main().catch(async (error) => {
  console.error(`FALLO DE INICIO: ${error.message}`);
  await log(`START_FAIL ${error.stack || error.message}`);
  await screenshot('start-fail');
  process.exitCode = 1;
});
