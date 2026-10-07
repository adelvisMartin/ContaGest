import fs from 'node:fs';

const POLICY_PATH = new URL('../config/agent-execution-capabilities-v1.json', import.meta.url);
const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
const caps = policy.capabilities;

const uniq = (values) => [...new Set((values || []).filter(Boolean))];
const normalizeFiles = (files = []) => uniq(files.map((file) => String(file || '').replaceAll('\\', '/').trim()).filter(Boolean));

const RUNTIME_RECIPE_PATTERNS = [
  /(^|\/)package(?:-lock)?\.json$/i,
  /(^|\/)pnpm-lock\.yaml$/i,
  /(^|\/)yarn\.lock$/i,
  /(^|\/)Dockerfile$/i,
  /(^|\/)docker-compose[^/]*\.ya?ml$/i,
  /(^|\/)vercel\.json$/i,
  /(^|\/)netlify\.toml$/i,
  /^scripts\/(?:[^/]*-)?(?:bootstrap|build|dev|start|run|verify)[^/]*\.(?:mjs|cjs|js|ts)$/i,
];

const SKILL_SURFACE_PATTERNS = [
  /^\.agents\//i,
  /^agent-skills\.lock\.json$/i,
  /^config\/agent-(?:system|skill|execution)/i,
  /^scripts\/(?:agent-|verify-agent|sync-agent)/i,
  /^tests\/agent_/i,
];

function positiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function booleanSignal(value) {
  return value === true;
}

export function inferTicketAutomationSignals({ files = [], signals = {} } = {}) {
  const normalizedFiles = normalizeFiles(files);
  return {
    independentWorkUnits: positiveInteger(signals.independentWorkUnits),
    waitingOnExternalState: booleanSignal(signals.waitingOnExternalState),
    continuationAuthorized: booleanSignal(signals.continuationAuthorized),
    stopCondition: String(signals.stopCondition || '').trim(),
    runtimeRecipeDrift: normalizedFiles.some((file) => RUNTIME_RECIPE_PATTERNS.some((pattern) => pattern.test(file))) || booleanSignal(signals.runtimeRecipeDrift),
    repeatedPermissionPrompts: positiveInteger(signals.repeatedPermissionPrompts),
    skillSurfaceChanged: normalizedFiles.some((file) => SKILL_SURFACE_PATTERNS.some((pattern) => pattern.test(file))) || booleanSignal(signals.skillSurfaceChanged),
    orderedMutation: booleanSignal(signals.orderedMutation),
    destructiveMutation: booleanSignal(signals.destructiveMutation),
  };
}

function hasDatabaseBoundary(boundaries = []) {
  const normalized = new Set(boundaries.map((item) => String(item || '').trim().toLowerCase()));
  return normalized.has('database') || normalized.has('persistence');
}

export function planTicketAutomation({ type = 'feature', domains = [], boundaries = [], files = [], signals = {} } = {}) {
  const normalizedSignals = inferTicketAutomationSignals({ files, signals });
  const capabilities = [];
  const databaseMigration = String(type).toLowerCase() === 'migration' && hasDatabaseBoundary(boundaries);
  const orderedPersistence = databaseMigration || normalizedSignals.orderedMutation || normalizedSignals.destructiveMutation;

  if (normalizedSignals.independentWorkUnits >= caps['contagest-batch'].minIndependentWorkUnits && !orderedPersistence) {
    capabilities.push({
      id: 'contagest-batch',
      mode: 'parallel-isolated',
      workers: Math.min(normalizedSignals.independentWorkUnits, caps['contagest-batch'].maxWorkers),
      requiresIsolation: caps['contagest-batch'].requiresIsolation,
      overlappingWritesAllowed: false,
      mergeAuthority: false,
      reason: `${normalizedSignals.independentWorkUnits} independent work units detected`,
    });
  }

  if (normalizedSignals.waitingOnExternalState && normalizedSignals.continuationAuthorized && normalizedSignals.stopCondition) {
    capabilities.push({
      id: 'contagest-loop',
      mode: 'bounded-continuation',
      sessionBound: caps['contagest-loop'].sessionBound,
      stopCondition: normalizedSignals.stopCondition,
      newScopeAllowed: false,
      reason: 'authorized ticket is waiting on recurring/external state',
    });
  }

  if (normalizedSignals.runtimeRecipeDrift) {
    capabilities.push({
      id: 'contagest-run-skill-generator',
      mode: 'check-or-regenerate',
      projectRecipeOnly: caps['contagest-run-skill-generator'].projectRecipeOnly,
      recordSecretValues: caps['contagest-run-skill-generator'].recordSecretValues,
      reason: 'build/run/bootstrap-sensitive files changed',
    });
  }

  if (normalizedSignals.repeatedPermissionPrompts >= caps['contagest-fewer-permission-prompts'].triggerAfterRepeatedPrompts) {
    capabilities.push({
      id: 'contagest-fewer-permission-prompts',
      mode: 'recommend',
      autoApply: caps['contagest-fewer-permission-prompts'].autoApply,
      scope: caps['contagest-fewer-permission-prompts'].scope,
      lowRiskOnly: caps['contagest-fewer-permission-prompts'].lowRiskOnly,
      reason: `${normalizedSignals.repeatedPermissionPrompts} repeated permission prompts observed`,
    });
  }

  if (normalizedSignals.skillSurfaceChanged) {
    capabilities.push({
      id: 'contagest-skill-doctor',
      mode: 'diagnose',
      readOnly: caps['contagest-skill-doctor'].readOnly,
      reason: 'agent/skill surface changed',
    });
  }

  return {
    schemaVersion: 1,
    authority: policy.authority,
    domainSkillSlotsUnaffected: policy.domainSkillSlotsUnaffected,
    type,
    domains: uniq(domains),
    boundaries: uniq(boundaries),
    signals: normalizedSignals,
    capabilities,
  };
}

export function augmentAgentRoute(route = {}, { signals = {} } = {}) {
  const task = route.task || {};
  const domainIds = (route.domains || []).map((entry) => typeof entry === 'string' ? entry : entry?.id).filter(Boolean);
  const automation = planTicketAutomation({
    type: task.type || 'feature',
    domains: domainIds,
    boundaries: task.boundaries || [],
    files: route.files || [],
    signals,
  });
  return {
    ...route,
    executionSignals: automation.signals,
    executionCapabilities: automation.capabilities,
    executionCapabilityPolicy: 'agent-execution-capabilities-v1',
    routingPolicy: `${route.routingPolicy || 'minimal-2-4-skills'}+execution-capabilities-v1`,
  };
}

export { policy as AGENT_EXECUTION_CAPABILITIES_V1_POLICY };
