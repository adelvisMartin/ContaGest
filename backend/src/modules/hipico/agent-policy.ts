export const AUTOMATION_STATES = ['DISABLED', 'SHADOW', 'ASSISTED', 'AUTOMATIC_LOW_RISK', 'AUTOMATIC'] as const;
export type AutomationState = typeof AUTOMATION_STATES[number];

export const AGENT_TOOLS = ['queryRaceStatus', 'queryNextRace', 'queryLastResult', 'querySchedule', 'queryScratches', 'proposeRaceCommand'] as const;
export type AgentTool = typeof AGENT_TOOLS[number];

export type AutomationMetrics = {
  reviewed: number;
  matched: number;
  highRiskFalsePositive: number;
  unauthorizedAction: number;
  conflicts: number;
};

export type PromotionDecision = {
  allowed: boolean;
  reason: string;
  metrics: { accuracy: number; conflictRate: number };
};

function rates(metrics: AutomationMetrics) {
  const reviewed = Math.max(0, Number(metrics.reviewed) || 0);
  const matched = Math.max(0, Math.min(reviewed, Number(metrics.matched) || 0));
  const conflicts = Math.max(0, Number(metrics.conflicts) || 0);
  return {
    accuracy: reviewed ? matched / reviewed : 0,
    conflictRate: reviewed ? conflicts / reviewed : 1
  };
}

export function canPromoteAutomation(
  current: AutomationState,
  target: AutomationState,
  metrics: AutomationMetrics,
  ownerApproved = false
): PromotionDecision {
  const calculated = rates(metrics);
  const currentIndex = AUTOMATION_STATES.indexOf(current);
  const targetIndex = AUTOMATION_STATES.indexOf(target);
  if (currentIndex < 0 || targetIndex < 0) {
    return { allowed: false, reason: 'INVALID_PROMOTION_PATH', metrics: calculated };
  }
  if (targetIndex <= currentIndex) {
    return { allowed: true, reason: 'DOWNGRADE_OR_SAME_STATE', metrics: calculated };
  }
  if (targetIndex !== currentIndex + 1) {
    return { allowed: false, reason: 'INVALID_PROMOTION_PATH', metrics: calculated };
  }
  if (target === 'SHADOW') {
    return { allowed: true, reason: 'SHADOW_SAFE_DEFAULT', metrics: calculated };
  }
  if (target === 'ASSISTED') {
    const allowed = metrics.reviewed >= 200
      && calculated.accuracy >= .98
      && metrics.highRiskFalsePositive === 0
      && metrics.unauthorizedAction === 0;
    return { allowed, reason: allowed ? 'SHADOW_GATE_PASSED' : 'SHADOW_METRICS_INSUFFICIENT', metrics: calculated };
  }
  if (target === 'AUTOMATIC_LOW_RISK') {
    const allowed = metrics.reviewed >= 500
      && calculated.accuracy >= .99
      && calculated.conflictRate <= .005
      && metrics.highRiskFalsePositive === 0
      && metrics.unauthorizedAction === 0;
    return { allowed, reason: allowed ? 'LOW_RISK_GATE_PASSED' : 'LOW_RISK_METRICS_INSUFFICIENT', metrics: calculated };
  }
  if (target === 'AUTOMATIC') {
    if (!ownerApproved) return { allowed: false, reason: 'OWNER_APPROVAL_REQUIRED', metrics: calculated };
    const allowed = metrics.reviewed >= 1000
      && calculated.accuracy >= .995
      && calculated.conflictRate <= .002
      && metrics.highRiskFalsePositive === 0
      && metrics.unauthorizedAction === 0;
    return { allowed, reason: allowed ? 'AUTOMATIC_GATE_PASSED' : 'AUTOMATIC_METRICS_INSUFFICIENT', metrics: calculated };
  }
  return { allowed: false, reason: 'INVALID_PROMOTION_PATH', metrics: calculated };
}

export function sourceAutomationModeAllowed(
  groupId: string,
  target: AutomationState,
  sourceGroupId: string | undefined
) {
  const source = String(sourceGroupId || '').trim().toLowerCase();
  const group = String(groupId || '').trim().toLowerCase();
  if (!source || !group || group !== source) return true;
  return target === 'DISABLED' || target === 'SHADOW';
}

