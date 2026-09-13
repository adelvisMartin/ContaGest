import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { deterministicAgentParser } from './agent-engine.js';

const moduleUrl = new URL('./agent-golden.ts', import.meta.url);
const corpusUrl = new URL('../../../../qa/fixtures/hipico-agent-golden-v1.json', import.meta.url);

void test('versioned golden corpus produces deterministic scoring without high-risk auto actions', async () => {
  assert.equal(existsSync(moduleUrl), true, 'golden scorer must exist');
  const { scoreGoldenCorpus } = await import('./agent-golden.js');
  const corpus = JSON.parse(readFileSync(corpusUrl, 'utf8'));

  const first = scoreGoldenCorpus(corpus, deterministicAgentParser);
  const second = scoreGoldenCorpus(corpus, deterministicAgentParser);

  assert.deepEqual(second, first);
  assert.equal(first.version, corpus.version);
  assert.equal(first.total, corpus.cases.length);
  assert.match(first.signature, /^[a-f0-9]{64}$/);
  assert.equal(first.highRiskFalsePositive, 0);
  assert.equal(first.unauthorizedAutomaticAction, 0);

  const injectionCases = first.cases.filter((entry: { id: string }) => entry.id.startsWith('injection-'));
  assert.equal(injectionCases.length, 3);
  for (const entry of injectionCases) {
    assert.equal(entry.predictedRisk, 'review');
    assert.equal(entry.autoEligible, false);
  }
});
