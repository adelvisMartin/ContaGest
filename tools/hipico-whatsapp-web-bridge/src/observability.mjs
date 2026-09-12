import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const SECRET_KEYS = /token|secret|cookie|authorization|qr|session|password|signed.?url|service.?role|api.?key/i;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const JID = /\d{5,}-\d+@g\.us/gi;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SIGNED_URL = /https?:\/\/\S+[?&](?:token|signature|sig|key|expires)=[^\s&]+\S*/gi;
const DEFAULT_ALLOWLIST = ['health.json', 'retry-state.json', 'dom-diagnostic.json'];

export function correlationId(prefix = 'hipico') {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function redactDiagnostic(value, key = '') {
  if (SECRET_KEYS.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redactDiagnostic(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDiagnostic(v, k)]));
  }
  if (typeof value === 'string') {
    return value
      .replace(BEARER, 'Bearer [REDACTED]')
      .replace(SIGNED_URL, '[SIGNED_URL_REDACTED]')
      .replace(JID, '[GROUP_ID]')
      .replace(PHONE, '[PHONE]');
  }
  return value;
}

export function structuredLog({
  level = 'info',
  component = 'bridge',
  version = 'unknown',
  sha = 'unknown',
  correlationId: cid,
  event,
  message,
  data = {}
}) {
  return JSON.stringify(redactDiagnostic({
    ts: new Date().toISOString(),
    level,
    component,
    version,
    sha,
    correlationId: cid || correlationId(),
    event: event || null,
    message: message || null,
    data
  }));
}

export function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function classifyHealth(health, { now = Date.now(), maxAgeMs = 120000, backlogWarnAgeMs = 5 * 60 * 1000 } = {}) {
  const stamp = Date.parse(String(health?.timestamp || ''));
  const ageMs = Number.isFinite(stamp) ? Math.max(0, now - stamp) : Number.POSITIVE_INFINITY;
  const readinessReady = health?.readiness?.ready === true;
  const sourceOk = Boolean(health?.activeSourceTitle || health?.source?.state === 'ready');
  const labRequired = health?.labSendEnabled === true;
  const labOk = !labRequired || Boolean(health?.lab?.state === 'ready' || health?.groupBinding?.labBound === true);
  const backendOk = ['online', 'local-only'].includes(health?.backend?.state);
  const browserOk = !['missing', 'failed', 'crashed', 'expired'].includes(health?.browser?.state);
  const backlogAgeMs = Number(health?.spool?.oldestQueuedAgeMs ?? health?.metrics?.backlogAgeMs ?? 0);
  const backlogWarning = Number.isFinite(backlogAgeMs) && backlogAgeMs >= backlogWarnAgeMs;

  let state = 'live';
  const reasons = [];
  if (!Number.isFinite(stamp) || ageMs > maxAgeMs) {
    state = 'down';
    reasons.push('HEALTH_STALE');
  }
  if (health?.sourceSendPossible !== false) {
    state = 'down';
    reasons.push('SOURCE_SEND_GUARD_INVALID');
  }
  if (!readinessReady || !sourceOk || !labOk || !backendOk || !browserOk) {
    if (state !== 'down') state = 'degraded';
    if (!readinessReady) reasons.push('READINESS_FALSE');
    if (!sourceOk) reasons.push('SOURCE_UNAVAILABLE');
    if (!labOk) reasons.push('LAB_UNAVAILABLE');
    if (!backendOk) reasons.push('BACKEND_UNAVAILABLE');
    if (!browserOk) reasons.push('BROWSER_UNAVAILABLE');
  }
  if (backlogWarning) {
    if (state === 'live') state = 'degraded';
    reasons.push('BACKLOG_OLD');
  }

  return {
    state,
    live: state !== 'down',
    ready: state === 'live' && readinessReady,
    degraded: state === 'degraded',
    ageMs,
    backlogAgeMs,
    reasons: [...new Set(reasons)]
  };
}

export function deriveOperationalMetrics(health = {}) {
  const counters = health.counters || {};
  const captured = Number(counters.captured || 0);
  const parsed = Number(counters.parsed ?? counters.captured ?? 0);
  const ambiguous = Number(counters.ambiguous || 0);
  const labSent = Number(counters.mirrored ?? counters.labSent ?? 0);
  const pending = Number(counters.eventSpool || 0) + Number(counters.mirrorSpool || 0);
  const failed = Number(counters.deadLetters || 0);
  const parseRate = captured > 0 ? parsed / captured : 1;
  return {
    captured,
    parsed,
    ambiguous,
    labSent,
    pending,
    failed,
    parseRate,
    latencyMs: Number(health?.metrics?.latencyMs || 0),
    backlogAgeMs: Number(health?.spool?.oldestQueuedAgeMs ?? health?.metrics?.backlogAgeMs ?? 0)
  };
}

