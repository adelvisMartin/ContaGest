import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreAdversarialGoldenCorpus } from './agent-adversarial-golden.js';

const corpus = {
  schemaVersion: 1,
  corpusVersion: 'hipico-agent-adversarial-v10-test',
  parserVersion: 'deterministic-test-v1',
  policyVersion: 'policy-test-v1',
  sanitized: true,
  cases: [
    {
      id: 'safe-next',
      category: 'safe_query',
      text: 'safe',
      expected: { intent: 'query:NEXT_RACE', risk: 'safe', tool: 'queryNextRace', disposition: 'AUTO', canAct: true }
    },
    {
      id: 'security-deny',
      category: 'prompt_injection',
      text: 'deny',
      expected: { intent: 'security_review', risk: 'review', tool: null, disposition: 'DENY', canAct: false }
    },
    {
      id: 'unsafe-regression',
      category: 'monetary',
      text: 'unsafe',
      expected: { intent: 'betting_or_balance', risk: 'monetary', tool: null, disposition: 'DENY', canAct: false }
    }
  ]
};

const fakeEngine = {
  async evaluate(text: string) {
    if (text === 'safe') {
      return {
        candidate: { intent: 'query:NEXT_RACE', risk: 'safe', tool: 'queryNextRace', confidence: .999, source: 'deterministic' },
        canAct: true,
        riskPolicy: { disposition: 'AUTO', financialAuthority: false }
      };
    }
    if (text === 'deny') {
      return {
        candidate: { intent: 'security_review', risk: 'review', tool: null, confidence: .999, source: 'deterministic' },
        canAct: false,
        riskPolicy: { disposition: 'DENY', financialAuthority: false }
      };
    }
    return {
      candidate: { intent: 'security_review', risk: 'monetary', tool: null, confidence: .99, source: 'deterministic' },
      canAct: true,
      riskPolicy: { disposition: 'AUTO', financialAuthority: false }
    };
  }
};

test('adversarial scorer separates exact matches from unsafe automatic authority', async () => {
  const result = await scoreAdversarialGoldenCorpus(corpus, fakeEngine as any);
  assert.equal(result.total, 3);
  assert.equal(result.matched, 2);
  assert.equal(result.unsafeAuto, 1);
  assert.equal(result.highRiskAuto, 1);
  assert.equal(result.byCategory.safe_query.matched, 1);
  assert.equal(result.byCategory.monetary.unsafeAuto, 1);
  assert.equal(result.byIntent['betting_or_balance'].highRiskAuto, 1);
  assert.equal(result.byIntent['betting_or_balance'].recall, 0);
  assert.equal(result.byIntent['security_review'].precision, .5);
  assert.equal(result.byIntent['security_review'].recall, 1);
  assert.match(result.signature, /^[0-9a-f]{64}$/);

  const repeated = await scoreAdversarialGoldenCorpus(corpus, fakeEngine as any);
  assert.equal(repeated.signature, result.signature);
});

test('adversarial scorer validates corpus metadata and unique bounded cases', async () => {
  await assert.rejects(
    () => scoreAdversarialGoldenCorpus({ ...corpus, sanitized: false }, fakeEngine as any),
    /HIPICO_ADVERSARIAL_CORPUS_INVALID/
  );
  await assert.rejects(
    () => scoreAdversarialGoldenCorpus({ ...corpus, cases: [corpus.cases[0], corpus.cases[0]] }, fakeEngine as any),
    /HIPICO_ADVERSARIAL_CASE_INVALID/
  );
});
