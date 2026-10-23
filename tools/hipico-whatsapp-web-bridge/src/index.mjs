import './source-read-startup-denial.mjs';
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
import { createSourceReplyJournal } from './source-reply-journal.mjs';
import { labSendFailure, labSeenOutcome } from './lab-delivery-state.mjs';
import { createLabTestReplyJournal, labTestTagForMessage } from './lab-test-reply-journal.mjs';
import { atomicWriteJson } from './spool-journal.mjs';
import { createLabConversationContext, labConversationInput, planLabConversation, stableLabSenderKey } from './lab-conversation-context.mjs';
import { localKillSwitchState } from './promotion-guard.mjs';
import { queryCanonicalLab, explicitLabRaceScope, labReadOnlyQueryPurpose, resolveQuotedLabRaceScope } from './lab-canonical-query.mjs';
import { checkLabSendEligibility } from './lab-handoff-eligibility.mjs';
import { selectLabAnswer } from './lab-answer-policy.mjs';
import { labOutgoingEvidenceMatches } from './lab-outgoing-evidence.mjs';
import { composeLabAssistantReply } from './lab-assistant-replies.mjs';
import { createLabQuotedRaceJournal } from './lab-quoted-race-journal.mjs';
import { createLabQueryBackoff } from './lab-query-backoff.mjs';
import { createLabPendingQueryInbox, reconcileLabPendingObservation } from './lab-pending-query-inbox.mjs';
import { assertSourceAutoReadDenied } from './source-read-policy-gate.mjs';
import { evaluateSourceAutoReplyPolicy } from './source-policy-gate.mjs';

// #1011: evaluate before local data directories, spools, network or Chromium.
assertSourceAutoReadDenied();

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
  labTestBootstrapLimit: LAB_TEST_BOOTSTRAP_LIMIT,
  labAssistantName: LAB_ASSISTANT_NAME
} = config;
const SOURCE_REPLY_KILL_SWITCH = localKillSwitchState();
// Transport writes require an independently reviewed legal/provider GO. An
// operator env flag and a cleared kill switch cannot authorize SOURCE writes.
const SOURCE_AUTO_REPLY_ACTIVE = SOURCE_AUTO_REPLY_ENABLED
  && !SOURCE_REPLY_KILL_SWITCH.active
  && evaluateSourceAutoReplyPolicy(config).eligible;
const PROFILE_DIR = path.join(DATA_DIR, 'chrome-profile');
const LEGACY_EVENT_SPOOL_DIR = path.join(DATA_DIR, 'spool-events');
const LEGACY_MIRROR_SPOOL_DIR = path.join(DATA_DIR, 'spool-lab-mirror');
const LEGACY_DEADLETTER_DIR = path.join(DATA_DIR, 'dead-letter');
const SPOOL_V2_DIR = path.join(DATA_DIR, 'spool-v2');
const SOURCE_REPLY_DIR = path.join(DATA_DIR, 'source-replies');
const LAB_TEST_REPLY_DIR = path.join(DATA_DIR, 'lab-test-replies');
const LAB_PENDING_INBOX_DIR = path.join(DATA_DIR, 'lab-pending-queries');
const LAB_CONTEXT_FILE = path.join(DATA_DIR, `lab-conversation-${sha256(LAB_GROUP_ID || LAB_CHANNEL_KEY).slice(0,16)}.json`);
const LAB_QUOTED_CONTEXT_FILE = path.join(DATA_DIR, `lab-quoted-races-${sha256(`${LAB_GROUP_ID}|${SOURCE_GROUP_ID}`).slice(0,16)}.json`);
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

for (const dir of [DATA_DIR, PROFILE_DIR, LEGACY_EVENT_SPOOL_DIR, LEGACY_MIRROR_SPOOL_DIR, LEGACY_DEADLETTER_DIR, TRAINING_DIR, SOURCE_REPLY_DIR]) {
  await fs.mkdir(dir, { recursive: true });
}

