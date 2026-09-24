import type { IntentResult } from '../hipico-bot/hipico-operational-classifier.js';
import type { ConversationDecision } from '../hipico-bot/hipico-conversation-engine.js';
import type { SafeResponsePlan } from '../hipico-bot/hipico-response-safety.js';
import type { DecisionProviderObservation } from './decision-provider.js';
import type { JevShadowDecision } from './jev-decision-provider.js';
import {
  canonicalIntentToJevClass,
  type DecisionProviderReadiness
} from './decision-provider-metrics.js';

export const AUTONOMOUS_CONVERSATION_POLICY_VERSION = 'hipico-autonomous-conversation-v1';

export const AUTONOMOUS_ACTIONS = [
  'AUTO_REPLY',
  'ASK_CLARIFICATION',
  'SILENT',
  'HUMAN_LAST_RESORT'
] as const;

export type AutonomousConversationAction = typeof AUTONOMOUS_ACTIONS[number];

export type AutonomousConversationDecision = {
  policyVersion: string;
  action: AutonomousConversationAction;
  canSend: boolean;
  text: string | null;
  humanRequired: boolean;
  humanIsLastResort: true;
  reason: string;
  providerInfluence: 'NONE' | 'SAFETY_DOWNGRADE';
  providerReady: boolean;
  directEffectsAllowed: false;
  financialAuthority: false;
};

export type AutonomousConversationInput = {
  classification: IntentResult;
  conversation: ConversationDecision;
  responsePlan: SafeResponsePlan;
  fromMe?: boolean;
  historySync?: boolean;
  rateAllowed?: boolean;
  providerObservation?: DecisionProviderObservation<JevShadowDecision> | null;
  providerReadiness?: DecisionProviderReadiness | null;
};

const HARD_ESCALATION_INTENTS = new Set(['security_review']);

function providerSafetyConflict(input: AutonomousConversationInput) {
  const readiness = input.providerReadiness;
  const observation = input.providerObservation;
  if (!readiness?.eligibleForAssistedRanking || observation?.status !== 'OBSERVED' || !observation.decision) {
    return false;
  }

  const expectedClass = canonicalIntentToJevClass(input.classification.intent);
  const decision = observation.decision;
  const classConflict = decision.intentConfidence >= .9 && decision.intentClass !== expectedClass;
  const reviewConflict = decision.humanReviewProbability >= .9;
  const candidateConflict = decision.candidateAgreementProbability <= .1;
  return classConflict || reviewConflict || candidateConflict;
}

function baseDecision(
  action: AutonomousConversationAction,
  reason: string,
  options: {
    canSend?: boolean;
    text?: string | null;
    humanRequired?: boolean;
    providerInfluence?: AutonomousConversationDecision['providerInfluence'];
    providerReady?: boolean;
  } = {}
): AutonomousConversationDecision {
  return {
    policyVersion: AUTONOMOUS_CONVERSATION_POLICY_VERSION,
    action,
    canSend: Boolean(options.canSend),
    text: options.text ?? null,
    humanRequired: Boolean(options.humanRequired),
    humanIsLastResort: true,
    reason,
    providerInfluence: options.providerInfluence || 'NONE',
    providerReady: Boolean(options.providerReady),
    directEffectsAllowed: false,
    financialAuthority: false
  };
}

export function arbitrateAutonomousConversation(input: AutonomousConversationInput): AutonomousConversationDecision {
  const providerReady = Boolean(input.providerReadiness?.eligibleForAssistedRanking);

  if (input.fromMe) {
    return baseDecision('SILENT', 'SELF_MESSAGE_NO_REPLY', { providerReady });
  }

  if (input.historySync) {
    return baseDecision('SILENT', 'HISTORY_SYNC_NO_REPLY', { providerReady });
  }

  if (input.rateAllowed === false) {
    return baseDecision('SILENT', 'RATE_LIMIT_NO_REPLY', { providerReady });
  }

  if (input.conversation.audit.duplicate) {
    return baseDecision('SILENT', 'DUPLICATE_SOURCE_MESSAGE', { providerReady });
  }

  if (input.conversation.audit.humanOwned || input.responsePlan.reason === 'HUMAN_OWNS_CONVERSATION') {
    return baseDecision('HUMAN_LAST_RESORT', 'HUMAN_OWNS_CONVERSATION', {
      humanRequired: true,
      providerReady
    });
  }

  if (HARD_ESCALATION_INTENTS.has(input.classification.intent)) {
    return baseDecision('HUMAN_LAST_RESORT', 'SECURITY_REVIEW_REQUIRED', {
      canSend: input.responsePlan.canSend,
      text: input.responsePlan.text,
      humanRequired: true,
      providerReady
    });
  }

  if (input.responsePlan.handoffRequired || input.responsePlan.intent === 'ESCALATED') {
    return baseDecision('HUMAN_LAST_RESORT', input.responsePlan.reason || 'HUMAN_LAST_RESORT_REQUIRED', {
      canSend: input.responsePlan.canSend,
      text: input.responsePlan.text,
      humanRequired: true,
      providerReady
    });
  }

  if (!input.responsePlan.canSend || !String(input.responsePlan.text || '').trim()) {
    return baseDecision('SILENT', input.responsePlan.reason || 'NO_SAFE_RESPONSE_AVAILABLE', { providerReady });
  }

  if (providerSafetyConflict(input)) {
    const clarification = input.conversation.responseIntent === 'NEEDS_CLARIFICATION'
      ? input.responsePlan.text
      : 'Necesito una aclaración breve antes de continuar. Indica exactamente la operación o consulta que deseas realizar.';
    return baseDecision('ASK_CLARIFICATION', 'PROVIDER_SAFETY_DOWNGRADE', {
      canSend: true,
      text: clarification,
      providerInfluence: 'SAFETY_DOWNGRADE',
      providerReady
    });
  }

  if (input.responsePlan.intent === 'NEEDS_CLARIFICATION') {
    return baseDecision('ASK_CLARIFICATION', input.responsePlan.reason, {
      canSend: true,
      text: input.responsePlan.text,
      providerReady
    });
  }

  return baseDecision('AUTO_REPLY', input.responsePlan.reason || 'AUTONOMOUS_SAFE_RESPONSE', {
    canSend: true,
    text: input.responsePlan.text,
    providerReady
  });
}

export const __test__ = {
  HARD_ESCALATION_INTENTS,
  providerSafetyConflict
};
