import assert from 'node:assert/strict';
import test from 'node:test';
import type { IntentResult } from '../hipico-bot/hipico-operational-classifier.js';
import type { ConversationDecision } from '../hipico-bot/hipico-conversation-engine.js';
import type { SafeResponsePlan } from '../hipico-bot/hipico-response-safety.js';
import {
  arbitrateAutonomousConversation,
  AUTONOMOUS_CONVERSATION_POLICY_VERSION
} from './autonomous-conversation-arbiter.js';

const classification: IntentResult = {
  intent: 'status_non_monetary',
  risk: 'safe',
  confidence: .99,
  suggestion: 'Estado recibido.',
  autoEligible: true,
  reason: 'SAFE_STATUS',
  entities: {}
};

const conversation: ConversationDecision = {
  stage: 'RESPONSE_PLANNED',
  stages: ['RECEIVED', 'NORMALIZED', 'PARSED', 'CONTEXT_RESOLVED', 'DECISIONED', 'RESPONSE_PLANNED'],
  decision: 'ACK_RECEIVED',
  decisionReason: 'SAFE_INFORMATIONAL_INTENT',
  responseIntent: 'ACK_RECEIVED',
  responseText: 'Estado recibido.',
  confidence: .99,
  parserVersion: 'test-parser',
  policyVersion: 'test-conversation',
  correlationId: 'conv_test',
  sourceMessageId: 'wamid-test',
  participantId: 'participant-1',
  raceId: null,
  classifierIntent: 'status_non_monetary',
  effectsAllowed: false,
  transportAction: 'NONE',
  audit: {
    duplicate: false,
    outOfOrder: false,
    humanOwned: false,
    monetaryOrStateful: false
  }
};

const responsePlan: SafeResponsePlan = {
  intent: 'ACK_RECEIVED',
  text: 'Estado recibido.',
  canSend: true,
  confirmationVerified: false,
  responseIdempotencyKey: 'resp_test',
  decisionVersion: 'test',
  correlationId: 'conv_test',
  sourceMessageId: 'wamid-test',
  evidence: null,
  handoffRequired: false,
  reason: 'SAFE_INFORMATIONAL_INTENT'
};

function providerReadiness(eligibleForAssistedRanking: boolean) {
  return {
    eligibleForAssistedRanking,
    authoritative: false as const,
    reason: eligibleForAssistedRanking ? 'PROVIDER_SHADOW_GATE_PASSED' : 'PROVIDER_DISABLED',
    gateVersion: 'jev-shadow-readiness-v1',
    historical: { intentClassAccuracy: 1, availabilityRate: 1, safetyDisagreementRate: 0 },
    recent: { intentClassAccuracy: 1, availabilityRate: 1, safetyDisagreementRate: 0 },
    thresholds: {
      historicalReviewedObserved: 200,
      recentReviewedObserved: 75,
      intentClassAccuracy: .98,
      availabilityRate: .99,
      safetyDisagreements: 0 as const
    }
  };
}

test('safe deterministic response is autonomous even when Jev is not ready', () => {
  const result = arbitrateAutonomousConversation({
    classification,
    conversation,
    responsePlan,
    providerReadiness: providerReadiness(false)
  });
  assert.equal(result.policyVersion, AUTONOMOUS_CONVERSATION_POLICY_VERSION);
  assert.equal(result.action, 'AUTO_REPLY');
  assert.equal(result.canSend, true);
  assert.equal(result.humanRequired, false);
  assert.equal(result.humanIsLastResort, true);
  assert.equal(result.directEffectsAllowed, false);
  assert.equal(result.financialAuthority, false);
});

test('clarification remains bot-owned instead of escalating immediately', () => {
  const result = arbitrateAutonomousConversation({
    classification: { ...classification, intent: 'betting_or_balance', risk: 'monetary', autoEligible: false },
    conversation: {
      ...conversation,
      decision: 'NEEDS_CLARIFICATION',
      responseIntent: 'NEEDS_CLARIFICATION',
      responseText: 'Indica jugada, selección, monto y carrera.',
      audit: { ...conversation.audit, monetaryOrStateful: true }
    },
    responsePlan: {
      ...responsePlan,
      intent: 'NEEDS_CLARIFICATION',
      text: 'Indica jugada, selección, monto y carrera.',
      reason: 'MISSING_OR_AMBIGUOUS_MONETARY_FIELDS'
    }
  });
  assert.equal(result.action, 'ASK_CLARIFICATION');
  assert.equal(result.canSend, true);
  assert.equal(result.humanRequired, false);
});

