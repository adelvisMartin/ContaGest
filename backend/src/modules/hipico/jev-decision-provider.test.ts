import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentCandidate } from './agent-contracts.js';
import {
  JEV_ENDPOINT,
  JevDecisionProvider,
  jevDecisionProviderConfig
} from './jev-decision-provider.js';

const candidate: AgentCandidate = {
  intent: 'query:NEXT_RACE',
  confidence: .995,
  tool: 'queryNextRace',
  arguments: { text: '¿Cuál es la próxima carrera?' },
  risk: 'safe',
  source: 'deterministic',
  modelVersion: null
};

function shadowEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    HIPICO_JEV_MODE: 'shadow',
    HIPICO_JEV_MODEL: 'jev-latest',
    HIPICO_JEV_DATA_SHARING_APPROVED: 'true',
    TYPESAFE_API_KEY: 't'.repeat(48),
    ...overrides
  };
}

test('Jev provider is OFF by default and never calls the network', async () => {
  let calls = 0;
  const provider = new JevDecisionProvider({}, (async () => {
    calls += 1;
    throw new Error('network must not be called');
  }) as typeof fetch);

  assert.deepEqual(provider.publicStatus(), {
    providerId: 'typesafe-jev',
    mode: 'OFF',
    enabled: false,
    configured: false,
    authoritative: false,
    reasons: ['MODE_OFF']
  });

  const result = await provider.observe({ text: 'estado', candidate });
  assert.equal(result.status, 'SKIPPED');
  assert.equal(result.authoritative, false);
  assert.equal(result.canAuthorize, false);
  assert.equal(result.failureCode, 'MODE_OFF');
  assert.equal(calls, 0);
});

test('SHADOW requires a strong server-side key and explicit data-sharing approval', () => {
  const missingApproval = jevDecisionProviderConfig(shadowEnv({ HIPICO_JEV_DATA_SHARING_APPROVED: 'false' }));
  assert.equal(missingApproval.enabled, false);
  assert.deepEqual(missingApproval.reasons, ['DATA_SHARING_NOT_APPROVED']);

  const missingKey = jevDecisionProviderConfig(shadowEnv({ TYPESAFE_API_KEY: '' }));
  assert.equal(missingKey.enabled, false);
  assert.deepEqual(missingKey.reasons, ['API_KEY_NOT_CONFIGURED']);

  const configured = jevDecisionProviderConfig(shadowEnv());
  assert.equal(configured.enabled, true);
  assert.equal(configured.mode, 'SHADOW');
  assert.deepEqual(configured.reasons, []);
});

test('Jev SHADOW records typed evidence but can never authorize an action', async () => {
  let requestBody: any = null;
  let authorization = '';
  const provider = new JevDecisionProvider(shadowEnv(), (async (input: any, init?: RequestInit) => {
    assert.equal(String(input), JEV_ENDPOINT);
    authorization = String((init?.headers as Record<string, string>)?.authorization || '');
    requestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({
      model: 'jev-2026-09-15',
      answers: {
        intent_class: {
          type: 'choice',
          choice: 'query_next_race',
          confidence: .98,
          probabilities: {
            query_race_status: .01,
            query_next_race: .98,
            query_last_result: 0,
            query_schedule: 0,
            query_scratches: 0,
            lifecycle: 0,
            monetary: 0,
            security: 0,
            greeting_help: 0,
            unknown: .01
          }
        },
        requires_human_review: { type: 'noul', noul: .04 },
        agrees_with_candidate: { type: 'noul', noul: .99 }
      },
      usage: { input_tokens: 120, output_tokens: 3 }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch);

  const result = await provider.observe({ text: '¿Cuál es la próxima carrera?', candidate });

  assert.equal(authorization, `Bearer ${'t'.repeat(48)}`);
  assert.equal(requestBody.model, 'jev-latest');
  assert.equal(requestBody.state.constraints.shadow_only, true);
  assert.equal(requestBody.state.constraints.financial_authority, false);
  assert.equal(requestBody.state.deterministic_candidate.intent, 'query:NEXT_RACE');
  assert.equal(requestBody.questions.intent_class.type, 'choice');

  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.authoritative, false);
  assert.equal(result.canAuthorize, false);
  assert.equal(result.model, 'jev-2026-09-15');
  assert.equal(result.decision?.intentClass, 'query_next_race');
  assert.equal(result.decision?.intentConfidence, .98);
  assert.equal(result.decision?.humanReviewProbability, .04);
  assert.equal(result.decision?.candidateAgreementProbability, .99);
  assert.deepEqual(result.usage, { inputUnits: 120, outputUnits: 3 });
});

test('provider failure and malformed output fail closed without replacing deterministic authority', async () => {
  const unavailable = new JevDecisionProvider(shadowEnv(), (async () => {
    throw new Error('provider exploded with sensitive upstream detail');
  }) as typeof fetch);
  const failed = await unavailable.observe({ text: 'mensaje', candidate });
  assert.equal(failed.status, 'UNAVAILABLE');
  assert.equal(failed.failureCode, 'JEV_PROVIDER_UNAVAILABLE');
  assert.equal(failed.decision, null);
  assert.equal(failed.canAuthorize, false);

  const malformed = new JevDecisionProvider(shadowEnv(), (async () => new Response(JSON.stringify({
    model: 'jev-latest',
    answers: {
      intent_class: {
        type: 'choice',
        choice: 'invented_authorize_money',
        confidence: 1,
        probabilities: { invented_authorize_money: 1 }
      },
      requires_human_review: { type: 'noul', noul: 0 },
      agrees_with_candidate: { type: 'noul', noul: 1 }
    },
    usage: { input_tokens: 1, output_tokens: 1 }
  }), { status: 200 })) as typeof fetch);

  const invalid = await malformed.observe({ text: 'juego 100 al 4', candidate: { ...candidate, risk: 'monetary' } });
  assert.equal(invalid.status, 'UNAVAILABLE');
  assert.equal(invalid.failureCode, 'JEV_RESPONSE_SCHEMA_INVALID');
  assert.equal(invalid.canAuthorize, false);
  assert.equal(invalid.authoritative, false);
});


test('observed Jev evidence remains compatible with the agent evidence secret sanitizer', async () => {
  const provider = new JevDecisionProvider(shadowEnv(), (async () => new Response(JSON.stringify({
    model: 'jev-2026-09-15',
    answers: {
      intent_class: {
        type: 'choice',
        choice: 'query_next_race',
        confidence: .99,
        probabilities: {
          query_race_status: 0,
          query_next_race: .99,
          query_last_result: 0,
          query_schedule: 0,
          query_scratches: 0,
          lifecycle: 0,
          monetary: 0,
          security: 0,
          greeting_help: 0,
          unknown: .01
        }
      },
      requires_human_review: { type: 'noul', noul: .02 },
      agrees_with_candidate: { type: 'noul', noul: .99 }
    },
    usage: { input_tokens: 44, output_tokens: 3 }
  }), { status: 200 })) as typeof fetch);
  const { sanitizeAgentEvidence } = await import('./automation-evidence.js');
  const observation = await provider.observe({ text: '¿Cuál sigue?', candidate });
  assert.equal(observation.status, 'OBSERVED');
  assert.doesNotThrow(() => sanitizeAgentEvidence({ decisionProvider: observation }));
});