export async function rotateFileIfNeeded(file, { maxBytes = 2 * 1024 * 1024, keep = 5 } = {}) {
  const safeKeep = Math.max(1, Math.min(20, Number(keep) || 5));
  let stat;
  try { stat = await fs.stat(file); } catch (error) {
    if (error?.code === 'ENOENT') return { rotated: false, reason: 'missing' };
    throw error;
  }
  if (stat.size <= maxBytes) return { rotated: false, size: stat.size };

  for (let index = safeKeep - 1; index >= 1; index -= 1) {
    const source = `${file}.${index}`;
    const target = `${file}.${index + 1}`;
    await fs.rename(source, target).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
  await fs.rename(file, `${file}.1`);
  return { rotated: true, size: stat.size, target: `${file}.1` };
}

async function oldestJsonAgeMs(dir, now = Date.now()) {
  try {
    const names = (await fs.readdir(dir)).filter((name) => name.endsWith('.json'));
    let oldest = null;
    for (const name of names) {
      const stat = await fs.stat(path.join(dir, name)).catch(() => null);
      if (!stat) continue;
      const age = Math.max(0, now - stat.mtimeMs);
      oldest = oldest == null ? age : Math.max(oldest, age);
    }
    return oldest || 0;
  } catch {
    return 0;
  }
}

export async function inspectSpoolHealth({ eventDir, mirrorDir, deadLetterDir, warnAgeMs = 5 * 60 * 1000, now = Date.now() }) {
  const count = async (dir) => {
    try { return (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).length; } catch { return 0; }
  };
  const [eventQueued, mirrorQueued, deadLetters, eventAge, mirrorAge] = await Promise.all([
    count(eventDir), count(mirrorDir), count(deadLetterDir), oldestJsonAgeMs(eventDir, now), oldestJsonAgeMs(mirrorDir, now)
  ]);
  const oldestQueuedAgeMs = Math.max(eventAge, mirrorAge);
  return {
    eventQueued,
    mirrorQueued,
    deadLetters,
    oldestQueuedAgeMs,
    warning: oldestQueuedAgeMs >= warnAgeMs || deadLetters > 0
  };
}

export async function buildSupportBundle({
  dataDir,
  outDir,
  version = 'unknown',
  sha = 'unknown',
  includeLogTail = true,
  maxLogBytes = 65536,
  allowlist = DEFAULT_ALLOWLIST
}) {
  await fs.mkdir(outDir, { recursive: true });
  const files = [];

  for (const name of allowlist) {
    if (!DEFAULT_ALLOWLIST.includes(name)) throw new Error(`SUPPORT_FILE_NOT_ALLOWLISTED:${name}`);
    try {
      const raw = await fs.readFile(path.join(dataDir, name), 'utf8');
      const parsed = JSON.parse(raw);
      const safe = JSON.stringify(redactDiagnostic(parsed), null, 2);
      const target = path.join(outDir, name);
      await fs.writeFile(target, safe, { encoding: 'utf8', flag: 'wx' });
      files.push({ name, bytes: Buffer.byteLength(safe), sha256: sha256Text(safe) });
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      if (error?.code === 'EEXIST') throw new Error(`SUPPORT_TARGET_EXISTS:${name}`);
      throw error;
    }
  }

  if (includeLogTail) {
    try {
      const raw = await fs.readFile(path.join(dataDir, 'bridge.log'), 'utf8');
      const tail = raw.slice(-Math.max(1024, maxLogBytes));
      const safe = String(redactDiagnostic(tail));
      const name = 'bridge-tail.log';
      await fs.writeFile(path.join(outDir, name), safe, { encoding: 'utf8', flag: 'wx' });
      files.push({ name, bytes: Buffer.byteLength(safe), sha256: sha256Text(safe) });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  const manifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    component: 'hipico-whatsapp-web-bridge',
    version,
    sha,
    redactionPolicy: 'central-v1',
    allowlist: [...DEFAULT_ALLOWLIST, 'bridge-tail.log'],
    files
  };
  const text = JSON.stringify(manifest, null, 2);
  await fs.writeFile(path.join(outDir, 'manifest.json'), text, { encoding: 'utf8', flag: 'wx' });
  return { ...manifest, manifestSha256: sha256Text(text) };
}
