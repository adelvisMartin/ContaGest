import { normalizeModelCandidate } from './agent-candidate-policy.js';
import { evaluateAutomationPromotion } from './agent-promotion-policy.js';
import {
  AGENT_TOOLS as INTERNAL_AGENT_TOOLS,
  AUTO_EXECUTABLE_TOOLS as INTERNAL_AUTO_EXECUTABLE_TOOLS,
  MIN_AUTO_CONFIDENCE as INTERNAL_MIN_AUTO_CONFIDENCE,
  buildSafeToolRequest,
  evaluateAgentCanAct
} from './agent-tool-policy.js';
import { decideRiskPolicy, type RiskPolicyInput } from './risk-policy.js';

export const AUTOMATION_STATES = ['DISABLED', 'SHADOW', 'ASSISTED', 'AUTOMATIC_LOW_RISK', 'AUTOMATIC'] as const;
export type AutomationState = typeof AUTOMATION_STATES[number];

export const AGENT_TOOLS = INTERNAL_AGENT_TOOLS;
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

export function canPromoteAutomation(
  current: AutomationState,
  target: AutomationState,
  metrics: AutomationMetrics,
  ownerApproved = false
): PromotionDecision {
  return evaluateAutomationPromotion(current, target, metrics, ownerApproved);
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

export function validateModelCandidate(value: unknown): AgentCandidate {
  return normalizeModelCandidate(value);
}

export const AUTO_EXECUTABLE_TOOLS = INTERNAL_AUTO_EXECUTABLE_TOOLS;
export const MIN_AUTO_CONFIDENCE = INTERNAL_MIN_AUTO_CONFIDENCE;

export function agentCanAct(mode: AutomationState, candidate: AgentCandidate) {
  return evaluateAgentCanAct(mode, candidate);
}

export function safeToolRequest(candidate: AgentCandidate) {
  return buildSafeToolRequest(candidate);
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