export type AgentCandidate = {
  intent: string;
  confidence: number;
  tool: AgentTool | null;
  arguments: Record<string, unknown>;
  risk: 'safe' | 'review' | 'monetary';
  source: 'deterministic' | 'model';
  modelVersion: string | null;
};

export interface DeterministicAgentParser {
  parse(text: string): Omit<AgentCandidate, 'source' | 'modelVersion'>;
}

export interface StructuredCandidateGenerator {
  id: string;
  generate(input: { text: string; deterministic: AgentCandidate }): Promise<unknown>;
}

function boundedString(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

function isAgentTool(value: unknown): value is AgentTool {
  return (AGENT_TOOLS as readonly unknown[]).includes(value);
}

export function validateModelCandidate(value: unknown): AgentCandidate {
  const row = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const intent = boundedString(row.intent, 120);
  const confidence = Number(row.confidence);
  const tool = row.tool == null ? null : row.tool;
  if (!intent || !Number.isFinite(confidence) || confidence < 0 || confidence > 1 || (tool !== null && !isAgentTool(tool))) {
    throw new Error('AGENT_CANDIDATE_SCHEMA_INVALID');
  }
  const risk = row.risk;
  if (risk !== 'safe' && risk !== 'review' && risk !== 'monetary') throw new Error('AGENT_CANDIDATE_SCHEMA_INVALID');
  const args = row.arguments && typeof row.arguments === 'object' && !Array.isArray(row.arguments)
    ? row.arguments as Record<string, unknown>
    : {};
  return {
    intent,
    confidence,
    tool,
    arguments: args,
    risk,
    source: 'model',
    modelVersion: boundedString(row.modelVersion, 120) || null
  };
}

export function agentCanAct(mode: AutomationState, candidate: AgentCandidate) {
  if (mode === 'DISABLED' || mode === 'SHADOW' || mode === 'ASSISTED') return false;
  if (candidate.risk !== 'safe') return false;
  return mode === 'AUTOMATIC_LOW_RISK' || mode === 'AUTOMATIC';
}

const DANGEROUS_KEY = /(?:^|[_-])(sql|shell|command|child[_-]?process|exec|spawn|password|token|secret|credential|cookie|authorization|prototype|constructor|__proto__)(?:$|[_-])/i;
const QUERY_TOOLS = new Set<AgentTool>(['queryRaceStatus', 'queryNextRace', 'queryLastResult', 'querySchedule', 'queryScratches']);
const PROPOSABLE_INTENTS = new Set(['race_open', 'race_close', 'race_result', 'result', 'day_close']);
const ALLOWED_KEYS: Record<AgentTool, ReadonlySet<string>> = {
  queryRaceStatus: new Set(['text', 'raceId']),
  queryNextRace: new Set(['text']),
  queryLastResult: new Set(['text']),
  querySchedule: new Set(['text', 'date']),
  queryScratches: new Set(['text', 'raceId']),
  proposeRaceCommand: new Set(['intent', 'entities'])
};

const MAX_AGENT_EVIDENCE_BYTES = 16 * 1024;
const MAX_AGENT_EVIDENCE_DEPTH = 8;
const MAX_AGENT_EVIDENCE_KEYS = 100;
const MAX_AGENT_EVIDENCE_ARRAY = 200;

function evidenceKeyForbidden(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!normalized) return true;
  if (['authorization', 'cookie', 'password', 'credential', 'apikey', 'prototype', 'constructor', 'proto'].includes(normalized)) return true;
  return normalized.startsWith('secret') || normalized.endsWith('secret') || normalized.startsWith('token') || normalized.endsWith('token');
}

function sanitizeEvidenceNode(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_AGENT_EVIDENCE_DEPTH) throw new Error('HIPICO_AGENT_EVIDENCE_TOO_DEEP');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('HIPICO_AGENT_EVIDENCE_INVALID');
    return value;
  }
  if (!value || typeof value !== 'object') throw new Error('HIPICO_AGENT_EVIDENCE_INVALID');
  if (seen.has(value)) throw new Error('HIPICO_AGENT_EVIDENCE_INVALID');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_AGENT_EVIDENCE_ARRAY) throw new Error('HIPICO_AGENT_EVIDENCE_TOO_LARGE');
      return value.map((item) => sanitizeEvidenceNode(item, depth + 1, seen));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error('HIPICO_AGENT_EVIDENCE_INVALID');
    const row = value as Record<string, unknown>;
    const keys = Object.keys(row);
    if (keys.length > MAX_AGENT_EVIDENCE_KEYS) throw new Error('HIPICO_AGENT_EVIDENCE_TOO_LARGE');
    const clean: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      if (!key || key.length > 120 || evidenceKeyForbidden(key)) throw new Error('HIPICO_AGENT_EVIDENCE_FORBIDDEN_KEY');
      clean[key] = sanitizeEvidenceNode(row[key], depth + 1, seen);
    }
    return clean;
  } finally {
    seen.delete(value);
  }
}