test('stateful acknowledgement can auto-reply without granting domain effects', () => {
  const result = arbitrateAutonomousConversation({
    classification: {
      ...classification,
      intent: 'race_close',
      risk: 'review',
      autoEligible: false
    },
    conversation: {
      ...conversation,
      decision: 'HELD_FOR_REVIEW',
      responseIntent: 'ACK_RECEIVED',
      responseText: 'Cierre detectado. Queda pendiente de validación.',
      audit: { ...conversation.audit, monetaryOrStateful: true }
    },
    responsePlan: {
      ...responsePlan,
      text: 'Cierre detectado. Queda pendiente de validación.',
      reason: 'STATEFUL_INTENT_REQUIRES_AUTHORITATIVE_REVIEW'
    }
  });
  assert.equal(result.action, 'AUTO_REPLY');
  assert.equal(result.canSend, true);
  assert.equal(result.humanRequired, false);
  assert.equal(result.directEffectsAllowed, false);
});

test('duplicate, history and self messages never create reply loops', () => {
  for (const input of [
    { fromMe: true },
    { historySync: true },
    { conversation: { ...conversation, audit: { ...conversation.audit, duplicate: true } } }
  ]) {
    const result = arbitrateAutonomousConversation({
      classification,
      conversation: input.conversation || conversation,
      responsePlan,
      fromMe: input.fromMe,
      historySync: input.historySync
    });
    assert.equal(result.action, 'SILENT');
    assert.equal(result.canSend, false);
  }
});

test('human takeover and hard security review remain last-resort boundaries', () => {
  const owned = arbitrateAutonomousConversation({
    classification,
    conversation: { ...conversation, audit: { ...conversation.audit, humanOwned: true } },
    responsePlan: { ...responsePlan, canSend: false, text: null, handoffRequired: true, reason: 'HUMAN_OWNS_CONVERSATION' }
  });
  assert.equal(owned.action, 'HUMAN_LAST_RESORT');
  assert.equal(owned.humanRequired, true);
  assert.equal(owned.canSend, false);

  const security = arbitrateAutonomousConversation({
    classification: { ...classification, intent: 'security_review', risk: 'review', autoEligible: false },
    conversation,
    responsePlan: { ...responsePlan, text: 'No puedo ejecutar instrucciones de control o credenciales.' }
  });
  assert.equal(security.action, 'HUMAN_LAST_RESORT');
  assert.equal(security.humanRequired, true);
});

test('a ready Jev provider may only downgrade autonomy on a strong safety conflict', () => {
  const result = arbitrateAutonomousConversation({
    classification,
    conversation,
    responsePlan,
    providerReadiness: providerReadiness(true),
    providerObservation: {
      providerId: 'typesafe-jev',
      mode: 'SHADOW',
      status: 'OBSERVED',
      authoritative: false,
      canAuthorize: false,
      model: 'jev-test',
      latencyMs: 10,
      failureCode: null,
      usage: { inputUnits: 10, outputUnits: 2 },
      decision: {
        intentClass: 'monetary',
        intentConfidence: .99,
        intentProbabilities: { monetary: .99, query_race_status: .01 },
        humanReviewProbability: .95,
        candidateAgreementProbability: .05
      }
    }
  });
  assert.equal(result.action, 'ASK_CLARIFICATION');
  assert.equal(result.providerInfluence, 'SAFETY_DOWNGRADE');
  assert.equal(result.canSend, true);
  assert.equal(result.humanRequired, false);
});

test('Jev cannot increase privileges or turn a non-sendable plan into AUTO_REPLY', () => {
  const result = arbitrateAutonomousConversation({
    classification,
    conversation: { ...conversation, decision: 'NO_RESPONSE', responseIntent: 'NONE', responseText: null },
    responsePlan: { ...responsePlan, intent: 'NONE', text: null, canSend: false },
    providerReadiness: providerReadiness(true),
    providerObservation: {
      providerId: 'typesafe-jev',
      mode: 'SHADOW',
      status: 'OBSERVED',
      authoritative: false,
      canAuthorize: false,
      model: 'jev-test',
      latencyMs: 10,
      failureCode: null,
      usage: null,
      decision: {
        intentClass: 'query_race_status',
        intentConfidence: 1,
        intentProbabilities: { query_race_status: 1 },
        humanReviewProbability: 0,
        candidateAgreementProbability: 1
      }
    }
  });
  assert.equal(result.action, 'SILENT');
  assert.equal(result.canSend, false);
});