let context = null;
let page = null;
let seen = await loadSeen();
let labSeen = await loadLabSeen();
const labTestReplyJournal = LAB_TEST_INPUT_ENABLED ? createLabTestReplyJournal({
  rootDir:LAB_TEST_REPLY_DIR,labGroupId:LAB_GROUP_ID,sourceGroupId:SOURCE_GROUP_ID
}) : null;
const labQuotedRaceJournal = labTestReplyJournal ? createLabQuotedRaceJournal({
  file:LAB_QUOTED_CONTEXT_FILE,labGroupId:LAB_GROUP_ID,sourceGroupId:SOURCE_GROUP_ID
}) : null;
const labPendingInbox = labTestReplyJournal && BACKEND_SYNC_ENABLED ? createLabPendingQueryInbox({
  rootDir: LAB_PENDING_INBOX_DIR, labGroupId: LAB_GROUP_ID, sourceGroupId: SOURCE_GROUP_ID
}) : null;
const labConversationContext = labTestReplyJournal ? createLabConversationContext({
  file:LAB_CONTEXT_FILE,groupId:LAB_GROUP_ID
}) : null;
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
let sourceReplySentCount = 0;
let sourceReplyAmbiguousCount = 0;
let labTestAmbiguousCount = 0;
let duplicateVisibleCount = 0;
let nonOperationalCount = 0;
let lastPostStartedAt = 0;
let lastLabTestPollAt = 0;
let labBootstrapCompleted = false;
let lastLabPendingPruneAt = 0;
let lastLabPendingOffset = 0;
const labQueryBackoff=createLabQueryBackoff();
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
  await atomicWriteJson(LAB_SEEN_FILE,values);
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
const sourceReplyJournal = createSourceReplyJournal({
  rootDir: SOURCE_REPLY_DIR,
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
  const sourceReplies = await sourceReplyJournal.snapshot();
  const labAck = labTestReplyJournal ? await labTestReplyJournal.snapshot() : null;
  const labPending = labPendingInbox ? await labPendingInbox.snapshot() : null;
  labTestAmbiguousCount=labAck?.ambiguous ?? 0;
  const counters = {
    captured: capturedCount,
    delivered: deliveredCount,
    mirrored: mirroredCount,
    sourceRepliesSent: sourceReplySentCount,
    sourceRepliesAmbiguous: sourceReplyAmbiguousCount,
    labTestReplyAmbiguous: labTestAmbiguousCount,
    labTestReplyPending: labAck?.pending ?? 0,
    labPendingQueries: labPending?.pending ?? 0,
    labTestReplyStates: labAck?.counts ?? null,
    duplicateVisible: duplicateVisibleCount,
    nonOperational: nonOperationalCount,
    seenIds: seen.size,
    labSeenIds: labSeen.size,
    eventSpool: spool.pendingBackend,
    mirrorSpool: spool.pendingLab,
    deadLetters: spool.quarantined,
    spoolStates: spool.counts,
    sourceReplyStates: sourceReplies.counts,
    sourceReplyPending: sourceReplies.pending
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
    mode: SOURCE_AUTO_REPLY_ACTIVE ? 'SOURCE_SAFE_AUTO_REPLY' : 'SOURCE_READ_ONLY_TO_LAB_SHADOW',
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
    sourceAutoReplyEnabled: SOURCE_AUTO_REPLY_ACTIVE,
    sourceSendPossible: SOURCE_AUTO_REPLY_ACTIVE && backendState === 'online',
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
    'Respuesta contextual: Espejo informativo local; no se ha consultado una fuente canónica.',
    'Estado de consulta canónica: LAB_LOCAL_ONLY',
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

function sourceReplyReceiptUrl(commandId) {
  const url = new URL(INGEST_URL);
  if (!/\/events$/.test(url.pathname)) throw new Error('SOURCE_REPLY_RECEIPT_URL_INVALID');
  url.pathname = url.pathname.replace(/\/events$/, `/replies/${encodeURIComponent(commandId)}/receipt`);
  return url.toString();
}

async function backendPostSourceReplyReceipt(record) {
  if (!BACKEND_SYNC_ENABLED || !TOKEN) throw new Error('SOURCE_REPLY_RECEIPT_BACKEND_UNAVAILABLE');
  const response = await fetch(sourceReplyReceiptUrl(record.commandId), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hipico-bridge-token': TOKEN,
      'x-request-id': `hipico-reply-${sha256(record.commandId).slice(0, 24)}`
    },
    body: JSON.stringify({
      status: record.state === 'sent' ? 'sent' : 'ambiguous',
      providerMessageId: record.deliveryRef || null,
      error: record.lastError || null
    }),
    signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS)
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) {
    const info = classifyHttpFailure(response, body, raw);
    const error = new Error(`Source reply receipt ${info.status}: ${info.message}`);
    Object.assign(error, info);
    throw error;
  }
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
    if (RUNTIME_MODE === RUNTIME_MODES.PRODUCTION && Boolean(body?.sourceSendPossible) !== Boolean(SOURCE_AUTO_REPLY_ACTIVE)) {
      return { state: 'source-reply-config-mismatch', ok: false, status: response.status, body };
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
    if (SOURCE_AUTO_REPLY_ACTIVE && event.channelRole === 'source' && result?.sourceReply?.canSend) {
      if (String(result.sourceReply.targetGroupId || '').toLowerCase() !== String(SOURCE_GROUP_ID || '').toLowerCase()) {
        const error = new Error('SOURCE_REPLY_DESTINATION_MISMATCH');
        error.retryable = false;
        throw error;
      }
      await sourceReplyJournal.queue(result.sourceReply);
      await log(`SOURCE_REPLY_QUEUED command=${result.sourceReply.commandId} source=${event.externalMessageId}`);
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
    preserve: ['spool-v2', 'spool-events', 'spool-lab-mirror', 'dead-letter', 'training', 'seen-source-message-ids.json', 'source-replies', 'lab-test-replies', 'lab-pending-queries', path.basename(LAB_QUOTED_CONTEXT_FILE), path.basename(LAB_CONTEXT_FILE)]
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
    if (row.fromMe) {
      rememberSeen(row.id);
      await log(`SOURCE_SELF_SKIP id=${String(row.id||'').slice(0,120)}`);
      continue;
    }
    await captureRow(row);
  }
}

function labTestTagFor(externalMessageId) {
  return labTestTagForMessage(externalMessageId);
}

function localLabTestReply(row, classification, plan = null, canonical = null) {
  const answer=selectLabAnswer({
    canonical,plan,localFallback:localSuggestion(classification)
  });
  const natural=composeLabAssistantReply({
    classification,plan,canonical,answer,assistantName:LAB_ASSISTANT_NAME
  });
  // The exact outgoing proof is a first-line tag plus bounded LAB metadata,
  // never an arbitrary quoted substring. The human-facing answer remains
  // natural; its receipt source is explicitly marked as internal or local.
  return [
    labTestTagFor(row.id),
    '🧪 CONTROL HÍPICO · PRUEBA LAB',
    'Respuesta: '+String(natural||'No tengo datos autorizados para responder.')
      .replace(/\s+/g,' ').trim().slice(0,1500),
    'Fuente: '+answer.source,
    'Consulta: '+answer.reason
  ].join('\n').slice(0,3900);
}

async function clearComposerSafely(composer) {
  try { await composer.fill(''); return true; } catch {}
  try {
    await composer.click({ timeout: 1000 });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    return true;
  } catch { return false; }
}

async function visibleComposer() {
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

async function visibleOutgoingTextCount(textValue) {
  const expected = String(textValue || '').replace(/\s+/g, ' ').trim();
  if (!expected) return 0;
  return page.evaluate((needle) => {
    const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visibleMessageText = (node) => {
      const selectable = node.querySelector('span.selectable-text');
      if (selectable) return normalizeText(selectable.innerText || selectable.textContent);
      const messageText = node.querySelector('[data-testid="msg-text"]');
      if (messageText) return normalizeText(messageText.innerText || messageText.textContent);
      return normalizeText(node.innerText || node.textContent);
    };
    const messages = Array.from(document.querySelectorAll('.message-out')).slice(-120);
    return messages.filter((node) => visibleMessageText(node) === needle).length;
  }, expected).catch(() => 0);
}

async function sendTextInCurrentSource(record) {
  if (!SOURCE_AUTO_REPLY_ACTIVE) {
    const error = new Error('SOURCE_AUTO_REPLY_DISABLED');
    error.safeToRetry = true;
    throw error;
  }
  if (String(record.targetGroupId || '').toLowerCase() !== String(SOURCE_GROUP_ID || '').toLowerCase()) {
    throw new Error('SOURCE_REPLY_DESTINATION_MISMATCH');
  }
  if (!(await currentChatIsSource()) && !(await openSourceGroup())) {
    const error = new Error('SOURCE_GROUP_NOT_OPEN');
    error.safeToRetry = true;
    throw error;
  }
  try { await assertCurrentSourceIdentity(); }
  catch (cause) {
    const error = new Error(`SOURCE_IDENTITY_NOT_VERIFIED: ${cause?.message || cause}`);
    error.safeToRetry = true;
    throw error;
  }
  const outgoingBefore = await visibleOutgoingTextCount(record.text);
  const composer = await visibleComposer();
  if (!composer) {
    const error = new Error('SOURCE_COMPOSER_NOT_FOUND');
    error.safeToRetry = true;
    throw error;
  }
  try {
    await composer.click({ timeout: 3000 });
    await page.keyboard.insertText(String(record.text).slice(0, 3900));
  } catch (cause) {
    await clearComposerSafely(composer);
    const error = new Error(`SOURCE_REPLY_COMPOSE_FAILED: ${cause?.message || cause}`);
    error.safeToRetry = true;
    throw error;
  }
  try { await assertCurrentSourceIdentity(); }
  catch (cause) {
    await clearComposerSafely(composer);
    const error = new Error(`SOURCE_IDENTITY_CHANGED_BEFORE_SEND: ${cause?.message || cause}`);
    error.safeToRetry = true;
    throw error;
  }
  await page.keyboard.press('Enter');
  let outgoingAfter = outgoingBefore;
  for (let attempt = 0; attempt < 5 && outgoingAfter <= outgoingBefore; attempt += 1) {
    await sleep(300);
    await assertCurrentSourceIdentity();
    outgoingAfter = await visibleOutgoingTextCount(record.text);
  }
  if (outgoingAfter <= outgoingBefore) throw new Error('SOURCE_REPLY_DELIVERY_NOT_VERIFIED');
  return { deliveryRef: `waweb-local:${record.commandId}` };
}

async function syncSourceReplyReceipts() {
  if (!BACKEND_SYNC_ENABLED) return;
  for (const record of await sourceReplyJournal.receiptPending(20)) {
    try {
      await backendPostSourceReplyReceipt(record);
      await sourceReplyJournal.markReceiptSynced(record.commandId);
      await log(`SOURCE_REPLY_RECEIPT_SYNCED id=${record.commandId} state=${record.state}`);
    } catch (error) {
      await log(`SOURCE_REPLY_RECEIPT_PENDING id=${record.commandId} state=${record.state} error=${error?.message || error}`);
    }
  }
}

async function flushSourceReplies() {
  if (!SOURCE_AUTO_REPLY_ACTIVE || flushingSourceReplies) return;
  flushingSourceReplies = true;
  try {
    const result = await sourceReplyJournal.flush(async (record) => {
      const receipt = await sendTextInCurrentSource(record);
      sourceReplySentCount += 1;
      await log(`SOURCE_REPLY_SENT id=${record.commandId} source=${record.sourceMessageId}`);
      return receipt;
    }, { limit: 8 });
    sourceReplyAmbiguousCount += result.ambiguous;
    await syncSourceReplyReceipts();
    return result;
  } finally {
    flushingSourceReplies = false;
  }
}

async function sendTextInCurrentLab(textValue, tag) {
  try { await assertCurrentLabIdentity(); }
  catch { throw labSendFailure({sendAttempted:false,composerCleared:true}); }
  if (tag && await visibleLabHasTag(tag)) return true;
  let composer;
  try { composer = await visibleComposer(); }
  catch { throw labSendFailure({sendAttempted:false,composerCleared:true}); }
  if (!composer) throw labSendFailure({sendAttempted:false,composerCleared:true});
  let sendAttempted = false;
  try {
    await composer.click({ timeout: 3000 });
    await page.keyboard.insertText(String(textValue).slice(0, 3900));
    await assertCurrentLabIdentity();
    // Keyboard.press may send even if it later throws. From here, delivery is ambiguous.
    sendAttempted = true;
    await page.keyboard.press('Enter');
    await sleep(700);
    await assertCurrentLabIdentity();
    if (tag && !(await visibleLabHasTag(tag))) throw new Error('LAB_DELIVERY_NOT_VISIBLE');
    return true;
  } catch {
    const cleared = !sendAttempted && await clearComposerSafely(composer);
    throw labSendFailure({sendAttempted,composerCleared:Boolean(cleared)});
  }
}
// Restore bounded encrypted LAB informational queries independently of DOM scroll state.
// This operation runs only while the correct LAB group is open and pinned.
// A durable LAB response ACK can outlive the journal hint persistence.
// Rebuild only informational same-sender, explicit race context after ACK.
// Only the immutable encrypted pre-query record can restore sender memory
// after an ACK. Mutable DOM text has no post-crash authority.
async function recoverConfirmedLabConversation(entry,confirmedAt) {
  if(!entry||!labConversationContext)return false;
  const sender=stableLabSenderKey(entry.messageId);
  if(!sender||sender!==entry.senderId||!entry.race)return false;
  const classification=classifyLocal(entry.text);
  const verifiedPurpose=labReadOnlyQueryPurpose(entry.text,classification);
  if(!verifiedPurpose||verifiedPurpose!==entry.purpose)return false;
  const plan=planLabConversation(
    {id:entry.messageId,text:entry.text,fromMe:false,hasMedia:false},
    classification,null,entry.race
  );
  if(plan.scopeConflict||!plan.raceScope)return false;
  try {
    // False means the context store intentionally declined the backfill
    // (expired ACK or a newer sender hint). Do not report it as restored or
    // discard the encrypted original merely because the call did not throw.
    return (await labConversationContext.recoverConfirmed(sender,plan.raceScope,confirmedAt))===true;
  }catch{
    await log('LAB_CONTEXT_ACK_RECOVERY_FAILED');
    return false;
  }
}

async function rememberConfirmedPendingLabQuote(entry) {
  if(!labQuotedRaceJournal)return true;
  const sender=stableLabSenderKey(entry.messageId);
  const classification=classifyLocal(entry.text);
  // The encrypted request is immutable, but an ACK is NOT a claim that the
  // text is unambiguous. Reuse the same conservative single-race predicate
  // as live conversation processing; never promote first-regex-match facts.
  const race=confirmedLabQuoteHint({
    id:entry.messageId,text:entry.text,fromMe:false,hasMedia:false
  },classification);
  if(!sender||sender!==entry.senderId||!race||
     entry.race?.raceNumber!==race.raceNumber||
     entry.race?.racetrack!==race.racetrack||
     entry.race?.raceDate!==race.raceDate)return true;
  try{
    await labQuotedRaceJournal.remember({
      messageId:entry.messageId,senderId:sender,race,confirmed:true
    });
    return true;
  }catch{
    await log('LAB_QUOTE_HINT_PERSIST_FAILED');
    // Preserve encrypted pending input for the next ACK-only recovery cycle.
    return false;
  }
}

// The confirmed send journal outranks the auxiliary seen file. Finish
// quote persistence using the immutable encrypted pre-query record before
// removing it; after a crash this can run again without ever pressing Enter.
async function finalizeConfirmedVisibleLabQuote(row,body,{retainEncryptedInput=false}={}) {
  const stored=await labPendingInbox?.read(row.id);
  if(stored){
    if(await rememberConfirmedPendingLabQuote(stored) && !retainEncryptedInput){
      await labPendingInbox.remove(row.id);
    }
    return;
  }
  // Without the original encrypted, pre-query input we cannot prove the
  // visible text/quoted race matches the immutable ACKed request. No memory
  // backfill from mutable DOM content; the confirmed delivery still stands.
  await log('LAB_QUOTE_HINT_NO_VERIFIED_INPUT');
}

async function resumePendingLabQueries(visibleIds = new Set(), alreadySeenIds = new Set()) {
  if (!labPendingInbox || !BACKEND_SYNC_ENABLED) return;
  const pending = await labPendingInbox.list(25,{offset:lastLabPendingOffset});
  lastLabPendingOffset=(lastLabPendingOffset+Math.max(1,pending.length))%200;
  for (const entry of pending) {
    const tag = labTestTagFor(entry.messageId);
    const state = await labTestReplyJournal.read(entry.messageId);
    // A persisted human takeover/terminal LAB seen marker wins if a crash
    // occurred between fsync of LAB_SEEN_FILE and ciphertext deletion.
    // Keep uncertain Enter and confirmed ACK rows eligible for evidence-only
    // reconciliation; they must never trigger a new send from this branch.
    if(alreadySeenIds.has(entry.messageId) &&
       !['confirmed','sending','ambiguous'].includes(state?.state)){
      await labPendingInbox.remove(entry.messageId);
      await log('LAB_PENDING_ALREADY_HANDLED id='+tag);
      continue;
    }
    // An already confirmed ACK can finish its auxiliary HMAC hint even when
    // the row is still visible or the canonical backend is offline. No Enter.
    if (visibleIds.has(entry.messageId) && state?.state !== 'confirmed') continue;
    if (state?.state === 'confirmed') {
      const restored=await recoverConfirmedLabConversation(entry,state.updatedAt);
      rememberLabSeen(entry.messageId);
      await saveLabSeenNow();
      if(await rememberConfirmedPendingLabQuote(entry) && (!entry.race||restored)){
        await labPendingInbox.remove(entry.messageId);
      }
      continue;
    }
    if (state?.state === 'sending' || state?.state === 'ambiguous') {
      await assertCurrentLabIdentity();
      if (await visibleLabHasTag(tag)) {
        const confirmed=await labTestReplyJournal.confirm(entry.messageId,{visibleTag:true});
        const restored=confirmed?.state==='confirmed'
          ? await recoverConfirmedLabConversation(entry,confirmed.updatedAt)
          : false;
        rememberLabSeen(entry.messageId);
        await saveLabSeenNow();
        if(await rememberConfirmedPendingLabQuote(entry) && (!entry.race||restored)){
          await labPendingInbox.remove(entry.messageId);
        }
        await log('LAB_PENDING_RECONCILED id='+tag);
      }
      // An uncertain Enter is never authorized to be repeated.
      continue;
    }
    // A new response requires fresh verified canonical data. Only post-ACK
    // housekeeping and strict-tag reconciliation may run without backend.
    if (backendState !== 'online') continue;
    const row = {
      id:entry.messageId, text:entry.text, fromMe:false, hasMedia:false,
      quotedId:entry.quotedMessageId, pre:''
    };
    const classification = classifyLocal(entry.text);
    const sender = stableLabSenderKey(entry.messageId);
    if (!sender || sender!==entry.senderId ||
        !labConversationInput(row,classification).eligible ||
        labReadOnlyQueryPurpose(entry.text,classification)!==entry.purpose) {
      await labPendingInbox.remove(entry.messageId);
      await log('LAB_PENDING_REVIEW_REQUIRED id='+tag+' reason=RISK_CHANGED');
      continue;
    }
    // Encrypted identity remains immutable; never inherit newer sender memory.
    const plan=planLabConversation(row,classification,null,entry.race);
    if(plan.scopeConflict){
      await log('LAB_PENDING_REVIEW_REQUIRED id='+tag+' reason=RACE_SCOPE_CHANGED');
      continue;
    }
    const eligibilityArgs={
      ingestUrl:INGEST_URL,token:TOKEN,labGroupId:LAB_GROUP_ID,
      labChannelKey:LAB_CHANNEL_KEY,messageId:entry.messageId,
      senderId:sender,race:entry.race,timeoutMs:Math.min(5000,BACKEND_TIMEOUT_MS)
    };
    const eligibleBefore=await checkLabSendEligibility(eligibilityArgs);
    if(!eligibleBefore.allowed){
      if(eligibleBefore.reason==='LAB_HANDOFF_HELD'){
        rememberLabSeen(entry.messageId);
        await saveLabSeenNow();
        await labPendingInbox.remove(entry.messageId);
      }
      await log('LAB_PENDING_HANDOFF_PRECHECK_'+eligibleBefore.reason+' id='+tag);
      continue;
    }
    if (!labQueryBackoff.allowed(entry.messageId)) continue;
    const canonical = await queryCanonicalLab({
      ingestUrl:INGEST_URL,token:TOKEN,
      labGroupId:LAB_GROUP_ID,labChannelKey:LAB_CHANNEL_KEY,
      messageId:entry.messageId,senderId:entry.senderId,text:entry.text,
      timestamp:entry.messageTimestamp,purpose:entry.purpose,quotedMessageId:entry.quotedMessageId,
      race:entry.race,timeoutMs:Math.min(5000,BACKEND_TIMEOUT_MS)
    });
    // The canonical endpoint may learn about human takeover after the first
    // eligibility check. This is a permanent handoff for the original
    // inbound message, NOT a network error eligible for later replay.
    if(canonical.reason==='LAB_HANDOFF_HELD'){
      rememberLabSeen(entry.messageId);
      await saveLabSeenNow();
      await labPendingInbox.remove(entry.messageId);
      await log('LAB_PENDING_QUERY_HANDED_OFF id='+tag);
      continue;
    }
    if(canonical.reason==='LAB_CANONICAL_REVIEW_REQUIRED'){
      rememberLabSeen(entry.messageId);
      await saveLabSeenNow();
      // The terminal human-review decision is already durable. Cleanup
      // failure must not make this message eligible for automated retry.
      try{await labPendingInbox.remove(entry.messageId);}
      catch{await log('LAB_PENDING_REVIEW_CLEANUP_DEFERRED id='+tag);}
      await log('LAB_PENDING_QUERY_REVIEW_REQUIRED id='+tag);
      continue;
    }
    if (canonical.available!==true) {
      const delay=labQueryBackoff.fail(entry.messageId);
      await log('LAB_PENDING_QUERY_RETRY id='+tag+' reason='+canonical.reason+' retryMs='+delay);
      continue;
    }
    labQueryBackoff.clear(entry.messageId);
    // HTTP can complete after the original WhatsApp message's ten-minute TTL.
    // Recheck the durable encrypted record before starting a new send intent.
    if (!(await labPendingInbox.read(entry.messageId))) {
      await log('LAB_PENDING_EXPIRED_BEFORE_SEND id='+tag);
      continue;
    }
    // The operator may take over while the canonical read is pending.
    const eligibleAfter=await checkLabSendEligibility(eligibilityArgs);
    if(!eligibleAfter.allowed){
      if(eligibleAfter.reason==='LAB_HANDOFF_HELD'){
        rememberLabSeen(entry.messageId);
        await saveLabSeenNow();
        await labPendingInbox.remove(entry.messageId);
      }
      await log('LAB_PENDING_HANDOFF_RECHECK_'+eligibleAfter.reason+' id='+tag);
      continue;
    }
    // A handoff lookup itself may have crossed the original encrypted TTL.
    if(!(await labPendingInbox.read(entry.messageId))){
      await log('LAB_PENDING_EXPIRED_BEFORE_SEND id='+tag);
      continue;
    }
    await labTestReplyJournal.prepare(entry.messageId);
    await labTestReplyJournal.begin(entry.messageId);
    try {
      // WAL is prepared, but an operator takeover before Enter must still win.
      const eligibleToSend=await checkLabSendEligibility(eligibilityArgs);
      if(!eligibleToSend.allowed){
        if(eligibleToSend.reason==='LAB_HANDOFF_HELD'){
          // The fsynced seen marker must precede any retryable WAL state.
          // Crashes between these writes cannot resurrect human-owned work.
          rememberLabSeen(entry.messageId);
          await saveLabSeenNow();
          await labTestReplyJournal.retryPrepared(entry.messageId);
          // At this point the seen marker is fsynced and WAL is prepared.
          // Ciphertext removal is housekeeping; a disk fault must not turn
          // a pre-Enter cancellation into a spurious ambiguous-send transition.
          try{await labPendingInbox.remove(entry.messageId);}
          catch{await log('LAB_PENDING_HANDOFF_CLEANUP_DEFERRED id='+tag);}
        }else{
          await labTestReplyJournal.retryPrepared(entry.messageId);
        }
        await log('LAB_PENDING_HANDOFF_SEND_GATE_'+eligibleToSend.reason+' id='+tag);
        continue;
      }
      if(!(await labPendingInbox.read(entry.messageId))){
        await labTestReplyJournal.retryPrepared(entry.messageId);
        await log('LAB_PENDING_EXPIRED_BEFORE_SEND id='+tag);
        continue;
      }
      await sendTextInCurrentLab(localLabTestReply(row,classification,plan,canonical),tag);
      const confirmed=await labTestReplyJournal.confirm(entry.messageId,{visibleTag:true});
      rememberLabSeen(entry.messageId);
      await saveLabSeenNow();
      // Once an ACK is durable, only its immutable encrypted request can
      // restore context; never extend its TTL with a new "remember" timestamp.
      const restored=confirmed?.state==='confirmed'
        ? await recoverConfirmedLabConversation(entry,confirmed.updatedAt)
        : false;
      const hintSaved=await rememberConfirmedPendingLabQuote(entry);
      // Even after a successful send, a failed auxiliary write must not
      // destroy the only source needed for ACK-only crash recovery.
      if(hintSaved && (!entry.race||restored)){
        await labPendingInbox.remove(entry.messageId);
      }
      await log('LAB_PENDING_RECOVERED id='+tag);
    } catch(error) {
      const current=await labTestReplyJournal.read(entry.messageId);
      if(current?.state==='confirmed') throw error;
      const outcome=labSeenOutcome({error});
      if(outcome==='RETRY')await labTestReplyJournal.retryPrepared(entry.messageId);
      if(outcome==='AMBIGUOUS'){
        await labTestReplyJournal.markAmbiguous(entry.messageId);
        labTestAmbiguousCount++;
      }
      await log('LAB_PENDING_SEND_'+outcome+' id='+tag);
    }
  }
}

let labTestProcessing=false;
async function processLabTestInput() {
  if(labTestProcessing)return;
  labTestProcessing=true;
  try {
  if (!LAB_TEST_INPUT_ENABLED) return;
  const sourceBefore = await currentChatTitle();
  const opened = await openGroup(LAB_GROUP_NAME, true);
  if (!opened || normalize(await currentChatTitle()) !== normalize(LAB_GROUP_NAME)) {
    await log('LAB_TEST_OPEN_FAIL');
    if (sourceTitleMatches(sourceBefore, SOURCE_MATCHES)) await openSourceGroup().catch(() => false);
    return;
  }
  try { await assertCurrentLabIdentity(); }
  catch {
    await log('LAB_TEST_IDENTITY_FAIL');
    await openSourceGroup().catch(() => false);
    return;
  }

  const rows = await extractVisibleMessages().catch(() => []);
  const visible = labBootstrapCompleted ? rows : rows.slice(-LAB_TEST_BOOTSTRAP_LIMIT);
  let processed = 0;

  for (const row of visible) {
    if (!row?.id || labSeen.has(row.id)) continue;
    const body = String(row.text || '').trim();
    if (row.fromMe || !body || body.includes('[SHADOW:') || body.includes('[LABTEST:') || body.includes('🧪 CONTROL HÍPICO · SHADOW')) {
      rememberLabSeen(row.id); // intentionally ignored, never a pending response
      continue;
    }

    const tag = labTestTagFor(row.id);
    // A confirmed ack survives restart even if the legacy seen-file did not.
    const journalRecord = await labTestReplyJournal.read(row.id);
    if (journalRecord?.state === 'confirmed') {
      // Never grant quote/memory authority to mutable DOM text after an ACK.
      const encryptedOriginal=await labPendingInbox?.read(row.id);
      const restored=encryptedOriginal
        ? await recoverConfirmedLabConversation(encryptedOriginal,journalRecord.updatedAt)
        : false;
      rememberLabSeen(row.id);
      await saveLabSeenNow();
      await finalizeConfirmedVisibleLabQuote(row,body,{
        retainEncryptedInput:Boolean(encryptedOriginal?.race)&&!restored
      }); // HMAC hint only from encrypted input
      continue;
    }
    if (journalRecord?.state === 'ambiguous' || journalRecord?.state === 'sending') {
      // Never retry an uncertain Enter. Only an outbound tagged message is proof.
      await assertCurrentLabIdentity();
      if (await visibleLabHasTag(tag)) {
        const confirmed=await labTestReplyJournal.confirm(row.id,{visibleTag:true});
        const encryptedOriginal=await labPendingInbox?.read(row.id);
        const restored=encryptedOriginal && confirmed?.state==='confirmed'
          ? await recoverConfirmedLabConversation(encryptedOriginal,confirmed.updatedAt)
          : false;
        rememberLabSeen(row.id);
        await saveLabSeenNow();
        await finalizeConfirmedVisibleLabQuote(row,body,{
          retainEncryptedInput:Boolean(encryptedOriginal?.race)&&!restored
        });
        await log('LAB_TEST_REPLY_RECONCILED id='+tag);
      }
      continue;
    }

    const classification = classifyLocal(body);
    // The stable sender key is checked before any bounded conversation hints.
    const sender = stableLabSenderKey(row.id);
    const prior = sender ? labConversationContext?.get(sender) : null;
    if (!labConversationInput(row, classification, prior).eligible) {
      rememberLabSeen(row.id); // ignored echo/media/casual chat; never respond
      continue;
    }
    const inquiryPurpose=labReadOnlyQueryPurpose(body,classification);
    const directRace=explicitLabRaceScope(body);
    const visibleQuotedRace=resolveQuotedLabRaceScope(row,visible);
    const durableQuotedRace=!directRace&&!visibleQuotedRace&&row.quotedId&&sender
      ? labQuotedRaceJournal?.lookup({
          quotedMessageId:row.quotedId,senderId:sender,currentMessageId:row.id
        })
      : null;
    // Durable quotes are same-sender confirmed hints, never facts. An
    // explicit mismatch or multiple races blocks domain reads.
    const scopedRace=directRace||visibleQuotedRace||durableQuotedRace||null;
    const plan=planLabConversation(row, classification, prior, scopedRace);
    const verifiedRace=plan.scopeConflict?null:(scopedRace||plan.raceScope);
    const quotedVerified=Boolean(row.quotedId && !directRace && (visibleQuotedRace||durableQuotedRace));
    // Persist immutable, pinned LAB question and verified sender before backend calls.
    const parsedLabStamp=inquiryPurpose && BACKEND_SYNC_ENABLED ? parseWhatsAppPre(row.pre) : null;
    // Context recalled from a previous message is only a conversational
    // hint. An autonomous replay must never persist that implicit race as
    // though it were explicitly scoped in this original inbound message.
    // Only an explicit original race or a verified same-sender quote can
    // be bound to the encrypted inbox and the canonical HTTP lookup.
    let trustedRace=plan.scopeConflict?null:
      (directRace||(quotedVerified?verifiedRace:null));
    let trustedQuote=quotedVerified?row.quotedId:null;
    if(inquiryPurpose && BACKEND_SYNC_ENABLED){
      if(!sender || !parsedLabStamp?.parsed || !Number.isFinite(Date.parse(parsedLabStamp.timestamp)) ||
         Date.now()-Date.parse(parsedLabStamp.timestamp)>=10*60*1000 ||
         Date.parse(parsedLabStamp.timestamp)>Date.now()+60000 || plan.scopeConflict){
        rememberLabSeen(row.id);
        await saveLabSeenNow();
        await log('LAB_PENDING_IDENTITY_SCOPE_OR_TIME_INVALID id='+tag);
        continue;
      }
      if(labPendingInbox){
        const saved=await labPendingInbox.read(row.id);
        if(saved){
          const verified=reconcileLabPendingObservation(saved,{
            messageId:row.id,senderId:sender,text:body,purpose:inquiryPurpose,
            // An explicit self-contained race never binds to the attached
            // WhatsApp reply. Keep strict quote equality only for a query
            // whose scope was actually obtained from that verified quote.
            messageTimestamp:parsedLabStamp.timestamp,
            quotedMessageId:directRace?null:(row.quotedId||null),
            explicitRace:directRace
          });
          if(!verified.valid){
            await log('LAB_PENDING_REVIEW_REQUIRED id='+tag+' reason='+verified.reason);
            continue;
          }
          trustedRace=verified.race;
          trustedQuote=verified.quotedMessageId;
        }else{
          await labPendingInbox.enqueue({
            messageId:row.id,senderId:sender,text:body,purpose:inquiryPurpose,
            messageTimestamp:parsedLabStamp.timestamp,race:trustedRace||null,
            quotedMessageId:trustedQuote
          });
        }
      }
      if(!labQueryBackoff.allowed(row.id))continue;
    }
    const eligibilityArgs={
      ingestUrl:INGEST_URL,token:TOKEN,labGroupId:LAB_GROUP_ID,
      labChannelKey:LAB_CHANNEL_KEY,messageId:row.id,senderId:sender,
      race:trustedRace,timeoutMs:Math.min(5000,BACKEND_TIMEOUT_MS)
    };
    // Fail closed: a missing backend/identity/handoff table must never
    // silently turn a human-owned chat into an autonomous LAB send.
    const eligibleBefore=sender && BACKEND_SYNC_ENABLED && backendState === 'online'
      ? await checkLabSendEligibility(eligibilityArgs)
      : {allowed:false,reason:'LAB_HANDOFF_UNAVAILABLE'};
    if(!eligibleBefore.allowed){
      if(eligibleBefore.reason==='LAB_HANDOFF_HELD'){
        rememberLabSeen(row.id); // avoid delayed bot reply after operator resumes
        await saveLabSeenNow();
        // Drop durable work too: it must not be replayed after human handoff ends.
        await labPendingInbox?.remove(row.id);
      }
      await log('LAB_HANDOFF_PRECHECK_'+eligibleBefore.reason+' id='+tag);
      continue; // never prepare a send journal for a human-owned conversation
    }
    const canonical = inquiryPurpose && sender && !plan.scopeConflict && BACKEND_SYNC_ENABLED && backendState === 'online'
      ? await queryCanonicalLab({
          ingestUrl:INGEST_URL,token:TOKEN,
          labGroupId:LAB_GROUP_ID,labChannelKey:LAB_CHANNEL_KEY,
          messageId:row.id,senderId:sender,text:body,
          timestamp:parsedLabStamp?.timestamp,purpose:inquiryPurpose,
          quotedMessageId:trustedQuote,
          race:trustedRace,timeoutMs:Math.min(5000,BACKEND_TIMEOUT_MS)
        })
      : {available:false,reason:'LAB_CANONICAL_NOT_QUERIED'};
    if(canonical.reason==='LAB_HANDOFF_HELD'){
      rememberLabSeen(row.id);
      await saveLabSeenNow();
      await labPendingInbox?.remove(row.id);
      await log('LAB_HANDOFF_QUERY_HELD id='+tag);
      continue;
    }
    if(canonical.reason==='LAB_CANONICAL_REVIEW_REQUIRED'){
      rememberLabSeen(row.id);
      await saveLabSeenNow();
      // Preserve the fsynced review veto despite ciphertext cleanup faults;
      // cleanup is secondary and never grants permission for LAB Enter.
      try{await labPendingInbox?.remove(row.id);}
      catch{await log('LAB_REVIEW_CLEANUP_DEFERRED id='+tag);}
      await log('LAB_CANONICAL_REVIEW_REQUIRED id='+tag);
      continue;
    }
    if(inquiryPurpose && canonical.available!==true){
      const delay=labQueryBackoff.fail(row.id);
      await log('LAB_CANONICAL_QUERY_PENDING id='+tag+' reason='+canonical.reason+' retryMs='+delay);
      continue; // No send intent while canonical truth is unknown.
    }
    if(inquiryPurpose)labQueryBackoff.clear(row.id);
    // A slower canonical query may overlap operator takeover: recheck the
    // current ownership immediately before creating a durable send intent.
    const eligibleAfter=await checkLabSendEligibility(eligibilityArgs);
    if(!eligibleAfter.allowed){
      if(eligibleAfter.reason==='LAB_HANDOFF_HELD'){
        rememberLabSeen(row.id);
        await saveLabSeenNow();
        await labPendingInbox?.remove(row.id);
      }
      await log('LAB_HANDOFF_RECHECK_'+eligibleAfter.reason+' id='+tag);
      continue;
    }
    // The canonical response and handoff checks may outlive a LAB message.
    if(inquiryPurpose && BACKEND_SYNC_ENABLED && labPendingInbox &&
       !(await labPendingInbox.read(row.id))){
      await log('LAB_PENDING_EXPIRED_BEFORE_SEND id='+tag);
      continue;
    }
    await labTestReplyJournal.prepare(row.id); // fsync before any browser send
    await labTestReplyJournal.begin(row.id); // durable sending intent
    try {
      // The operator may take over while the WAL is being prepared. Before
      // touching the composer, revalidate on the same pinned backend/sender/
      // race scope. On deny, NO keyboard/Enter has been attempted, so safely
      // return the WAL to prepared rather than creating an ambiguous receipt.
      const eligibleToSend=await checkLabSendEligibility(eligibilityArgs);
      if(!eligibleToSend.allowed){
        if(eligibleToSend.reason==='LAB_HANDOFF_HELD'){
          // The operator's terminal decision must be durable BEFORE the WAL
          // can return from sending to retryable prepared. A crash sooner
          // leaves an ambiguous delivery, never an unauthorized new Enter.
          rememberLabSeen(row.id);
          await saveLabSeenNow();
          await labTestReplyJournal.retryPrepared(row.id);
          try{await labPendingInbox?.remove(row.id);}
          catch{await log('LAB_HANDOFF_CLEANUP_DEFERRED id='+tag);}
        }else{
          await labTestReplyJournal.retryPrepared(row.id);
        }
        await log('LAB_HANDOFF_SEND_GATE_'+eligibleToSend.reason+' id='+tag);
        continue;
      }
      if(inquiryPurpose && BACKEND_SYNC_ENABLED && labPendingInbox &&
         !(await labPendingInbox.read(row.id))){
        await labTestReplyJournal.retryPrepared(row.id);
        await log('LAB_PENDING_EXPIRED_BEFORE_SEND id='+tag);
        continue;
      }
      await sendTextInCurrentLab(localLabTestReply(row, classification, plan, canonical), tag);
      await labTestReplyJournal.confirm(row.id,{visibleTag:true});
      rememberLabSeen(row.id); // confirmed delivery/tag; never ack before sending
      await saveLabSeenNow();
      // Quoted-race hints have already been finalized from the encrypted
      // original request. Never write a second hint from the mutable DOM.
      // The WAL-backed confirmed acknowledgement is the single send authority.
      // Context is only a local hint; failed persistence can never resend LAB.
      let contextPersisted=!plan.rememberRace;
      if(plan.rememberRace && labConversationContext){
        try{
          // A non-throwing false is a rejected durable write, not success.
          contextPersisted=(await labConversationContext.remember(
            plan.sender,plan.raceNumber,plan.raceScope,
            {raceTrack:plan.raceTrack,raceDate:plan.raceDate}
          ))===true;
        }catch{
          contextPersisted=false;
          await log('LAB_CONTEXT_PERSIST_FAILED');
        }
      }
      // No second Enter may follow a durable ACK. Retain the original
      // encrypted request if the auxiliary conversation write was declined.
      await finalizeConfirmedVisibleLabQuote(row,body,{retainEncryptedInput:!contextPersisted});
      processed += 1;
      await log('LAB_TEST_READ id='+tag+' intent='+classification.intent);
    } catch (error) {
      const state=await labTestReplyJournal.read(row.id);
      // A confirmed journal always wins if the auxiliary seen file failed.
      if (state?.state === 'confirmed') throw error;
      const outcome = labSeenOutcome({error});
      if (outcome === 'RETRY') {
        await labTestReplyJournal.retryPrepared(row.id);
      }
      if (outcome === 'AMBIGUOUS') {
        await labTestReplyJournal.markAmbiguous(row.id);
        labTestAmbiguousCount += 1;
      }
      await log('LAB_TEST_REPLY_'+outcome+' id='+tag);
    }
  }

  await resumePendingLabQueries(new Set(visible.map(row=>row?.id).filter(Boolean)),labSeen);
  labBootstrapCompleted = true;
  await saveLabSeenNow();
  if (processed) console.log('LAB prueba: '+processed+' mensaje(s) leído(s) y clasificado(s).');
  await openSourceGroup().catch(() => false);
  activeSourceTitle = await currentChatTitle();
  } finally {labTestProcessing=false;}
}
async function visibleLabHasTag(tag) {
  // A matching substring in a quote or unrelated outgoing message is NOT
  // evidence. Scope must still be the exact pinned LAB group before and
  // after collecting bounded outgoing DOM text.
  await assertCurrentLabIdentity();
  const outgoingTexts = await page.evaluate(() => {
    const main=document.querySelector('#main');
    if(!main)return[];
    return Array.from(main.querySelectorAll('.message-out')).slice(-100)
      .map(node=>String(node.innerText||node.textContent||'').slice(0,4201));
  }).catch(() => []);
  await assertCurrentLabIdentity();
  return outgoingTexts.some(text=>labOutgoingEvidenceMatches(text,tag));
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
  const sourceReplies = await sourceReplyJournal.snapshot();
  const eventSpool = spool.pendingBackend;
  const mirrorSpool = spool.pendingLab;
  const deadLetters = spool.quarantined;
  const pendingStatus = labPendingInbox ? await labPendingInbox.snapshot() : null;
  const pendingQueries = pendingStatus?.pending ?? 0;
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
  const line = `HEALTH ready=${readiness.ready} mode=${RUNTIME_MODE} source=${activeSourceTitle || 'buscando'} | backend=${backendLabel}${cooldown && BACKEND_SYNC_ENABLED ? ` cooldown=${Math.ceil(cooldown/1000)}s` : ''} | capturados=${capturedCount} | spool=${eventSpool} | sourceReply=${sourceReplies.pending}/${sourceReplies.ambiguous} | labPend=${mirrorSpool} | labQueries=${pendingQueries} | labNearExpiry=${pendingStatus?.nearingExpiry ?? 0} | labOldestSec=${pendingStatus?.oldestAgeSeconds ?? 0} | dead=${deadLetters}`;
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
      if(labPendingInbox && Date.now()-lastLabPendingPruneAt>=60000){
        lastLabPendingPruneAt=Date.now();
        const expired=await labPendingInbox.prune();
        if(expired>0)await log('LAB_PENDING_EXPIRED count='+expired);
      }
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
        console.log(`FUENTE: ${SOURCE_AUTO_REPLY_ACTIVE ? 'RESPUESTA AUTÓNOMA SEGURA HABILITADA' : 'SOLO LECTURA'}. Dominio/dinero/estado siguen sin autoridad de escritura.`);
        console.log(`LAB: ${LAB_GROUP_NAME} (${LAB_SEND_ENABLED ? 'shadow habilitado con ID pinneado' : 'shadow deshabilitado'})`);
        console.log('Dinero/ledger/estado real: BLOQUEADOS.\n');
        await log(`SOURCE_ACTIVE title=${activeSourceTitle} key=${SOURCE_CHANNEL_KEY} sourceBound=${Boolean(SOURCE_GROUP_ID)} autoReply=${SOURCE_AUTO_REPLY_ACTIVE} labBound=${Boolean(LAB_GROUP_ID)} labSend=${LAB_SEND_ENABLED}`);
        lastStatus = 'monitoring';
      }
      await assertCurrentSourceIdentity();
      if (!sourceBaselineCompleted) await baselineSourceMessages();
      else await processSourceRows();

      await flushEventSpool();
      await flushSourceReplies();
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
  console.log(` FUENTE REAL ${SOURCE_AUTO_REPLY_ACTIVE ? 'SAFE AUTO-REPLY' : 'READ-ONLY'} -> BACKEND + JOURNAL DURABLE`);
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
  console.log(`Respuesta al grupo fuente: ${SOURCE_AUTO_REPLY_ACTIVE ? 'HABILITADA SOLO PARA COMANDOS AUTORIZADOS POR BACKEND' : 'DESHABILITADA'}.`);
  console.log(`Seen IDs cargados: ${seen.size}`);
  console.log(`Modo runtime: ${RUNTIME_MODE}`);
  console.log(`Backend cloud: ${BACKEND_SYNC_ENABLED ? 'HABILITADO CON SPOOL V2 DURABLE' : 'DESACTIVADO - SHADOW LOCAL'}`);
  console.log(`Datos locales: ${DATA_DIR}\n`);

  const spoolInit = await spoolRuntime.initialize();
  const sourceReplyInit = await sourceReplyJournal.initialize();
  await labConversationContext?.initialize();
  await labQuotedRaceJournal?.initialize();
  if (labPendingInbox) {
    const restored = await labPendingInbox.initialize();
    await log('LAB_PENDING_INBOX_READY count='+restored.recovered);
  }
  if (labTestReplyJournal) {
    const labInit=await labTestReplyJournal.initialize();
    const labState=await labTestReplyJournal.snapshot();
    labTestAmbiguousCount=labState.ambiguous;
    if(labInit.recovered) {
      await log(`LAB_TEST_RECOVERED_AMBIGUOUS count=${labInit.recovered}`);
      console.log(`LAB: ${labInit.recovered} envío(s) interrumpido(s) requieren conciliación; no se reenviarán automáticamente.`);
    }
  }
  if (sourceReplyInit.recovered) {
    console.log(`Source reply: ${sourceReplyInit.recovered} entrega(s) in-flight quedaron ambiguas; no se reenviarán automáticamente.`);
    await log(`SOURCE_REPLY_RECOVERED_AMBIGUOUS count=${sourceReplyInit.recovered}`);
  }
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
  try { await labPendingInbox?.close(); } catch {}
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
