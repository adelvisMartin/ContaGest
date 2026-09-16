import { decideRiskPolicy, type RiskPolicyInput } from './risk-policy.js';

export const AUTOMATION_STATES = ['DISABLED', 'SHADOW', 'ASSISTED', 'AUTOMATIC_LOW_RISK', 'AUTOMATIC'] as const;
export type AutomationState = typeof AUTOMATION_STATES[number];

export const AGENT_TOOLS = ['queryRaceStatus', 'queryNextRace', 'queryLastResult', 'querySchedule', 'queryScratches', 'proposeRaceCommand'] as const;
export type AgentTool = typeof AGENT_TOOLS[number];

export type AutomationMetricWindow = {
  reviewed: number;
  matched: number;
  highRiskFalsePositive: number;
  unauthorizedAction: number;
  conflicts: number;
  abstentions?: number;
  raceContextErrors?: number;
};

export type AutomationIntentMetrics = AutomationMetricWindow;

export type AutomationMetrics = AutomationMetricWindow & {
  recent?: AutomationMetricWindow;
  byIntent?: Record<string, AutomationIntentMetrics>;
  window?: {
    recentDays: number;
    recentSince?: string | null;
    metricSchemaVersion: string;
  };
  metricsSignature?: string;
};

export type AutomationMetricRates = {
  accuracy: number;
  conflictRate: number;
  abstentionRate: number;
  raceContextErrorRate: number;
};

export type PromotionDecision = {
  allowed: boolean;
  reason: string;
  metrics: AutomationMetricRates & { recent?: AutomationMetricRates };
};

type PromotionTarget = Exclude<AutomationState, 'DISABLED' | 'SHADOW'>;
type PromotionGate = {
  historicalReviewed: number;
  recentReviewed: number;
  accuracy: number;
  conflictRate: number;
  abstentionRate: number;
  raceContextErrorRate: number;
  passReason: string;
  historicalFailureReason: string;
};

const RECENT_WINDOW_DAYS = 30;
const METRIC_SCHEMA_VERSION = 'v7';

const PROMOTION_GATES: Record<PromotionTarget, PromotionGate> = {
  ASSISTED: {
    historicalReviewed: 200,
    recentReviewed: 75,
    accuracy: .98,
    conflictRate: .02,
    abstentionRate: .05,
    raceContextErrorRate: .02,
    passReason: 'SHADOW_GATE_PASSED',
    historicalFailureReason: 'SHADOW_METRICS_INSUFFICIENT'
  },
  AUTOMATIC_LOW_RISK: {
    historicalReviewed: 500,
    recentReviewed: 200,
    accuracy: .99,
    conflictRate: .005,
    abstentionRate: .03,
    raceContextErrorRate: .005,
    passReason: 'LOW_RISK_GATE_PASSED',
    historicalFailureReason: 'LOW_RISK_METRICS_INSUFFICIENT'
  },
  AUTOMATIC: {
    historicalReviewed: 1000,
    recentReviewed: 400,
    accuracy: .995,
    conflictRate: .002,
    abstentionRate: .02,
    raceContextErrorRate: .002,
    passReason: 'AUTOMATIC_GATE_PASSED',
    historicalFailureReason: 'AUTOMATIC_METRICS_INSUFFICIENT'
  }
};

function nonNegative(value: unknown) {
  return Math.max(0, Number(value) || 0);
}

function metricRates(metrics: AutomationMetricWindow): AutomationMetricRates {
  const reviewed = nonNegative(metrics.reviewed);
  const matched = Math.min(reviewed, nonNegative(metrics.matched));
  const conflicts = nonNegative(metrics.conflicts);
  const abstentions = nonNegative(metrics.abstentions);
  const raceContextErrors = nonNegative(metrics.raceContextErrors);
  return {
    accuracy: reviewed ? matched / reviewed : 0,
    conflictRate: reviewed ? conflicts / reviewed : 1,
    abstentionRate: reviewed ? abstentions / reviewed : 1,
    raceContextErrorRate: reviewed ? raceContextErrors / reviewed : 1
  };
}

