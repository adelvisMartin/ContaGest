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

export type AgentRiskContext = {
  evidenceState?: 'NOT_REQUIRED' | 'MISSING' | 'FRESH' | 'STALE' | 'CONFLICT';
  sourceAuthorized?: boolean;
  systemHealthy?: boolean;
  sourceReadOnly?: boolean;
  humanOwned?: boolean;
  ambiguous?: boolean;
  toolValidated?: boolean;
};
