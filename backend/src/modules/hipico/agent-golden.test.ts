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

void test('v7 golden reporting adds abstentions and per-intent aggregates without changing signature semantics', async () => {
  const { scoreGoldenCorpus } = await import('./agent-golden.js');
  const corpus = JSON.parse(readFileSync(corpusUrl, 'utf8'));
  const baseline = scoreGoldenCorpus(corpus, deterministicAgentParser);

  assert.equal(baseline.abstentions, baseline.cases.filter((entry: { predictedIntent: string }) => entry.predictedIntent === 'unknown').length);
  assert.ok(baseline.abstentions >= 1);
  assert.ok(baseline.byIntent && typeof baseline.byIntent === 'object');
  assert.deepEqual(Object.keys(baseline.byIntent), [...Object.keys(baseline.byIntent)].sort());

  const nextRace = baseline.byIntent['query:NEXT_RACE'];
  assert.equal(nextRace.total, 1);
  assert.equal(nextRace.matched, 1);
  assert.equal(nextRace.highRiskFalsePositive, 0);
  assert.equal(nextRace.unauthorizedAutomaticAction, 0);
  assert.equal(nextRace.abstentions, 0);

  const ambiguous = baseline.byIntent.unknown;
  assert.equal(ambiguous.total, 1);
  assert.equal(ambiguous.matched, 1);
  assert.equal(ambiguous.abstentions, 1);

  const repeat = scoreGoldenCorpus(corpus, deterministicAgentParser);
  assert.equal(repeat.signature, baseline.signature, 'existing deterministic signature contract must remain stable');
  assert.deepEqual(repeat.byIntent, baseline.byIntent);
});
