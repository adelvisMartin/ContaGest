import fs from 'node:fs/promises';
import path from 'node:path';
import { VERSION, loadRuntimeConfig, validateRuntimeConfig } from '../runtime-config.mjs';
import { redactGroupId } from '../group-identity.mjs';
import { classifyHealth, deriveOperationalMetrics, redactDiagnostic } from '../observability.mjs';

function cliError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function readJson(file, code) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') throw cliError(code, `${path.basename(file)} no está disponible.`);
    throw cliError(`${code}_INVALID`, `${path.basename(file)} no se pudo leer de forma segura.`);
  }
}

async function pathExists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function tailLines(file, limit) {
  let raw;
  try { raw = await fs.readFile(file, 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  return raw.split(/\r?\n/).filter(Boolean).slice(-limit);
}

function latestShadowJournalName(names) {
  return names
    .filter((name) => /^shadow-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
    .sort()
    .at(-1) || null;
}

async function tailShadowMessages(dataDir, limit) {
  const dir = path.join(dataDir, 'training');
  let names = [];
  try { names = await fs.readdir(dir); } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const latest = latestShadowJournalName(names);
  if (!latest) return [];
  const lines = await tailLines(path.join(dir, latest), limit);
  return lines.map((line) => {
    try {
      const row = JSON.parse(line);
      return redactDiagnostic({
        recordedAt: row.recordedAt || null,
        sourceMessageKey: row.sourceMessageKey || null,
        timestamp: row.timestamp || null,
        mediaKind: row.mediaKind || 'none',
        text: row.text || null,
        local: row.local ? {
          intent: row.local.intent || null,
          risk: row.local.risk || null,
          confidence: row.local.confidence ?? null
        } : null,
        backend: row.backend ? {
          duplicate: Boolean(row.backend.duplicate),
          intent: row.backend.intent || null,
          risk: row.backend.risk || null
        } : null,
        shadowOnly: row.shadowOnly !== false
      });
    } catch {
      return { invalidRecord: true };
    }
  });
}

function safeLogLine(line) {
  const timestampMatch = String(line).match(/^\[([^\]]+)\]\s*(.*)$/s);
  const timestamp = timestampMatch?.[1] || null;
  const body = timestampMatch?.[2] || String(line);
  const event = body.split(/\s+/, 1)[0]?.slice(0, 80) || 'LOG';
  return redactDiagnostic({ timestamp, event, detail: body.slice(0, 1000) });
}

async function tailBridgeEvents(dataDir, limit) {
  const lines = await tailLines(path.join(dataDir, 'bridge.log'), limit);
  return lines.map(safeLogLine);
}

async function traceBridgeEvents(dataDir, correlationId) {
  const lines = await tailLines(path.join(dataDir, 'bridge.log'), 5000);
  return lines.filter((line) => line.includes(correlationId)).slice(-200).map(safeLogLine);
}

function healthSummary(health, maxAgeMs) {
  const classification = classifyHealth(health, { maxAgeMs });
  return redactDiagnostic({
    state: classification.state,
    ready: classification.ready,
    live: classification.live,
    reasons: classification.reasons,
    ageMs: classification.ageMs,
    version: health.version || 'unknown',
    timestamp: health.timestamp || null,
    runtimeMode: health.runtimeMode || null,
    sourceSendPossible: health.sourceSendPossible,
    metrics: deriveOperationalMetrics(health)
  });
}

export function createCliRuntimeServices({ env = process.env, cwd = process.cwd() } = {}) {
  const config = loadRuntimeConfig(env, cwd);
  const dataDir = config.dataDir;
  const healthFile = path.join(dataDir, 'health.json');
  const maxAgeMs = Math.max(1000, Number(env.HIPICO_HEALTH_MAX_AGE_MS || 120000));

  return Object.freeze({
    async status() {
      const health = await readJson(healthFile, 'HIPICO_HEALTH_FILE_MISSING');
      return healthSummary(health, maxAgeMs);
    },

    async doctor() {
      const configurationErrors = validateRuntimeConfig(config);
      const healthExists = await pathExists(healthFile);
      const dataDirExists = await pathExists(dataDir);
      let sourceGuardOk = null;
      let healthState = 'missing';
      if (healthExists) {
        try {
          const health = await readJson(healthFile, 'HIPICO_HEALTH_FILE_MISSING');
          sourceGuardOk = health.sourceSendPossible === false;
          healthState = classifyHealth(health, { maxAgeMs }).state;
        } catch {
          healthState = 'invalid';
        }
      }
      const nodeMajor = Number(process.versions.node.split('.')[0]);
      const nodeSupported = nodeMajor === 22;
      const ready = configurationErrors.length === 0 && dataDirExists && sourceGuardOk === true && nodeSupported;
      return {
        ready,
        version: VERSION,
        runtimeMode: config.runtimeMode,
        nodeSupported,
        dataDirExists,
        healthExists,
        healthState,
        sourceSendGuardOk: sourceGuardOk,
        configurationErrors
      };
    },

    async health() {
      const health = await readJson(healthFile, 'HIPICO_HEALTH_FILE_MISSING');
      return healthSummary(health, maxAgeMs);
    },

    async version() {
      return { version: VERSION, node: process.versions.node, schemaVersion: 1 };
    },

    async bridgeStatus() {
      const health = await readJson(healthFile, 'HIPICO_HEALTH_FILE_MISSING');
      return redactDiagnostic({
        runtimeMode: health.runtimeMode || config.runtimeMode,
        readiness: health.readiness || null,
        backend: health.backend || null,
        counters: health.counters || null,
        sourceSendPossible: health.sourceSendPossible
      });
    },

    async channelStatus() {
      const health = await readJson(healthFile, 'HIPICO_HEALTH_FILE_MISSING');
      return redactDiagnostic({
        sourceSendPossible: health.sourceSendPossible,
        groupBinding: health.groupBinding || {
          required: config.requirePinnedGroupIds,
          sourceBound: Boolean(config.sourceGroupId),
          labBound: Boolean(config.labGroupId)
        },
        labSendEnabled: health.labSendEnabled === true,
        labTestInputEnabled: health.labTestInputEnabled === true,
        connected: classifyHealth(health, { maxAgeMs }).live
      });
    },

    async groups() {
      return {
        source: {
          bound: Boolean(config.sourceGroupId),
          id: config.sourceGroupId ? redactGroupId(config.sourceGroupId) : null,
          channelConfigured: Boolean(config.sourceChannelKey)
        },
        lab: {
          bound: Boolean(config.labGroupId),
          id: config.labGroupId ? redactGroupId(config.labGroupId) : null,
          channelConfigured: Boolean(config.labChannelKey),
          sendEnabled: config.labSendEnabled === true
        },
        distinct: Boolean(config.sourceGroupId && config.labGroupId && config.sourceGroupId !== config.labGroupId),
        sourceSendPossible: false
      };
    },

    async messagesTail({ limit }) {
      return tailShadowMessages(dataDir, limit);
    },

    async eventsTail({ limit }) {
      return tailBridgeEvents(dataDir, limit);
    },

    async trace({ correlationId }) {
      return traceBridgeEvents(dataDir, correlationId);
    }
  });
}

export const __test__ = { latestShadowJournalName, safeLogLine, healthSummary };
