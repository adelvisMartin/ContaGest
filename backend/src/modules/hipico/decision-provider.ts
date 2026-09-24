import type { AgentCandidate } from './agent-contracts.js';

export const DECISION_PROVIDER_MODES = ['OFF', 'SHADOW'] as const;
export type DecisionProviderMode = typeof DECISION_PROVIDER_MODES[number];

export const DECISION_PROVIDER_STATUSES = ['SKIPPED', 'OBSERVED', 'UNAVAILABLE'] as const;
export type DecisionProviderStatus = typeof DECISION_PROVIDER_STATUSES[number];

export type DecisionProviderInput = {
  text: string;
  candidate: AgentCandidate;
};

export type DecisionProviderPublicStatus = {
  providerId: string;
  mode: DecisionProviderMode;
  enabled: boolean;
  configured: boolean;
  authoritative: false;
  reasons: readonly string[];
};

export type DecisionProviderObservation<TDecision extends Record<string, unknown> = Record<string, unknown>> = {
  providerId: string;
  mode: DecisionProviderMode;
  status: DecisionProviderStatus;
  authoritative: false;
  canAuthorize: false;
  model: string | null;
  latencyMs: number;
  failureCode: string | null;
  decision: TDecision | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
  } | null;
};

export interface DecisionProvider<TDecision extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  publicStatus(): DecisionProviderPublicStatus;
  observe(input: DecisionProviderInput): Promise<DecisionProviderObservation<TDecision>>;
}

export function skippedDecisionObservation(
  providerId: string,
  mode: DecisionProviderMode,
  failureCode: string | null = null
): DecisionProviderObservation {
  return {
    providerId,
    mode,
    status: 'SKIPPED',
    authoritative: false,
    canAuthorize: false,
    model: null,
    latencyMs: 0,
    failureCode,
    decision: null,
    usage: null
  };
}
