import fs from 'node:fs/promises';
import path from 'node:path';
import { classifyHealth, deriveOperationalMetrics, redactDiagnostic } from './observability.mjs';

const dataDir = path.resolve(String(
  process.env.HIPICO_DATA_DIR ||
  (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ControlHipicoBridge', 'data') : path.join(process.cwd(), 'data'))
));

try {
  const health = JSON.parse(await fs.readFile(path.join(dataDir, 'health.json'), 'utf8'));
  const status = classifyHealth(health, {
    maxAgeMs: Number(process.env.HIPICO_HEALTH_MAX_AGE_MS || 120000),
    backlogWarnAgeMs: Number(process.env.HIPICO_BACKLOG_WARN_AGE_MS || 300000)
  });
  const payload = redactDiagnostic({
    ok: status.live,
    state: status.state,
    reasons: status.reasons,
    version: health.version || 'unknown',
    timestamp: health.timestamp || null,
    runtimeMode: health.runtimeMode || null,
    sourceSendPossible: health.sourceSendPossible,
    metrics: deriveOperationalMetrics(health)
  });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = status.live ? 0 : 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, state: 'down', reason: error?.code === 'ENOENT' ? 'HEALTH_FILE_MISSING' : 'HEALTH_READ_FAILED' })}\n`);
  process.exitCode = 1;
}
