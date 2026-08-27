import fs from 'node:fs/promises';
import path from 'node:path';
import { classifyHealth, deriveOperationalMetrics, redactDiagnostic } from './observability.mjs';

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
const backlogWarnAgeMs = Math.max(30000, Number(process.env.HIPICO_BACKLOG_WARN_AGE_MS || 5 * 60 * 1000));
const file = path.join(dataDir(), 'health.json');

function finish(ok, reason, health = null, status = null) {
  const payload = redactDiagnostic({
    ts: new Date().toISOString(),
    service: 'control-hipico-whatsapp-bridge',
    ok,
    reason,
    requireReady,
    state: status?.state || 'down',
    degraded: status?.degraded === true,
    reasons: status?.reasons || [reason],
    healthTimestamp: health?.timestamp || null,
    ready: status?.ready === true,
    runtimeMode: health?.runtimeMode || null,
    sourceSendPossible: health?.sourceSendPossible ?? null,
    metrics: health ? deriveOperationalMetrics(health) : null
  });
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exitCode = ok ? 0 : 1;
}

try {
  const raw = await fs.readFile(file, 'utf8');
  const health = JSON.parse(raw);
  const status = classifyHealth(health, { maxAgeMs, backlogWarnAgeMs });
  if (!status.live) finish(false, status.reasons[0] || 'HEALTH_DOWN', health, status);
  else if (requireReady && !status.ready) finish(false, status.reasons[0] || 'RUNTIME_NOT_READY', health, status);
  else finish(true, status.degraded ? 'HEALTH_DEGRADED' : 'HEALTH_OK', health, status);
} catch (error) {
  finish(false, error?.code === 'ENOENT' ? 'HEALTH_FILE_MISSING' : 'HEALTH_READ_FAILED');
}
