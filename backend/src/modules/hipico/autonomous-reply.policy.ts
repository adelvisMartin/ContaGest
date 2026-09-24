import type { DecisionProviderObservation } from './decision-provider.js';
import {
  canonicalIntentToJevClass,
  type DecisionProviderReadiness
} from './decision-provider-metrics.js';
import type { JevShadowDecision } from './jev-decision-provider.js';

type RuntimeEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const JEV_DOWNGRADE_THRESHOLDS = Object.freeze({
  intentConflictConfidence: 0.90,
  humanReviewProbability: 0.90,
  candidateAgreementProbability: 0.10
});

function enabledFlag(value: unknown) {
  return String(value || '').trim().toLowerCase() === 'true';
}

export function sourceAutoReplyEnabled(env: RuntimeEnv = process.env) {
  return enabledFlag(env.HIPICO_SOURCE_AUTO_REPLY_ENABLED);
}

export function safeConversationalIntent(intent: string) {
  return intent === 'greeting' || intent === 'help' || intent === 'status_non_monetary';
}

export function safeQueryIntent(intent: string) {
  return intent.startsWith('query:');
}

/**
 * Jev is advisory and downgrade-only.
 *
 * A mature provider may ask the deterministic path to clarify, but only when
 * the disagreement is strong. Weak/uncertain model disagreement must not turn
 * into unnecessary human work or suppress an otherwise safe deterministic
 * reply.
 */
export function providerRequiresSafetyDowngrade(
  candidateIntent: string,
  observation: DecisionProviderObservation<JevShadowDecision> | null,
  readiness: DecisionProviderReadiness | null
) {
  if (!readiness?.eligibleForAssistedRanking || observation?.status !== 'OBSERVED' || !observation.decision) {
    return false;
  }

  const expectedClass = canonicalIntentToJevClass(candidateIntent);
  const decision = observation.decision;
  const strongIntentConflict =
    decision.intentClass !== expectedClass
    && decision.intentConfidence >= JEV_DOWNGRADE_THRESHOLDS.intentConflictConfidence;
  const strongReviewSignal =
    decision.humanReviewProbability >= JEV_DOWNGRADE_THRESHOLDS.humanReviewProbability;
  const strongCandidateConflict =
    decision.candidateAgreementProbability <= JEV_DOWNGRADE_THRESHOLDS.candidateAgreementProbability;

  return strongIntentConflict || strongReviewSignal || strongCandidateConflict;
}

export const __test__ = {
  enabledFlag
};
