import fs from 'node:fs/promises';
import path from 'node:path';

function dataDir() {
  return path.resolve(String(
    process.env.HIPICO_DATA_DIR ||
    (process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'ControlHipicoBridge', 'data')
      : path.join(process.cwd(), 'data'))
  ));
}

const requireReady = process.argv.includes('--ready');
const maxAgeMs = Math.max(15000, Math.min(15 * 60 * 1000, Number(process.env.HIPICO_HEALTH_MAX_AGE_MS || 120000)));
const file = path.join(dataDir(), 'health.json');

function finish(ok, reason, health = null) {
  const payload = {
    ts: new Date().toISOString(),
    service: 'control-hipico-whatsapp-bridge',
    ok,
    reason,
    requireReady,
    healthTimestamp: health?.timestamp || null,
    ready: health?.readiness?.ready === true,
    runtimeMode: health?.runtimeMode || null,
    sourceSendPossible: health?.sourceSendPossible ?? null
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exitCode = ok ? 0 : 1;
}

try {
  const raw = await fs.readFile(file, 'utf8');
  const health = JSON.parse(raw);
  const stamp = Date.parse(String(health?.timestamp || ''));
  if (!Number.isFinite(stamp)) finish(false, 'HEALTH_TIMESTAMP_INVALID', health);
  else if (Date.now() - stamp > maxAgeMs) finish(false, 'HEALTH_STALE', health);
  else if (health?.sourceSendPossible !== false) finish(false, 'SOURCE_SEND_GUARD_INVALID', health);
  else if (requireReady && health?.readiness?.ready !== true) finish(false, 'RUNTIME_NOT_READY', health);
  else finish(true, 'HEALTH_OK', health);
} catch (error) {
  finish(false, error?.code === 'ENOENT' ? 'HEALTH_FILE_MISSING' : 'HEALTH_READ_FAILED');
}