export function sanitizeAgentEvidence(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('HIPICO_AGENT_EVIDENCE_INVALID');
  const sanitized = sanitizeEvidenceNode(value, 0, new WeakSet<object>()) as Record<string, unknown>;
  let serialized: string;
  try {
    serialized = JSON.stringify(sanitized);
  } catch {
    throw new Error('HIPICO_AGENT_EVIDENCE_INVALID');
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_AGENT_EVIDENCE_BYTES) throw new Error('HIPICO_AGENT_EVIDENCE_TOO_LARGE');
  return JSON.parse(serialized) as Record<string, unknown>;
}

function rejected(): never {
  throw new Error('AGENT_TOOL_ARGUMENTS_REJECTED');
}

function boundedPlainRecord(value: unknown, maxKeys: number) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) rejected();
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row);
  if (keys.length > maxKeys || keys.some((key) => DANGEROUS_KEY.test(key))) rejected();
  return row;
}

function safeScalar(value: unknown) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > 1_000_000_000) rejected();
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 500) rejected();
    return value;
  }
  rejected();
}

function sanitizeEntities(value: unknown) {
  const row = boundedPlainRecord(value, 24);
  return Object.fromEntries(Object.entries(row).map(([key, item]) => [key, safeScalar(item)]));
}

function sanitizeToolArguments(tool: AgentTool, raw: unknown, risk: AgentCandidate['risk']) {
  const row = boundedPlainRecord(raw ?? {}, 8);
  const allowed = ALLOWED_KEYS[tool];
  if (Object.keys(row).some((key) => !allowed.has(key))) rejected();

  if (QUERY_TOOLS.has(tool)) {
    if (risk !== 'safe') rejected();
    const result: Record<string, unknown> = {};
    if (row.text !== undefined) {
      if (typeof row.text !== 'string' || row.text.length > 1000) rejected();
      result.text = row.text;
    }
    if (row.raceId !== undefined) {
      if (typeof row.raceId !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(row.raceId)) rejected();
      result.raceId = row.raceId;
    }
    if (row.date !== undefined) {
      if (typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) rejected();
      result.date = row.date;
    }
    return result;
  }

  if (tool === 'proposeRaceCommand') {
    if (risk !== 'review') rejected();
    const intent = String(row.intent || '').trim();
    if (!PROPOSABLE_INTENTS.has(intent)) rejected();
    return { intent, entities: sanitizeEntities(row.entities ?? {}) };
  }

  rejected();
}

export function safeToolRequest(candidate: AgentCandidate) {
  if (!candidate.tool) return null;
  if (!isAgentTool(candidate.tool)) rejected();
  const argumentsValue = sanitizeToolArguments(candidate.tool, candidate.arguments, candidate.risk);
  const encoded = JSON.stringify(argumentsValue);
  if (encoded.length > 4000 || DANGEROUS_KEY.test(encoded)) rejected();
  return { tool: candidate.tool, arguments: argumentsValue };
}

export class HipicoAgentEngine {
  constructor(
    private readonly parser: DeterministicAgentParser,
    private readonly generator: StructuredCandidateGenerator | null = null
  ) {}

  async evaluate(text: string, mode: AutomationState) {
    const normalized = boundedString(text, 4000);
    if (!normalized) throw new Error('AGENT_MESSAGE_REQUIRED');
    const deterministicBase = this.parser.parse(normalized);
    const deterministic: AgentCandidate = { ...deterministicBase, source: 'deterministic', modelVersion: null };
    let candidate = deterministic;
    if (this.generator && deterministic.confidence < .8) {
      const generated = validateModelCandidate(await this.generator.generate({ text: normalized, deterministic }));
      candidate = { ...generated, modelVersion: generated.modelVersion || this.generator.id };
    }
    const request = safeToolRequest(candidate);
    return { candidate, toolRequest: request, canAct: agentCanAct(mode, candidate), mode };
  }
}
