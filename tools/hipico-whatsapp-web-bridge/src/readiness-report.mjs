import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isWhatsAppGroupId, loadRuntimeConfig, validateRuntimeConfig } from './runtime-config.mjs';
import { localKillSwitchState } from './promotion-guard.mjs';

function majorVersion(value) {
  const match = String(value || '').trim().match(/^(?:v)?(\d+)/);
  return match ? Number(match[1]) : 0;
}

function loadHealth(dataDir) {
  try {
    const file = path.join(dataDir, 'health.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function evaluateReadiness(config, {
  nodeVersion = process.versions.node,
  killSwitchActive = false,
  health = null
} = {}) {
  const configErrors = validateRuntimeConfig(config);
  const node22 = majorVersion(nodeVersion) === 22;
  const sourcePinned = isWhatsAppGroupId(config.sourceGroupId);
  const labPinned = isWhatsAppGroupId(config.labGroupId);
  const groupsDistinct = sourcePinned && labPinned && config.sourceGroupId !== config.labGroupId;
  const groupBindingReady = Boolean(config.requirePinnedGroupIds && groupsDistinct);
  const configValid = configErrors.length === 0;
  const observeReady = node22 && configValid;
  const labConfigReady = Boolean(
    observeReady &&
    groupBindingReady &&
    config.runtimeMode === 'shadow-local' &&
    config.labSendEnabled &&
    config.labTestInputEnabled &&
    !config.sourceAutoReplyEnabled
  );
  const sourceAutonomousReady = Boolean(
    observeReady &&
    groupBindingReady &&
    config.runtimeMode === 'production' &&
    config.backendSyncEnabled &&
    config.sourceAutoReplyEnabled &&
    !killSwitchActive &&
    health?.sourceSendPossible === true
  );

  const reasons = [];
  if (!node22) reasons.push('NODE_22_REQUIRED');
  if (!configValid) reasons.push('CONFIG_INVALID');
  if (!groupBindingReady) reasons.push('PINNED_DISTINCT_GROUPS_REQUIRED');
  if (killSwitchActive) reasons.push('LOCAL_KILL_SWITCH_ACTIVE');
  if (!config.sourceAutoReplyEnabled) reasons.push('SOURCE_AUTO_REPLY_DISABLED');
  if (config.sourceAutoReplyEnabled && health?.sourceSendPossible !== true) reasons.push('SOURCE_SEND_NOT_CONFIRMED_BY_HEALTH');
  if ((config.labSendEnabled || config.labTestInputEnabled) && !labConfigReady) reasons.push('LAB_NOT_READY');

  return Object.freeze({
    version: config.version || 'unknown',
    runtimeMode: config.runtimeMode,
    node22,
    configValid,
    groupBindingReady,
    observeReady,
    labConfigReady,
    sourceAutonomousReady,
    killSwitchActive: Boolean(killSwitchActive),
    healthAvailable: Boolean(health),
    backendReady: health?.ready === true,
    sourceSendPossible: health?.sourceSendPossible === true,
    reasons: [...new Set(reasons)],
    configErrorCount: configErrors.length
  });
}

function printUsage() {
  console.log('Uso: npm run readiness -- [--lab|--source]');
  console.log('  sin flag   valida configuración segura de observación');
  console.log('  --lab      exige LAB explícito, grupos pinneados y SOURCE auto-reply apagado');
  console.log('  --source   exige producción, backend/health y sourceSendPossible=true');
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }
  const config = loadRuntimeConfig();
  const killSwitch = localKillSwitchState(process.env, process.cwd());
  const health = loadHealth(config.dataDir);
  const report = evaluateReadiness(config, {
    nodeVersion: process.versions.node,
    killSwitchActive: killSwitch.active,
    health
  });
  console.log(JSON.stringify(report, null, 2));

  const target = process.argv.includes('--source')
    ? report.sourceAutonomousReady
    : process.argv.includes('--lab')
      ? report.labConfigReady
      : report.observeReady;
  if (!target) process.exitCode = 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await main();
