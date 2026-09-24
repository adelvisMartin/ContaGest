import path from 'node:path';
import { normalize, splitGroupMatches } from './runtime-utils.mjs';
import { normalizeGroupId } from './group-identity.mjs';

// The linked-device bridge persists WhatsApp content locally. Keep every file
// it creates private by default on POSIX; Windows safely ignores POSIX modes.
try { process.umask(0o077); } catch {}

export const VERSION = '1.5.0';
export const RUNTIME_MODES = Object.freeze({
  PRODUCTION: 'production',
  SHADOW_LOCAL: 'shadow-local'
});
const CHANNEL_KEY_RE=/^[A-Za-z0-9_-]{3,120}$/;
const PUBLIC_SECRET_PLACEHOLDER_PATTERN=/(?:REEMPLAZA|REPLACE|CHANGE[_-]?ME|CHANGEME|PLACEHOLDER|YOUR[_-]?(?:SECRET|TOKEN|KEY)|TU[_-]?(?:SECRETO|TOKEN|CLAVE)|EXAMPLE[_-]?(?:SECRET|TOKEN|KEY))/i;

export function repairUtf8Mojibake(value) {
  const raw = String(value ?? '').trim();
  if (!/[ÃÂ]/.test(raw)) return raw;
  const repaired = Buffer.from(raw, 'latin1').toString('utf8');
  return repaired.includes('\uFFFD') ? raw : repaired;
}

function envText(env, name, fallback = '') {
  const value = repairUtf8Mojibake(env[name]);
  return value || fallback;
}