function metricWindowPasses(window: AutomationMetricWindow, gate: PromotionGate, minimumReviewed: number) {
  const calculated = metricRates(window);
  return nonNegative(window.reviewed) >= minimumReviewed
    && calculated.accuracy >= gate.accuracy
    && calculated.conflictRate <= gate.conflictRate
    && calculated.abstentionRate <= gate.abstentionRate
    && calculated.raceContextErrorRate <= gate.raceContextErrorRate
    && nonNegative(window.highRiskFalsePositive) === 0
    && nonNegative(window.unauthorizedAction) === 0;
}

function recentWindowValid(metrics: AutomationMetrics) {
  return Boolean(metrics.recent)
    && metrics.window?.recentDays === RECENT_WINDOW_DAYS
    && metrics.window?.metricSchemaVersion === METRIC_SCHEMA_VERSION;
}

function decisionMetrics(metrics: AutomationMetrics) {
  const historical = metricRates(metrics);
  return metrics.recent
    ? { ...historical, recent: metricRates(metrics.recent) }
    : historical;
}

export function canPromoteAutomation(
  current: AutomationState,
  target: AutomationState,
  metrics: AutomationMetrics,
  ownerApproved = false
): PromotionDecision {
  const calculated = decisionMetrics(metrics);
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
  if (target === 'AUTOMATIC' && !ownerApproved) {
    return { allowed: false, reason: 'OWNER_APPROVAL_REQUIRED', metrics: calculated };
  }

  const gate = PROMOTION_GATES[target as PromotionTarget];
  if (!gate) {
    return { allowed: false, reason: 'INVALID_PROMOTION_PATH', metrics: calculated };
  }
  if (!metricWindowPasses(metrics, gate, gate.historicalReviewed)) {
    return { allowed: false, reason: gate.historicalFailureReason, metrics: calculated };
  }
  if (!recentWindowValid(metrics) || !metricWindowPasses(metrics.recent!, gate, gate.recentReviewed)) {
    return { allowed: false, reason: 'RECENT_METRICS_INSUFFICIENT', metrics: calculated };
  }
  return { allowed: true, reason: gate.passReason, metrics: calculated };
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

export type AgentRiskContext = Omit<RiskPolicyInput, 'mode' | 'candidate'>;

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

export const AUTO_EXECUTABLE_TOOLS = ['queryRaceStatus', 'queryNextRace', 'queryLastResult', 'querySchedule', 'queryScratches'] as const;
export const MIN_AUTO_CONFIDENCE = .95;
const AUTO_EXECUTABLE_TOOL_SET = new Set<AgentTool>(AUTO_EXECUTABLE_TOOLS);

export function agentCanAct(mode: AutomationState, candidate: AgentCandidate) {
  if (mode === 'DISABLED' || mode === 'SHADOW' || mode === 'ASSISTED') return false;
  if (candidate.risk !== 'safe') return false;
  if (!candidate.tool || !AUTO_EXECUTABLE_TOOL_SET.has(candidate.tool)) return false;
  if (!Number.isFinite(candidate.confidence) || candidate.confidence < MIN_AUTO_CONFIDENCE) return false;
  return mode === 'AUTOMATIC_LOW_RISK' || mode === 'AUTOMATIC';
}

const DANGEROUS_KEY = /(?:^|[_-])(sql|shell|command|child[_-]?process|exec|spawn|password|token|secret|credential|cookie|authorization|prototype|constructor|__proto__)(?:$|[_-])/i;
const QUERY_TOOLS = new Set<AgentTool>(AUTO_EXECUTABLE_TOOLS);
const PROPOSABLE_INTENTS = new Set(['race_open', 'race_close', 'race_result', 'result', 'day_close']);
const ALLOWED_KEYS: Record<AgentTool, ReadonlySet<string>> = {
  queryRaceStatus: new Set(['text', 'raceId']),
  queryNextRace: new Set(['text']),
  queryLastResult: new Set(['text']),
  querySchedule: new Set(['text', 'date']),
  queryScratches: new Set(['text', 'raceId']),
  proposeRaceCommand: new Set(['intent', 'entities'])
};

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

  async evaluate(text: string, mode: AutomationState, riskContext: AgentRiskContext = {}) {
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
    const riskPolicy = decideRiskPolicy({
      ...riskContext,
      mode,
      candidate,
      toolValidated: riskContext.toolValidated ?? Boolean(request)
    });
    const canAct = agentCanAct(mode, candidate) && riskPolicy.disposition === 'AUTO' && riskPolicy.autonomousSendAllowed;
    return { candidate, toolRequest: request, canAct, mode, riskPolicy };
  }
}
