import fs from 'node:fs/promises';
import path from 'node:path';
import { classifyHealth, deriveOperationalMetrics, redactDiagnostic } from './observability.mjs';
import { loadRuntimeConfig } from './runtime-config.mjs';
import { policyDiagnostic } from './source-policy-gate.mjs';

const dataDir = path.resolve(String(
  process.env.HIPICO_DATA_DIR ||
  (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ControlHipicoBridge', 'data') : path.join(process.cwd(), 'data'))
));
const config = loadRuntimeConfig(process.env, process.cwd());
const diagnostic = policyDiagnostic(config);
const policySummary = {
  transport: {
    id: diagnostic.transport.id,
    official: diagnostic.transport.official,
    implemented: diagnostic.transport.implemented,
    sourceRead: diagnostic.transport.sourceRead,
    labSend: diagnostic.transport.labSend
  },
  sourcePolicy: {
    requested: diagnostic.sourcePolicy.requested,
    eligible: diagnostic.sourcePolicy.eligible,
    status: diagnostic.sourcePolicy.status,
    snapshot: diagnostic.sourcePolicy.snapshot,
    reasons: diagnostic.sourcePolicy.reasons
  },
  labAutomation: {
    sendRequested: config.labSendEnabled,
    inputRequested: config.labTestInputEnabled,
    technicallyAvailable: diagnostic.transport.implemented && diagnostic.transport.labSend
  }
};

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
    version: health.version || config.version || 'unknown',
    timestamp: health.timestamp || null,
    runtimeMode: health.runtimeMode || config.runtimeMode || null,
    sourceSendPossible: health.sourceSendPossible,
    ...policySummary,
    metrics: deriveOperationalMetrics(health)
  });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = status.live ? 0 : 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    state: 'down',
    reason: error?.code === 'ENOENT' ? 'HEALTH_FILE_MISSING' : 'HEALTH_READ_FAILED',
    ...policySummary
  }, null, 2)}\n`);
  process.exitCode = 1;
}