function boolEnv(env, name, fallback = false) {
  const value = env[name];
  if (value == null || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function numberEnv(env, name, fallback, min, max) {
  const value = Number(env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function defaultDataDir(env, cwd) {
  return path.resolve(String(
    env.HIPICO_DATA_DIR ||
    (env.LOCALAPPDATA
      ? path.join(env.LOCALAPPDATA, 'ControlHipicoBridge', 'data')
      : path.join(cwd, 'data'))
  ));
}

export function isWhatsAppGroupId(value) {
  return Boolean(normalizeGroupId(value));
}

export function strongBridgeTokenConfigured(value) {
  const token=String(value||'').trim();
  return Buffer.byteLength(token,'utf8')>=32&&!PUBLIC_SECRET_PLACEHOLDER_PATTERN.test(token);
}

export function loadRuntimeConfig(env = process.env, cwd = process.cwd()) {
  const runtimeMode = envText(env, 'HIPICO_RUNTIME_MODE', RUNTIME_MODES.PRODUCTION).toLowerCase();
  const backendSyncEnabled = boolEnv(env, 'HIPICO_BACKEND_SYNC_ENABLED', runtimeMode === RUNTIME_MODES.PRODUCTION);
  const ingestUrl = envText(env, 'HIPICO_INGEST_URL', '');
  const healthUrl = envText(
    env,
    'HIPICO_BRIDGE_HEALTH_URL',
    ingestUrl ? ingestUrl.replace(/\/events(?:\?.*)?$/, '/health') : ''
  );
  const sourceMatches = splitGroupMatches(
    envText(env, 'HIPICO_SOURCE_GROUP_MATCHES', envText(env, 'HIPICO_SOURCE_GROUP_MATCH', 'CLUB HIPICO TRIPLE COWN|CLUB HIPICO TRIPLE CROWN'))
  ).map(repairUtf8Mojibake);

  return Object.freeze({
    version: VERSION,
    runtimeMode,
    dataDir: defaultDataDir(env, cwd),
    backendSyncEnabled,
    ingestUrl,
    healthUrl,
    token: envText(env, 'HIPICO_GROUP_BRIDGE_TOKEN', ''),
    sourceMatches,
    sourceGroupId: envText(env, 'HIPICO_SOURCE_GROUP_ID', '').toLowerCase(),
    sourceChannelKey: envText(env, 'HIPICO_SOURCE_CHANNEL_KEY', 'club-hipico-triple-crown-official'),
    labGroupName: envText(env, 'HIPICO_LAB_GROUP_NAME', 'Control hípico lab'),
    labGroupId: envText(env, 'HIPICO_LAB_GROUP_ID', '').toLowerCase(),
    labChannelKey: envText(env, 'HIPICO_LAB_CHANNEL_KEY', 'control-hipico-lab'),
    labSendEnabled: boolEnv(env, 'HIPICO_LAB_SEND_ENABLED', false),
    sourceAutoReplyEnabled: boolEnv(env, 'HIPICO_SOURCE_AUTO_REPLY_ENABLED', false),
    requirePinnedGroupIds: boolEnv(env, 'HIPICO_REQUIRE_PINNED_GROUP_IDS', true),
    pollMs: numberEnv(env, 'HIPICO_POLL_MS', 1000, 500, 5000),
    backendTimeoutMs: numberEnv(env, 'HIPICO_BACKEND_TIMEOUT_MS', 15000, 5000, 60000),
    backendMaxRps: numberEnv(env, 'HIPICO_BACKEND_MAX_RPS', 4, 1, 20),
    backendMaxPerFlush: numberEnv(env, 'HIPICO_BACKEND_MAX_PER_FLUSH', 20, 1, 100),
    backoffBaseMs: numberEnv(env, 'HIPICO_BACKEND_BASE_BACKOFF_MS', 5000, 1000, 60000),
    backoffMaxMs: numberEnv(env, 'HIPICO_BACKEND_MAX_BACKOFF_MS', 900000, 30000, 3600000),
    trainingJournalEnabled: boolEnv(env, 'HIPICO_TRAINING_JOURNAL_ENABLED', true),
    diagnosticScreenshotsEnabled: boolEnv(env, 'HIPICO_DIAGNOSTIC_SCREENSHOTS_ENABLED', false),
    baselineIgnoreHistory: boolEnv(env, 'HIPICO_SOURCE_BASELINE_IGNORE_HISTORY', true),
    labTestInputEnabled: boolEnv(env, 'HIPICO_LAB_TEST_INPUT_ENABLED', false),
    labTestPollMs: numberEnv(env, 'HIPICO_LAB_TEST_POLL_MS', 5000, 2000, 30000),
    labTestBootstrapLimit: numberEnv(env, 'HIPICO_LAB_TEST_BOOTSTRAP_LIMIT', 8, 1, 30)
  });
}

function isSafeHttps(value) {
  try {
    const url=new URL(value);
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash;
  } catch { return false; }
}

export function validateRuntimeConfig(config) {
  const errors = [];
  if (!Object.values(RUNTIME_MODES).includes(config.runtimeMode)) errors.push('HIPICO_RUNTIME_MODE debe ser production o shadow-local.');
  if (!config.sourceMatches.length) errors.push('No hay aliases de grupo fuente configurados.');
  if (config.sourceMatches.some((item) => normalize(item) === normalize(config.labGroupName))) {
    errors.push('El grupo fuente y el laboratorio deben ser distintos.');
  }
  if (config.sourceGroupId && !isWhatsAppGroupId(config.sourceGroupId)) errors.push('HIPICO_SOURCE_GROUP_ID no tiene formato @g.us válido.');
  if (config.labGroupId && !isWhatsAppGroupId(config.labGroupId)) errors.push('HIPICO_LAB_GROUP_ID no tiene formato @g.us válido.');
  if (config.sourceGroupId && config.labGroupId && config.sourceGroupId === config.labGroupId) {
    errors.push('El ID del grupo fuente y el ID del LAB deben ser distintos.');
  }
  if (!CHANNEL_KEY_RE.test(config.sourceChannelKey)) errors.push('HIPICO_SOURCE_CHANNEL_KEY no es válido.');
  if (!CHANNEL_KEY_RE.test(config.labChannelKey)) errors.push('HIPICO_LAB_CHANNEL_KEY no es válido.');
  if (config.sourceChannelKey === config.labChannelKey) errors.push('SOURCE y LAB deben usar channel keys distintos.');
  if (config.sourceAutoReplyEnabled && config.runtimeMode !== RUNTIME_MODES.PRODUCTION) errors.push('HIPICO_SOURCE_AUTO_REPLY_ENABLED solo se admite en production.');
  if (config.sourceAutoReplyEnabled && !config.backendSyncEnabled) errors.push('Auto reply SOURCE exige backend sync autoritativo.');
  if (config.sourceAutoReplyEnabled && !isWhatsAppGroupId(config.sourceGroupId)) errors.push('Auto reply SOURCE exige HIPICO_SOURCE_GROUP_ID pinneado.');
  if ((config.labSendEnabled || config.labTestInputEnabled) && config.requirePinnedGroupIds) {
    if (!isWhatsAppGroupId(config.sourceGroupId)) errors.push('Para habilitar LAB se exige HIPICO_SOURCE_GROUP_ID pinneado.');
    if (!isWhatsAppGroupId(config.labGroupId)) errors.push('Para habilitar LAB se exige HIPICO_LAB_GROUP_ID pinneado.');
  }
  if (config.runtimeMode === RUNTIME_MODES.PRODUCTION) {
    if (!config.backendSyncEnabled) errors.push('Producción exige HIPICO_BACKEND_SYNC_ENABLED=true.');
    if (!isSafeHttps(config.ingestUrl)) errors.push('Producción exige HIPICO_INGEST_URL HTTPS sin credenciales, query ni fragment.');
    if (!isSafeHttps(config.healthUrl)) errors.push('Producción exige HIPICO_BRIDGE_HEALTH_URL HTTPS sin credenciales, query ni fragment.');
    if (!strongBridgeTokenConfigured(config.token)) errors.push('Producción exige HIPICO_GROUP_BRIDGE_TOKEN secreto, no-placeholder y de al menos 32 bytes.');
    if (!config.trainingJournalEnabled) errors.push('Producción exige journal shadow para auditoría y evaluación.');
    if (!config.requirePinnedGroupIds) errors.push('Producción exige HIPICO_REQUIRE_PINNED_GROUP_IDS=true.');
    if (!isWhatsAppGroupId(config.sourceGroupId)) errors.push('Producción exige HIPICO_SOURCE_GROUP_ID pinneado.');
    if (!isWhatsAppGroupId(config.labGroupId)) errors.push('Producción exige HIPICO_LAB_GROUP_ID pinneado.');
  }
  return errors;
}

export function assertRuntimeConfig(config) {
  const errors = validateRuntimeConfig(config);
  if (errors.length) throw new Error(`Configuración inválida:\n- ${errors.join('\n- ')}`);
  return config;
}
