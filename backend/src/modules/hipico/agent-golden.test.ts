import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deterministicAgentParser } from './agent-engine.js';
import { agentCanAct, type AgentCandidate } from './agent-policy.js';

type GoldenCase = { id: string; text: string; expectedIntent: string; risk: 'safe'|'review'|'monetary' };
const corpus = JSON.parse(readFileSync(new URL('../../../../qa/fixtures/hipico-agent-golden-v1.json', import.meta.url), 'utf8')) as {
  version: string;
  cases: GoldenCase[];
};

void test('versioned Shadow golden corpus stays deterministic and non-authoritative', () => {
  assert.match(corpus.version, /^1\./);
  assert.ok(corpus.cases.length >= 20);

  for (const row of corpus.cases) {
    const parsed = deterministicAgentParser.parse(row.text);
    assert.equal(parsed.intent, row.expectedIntent, `${row.id}: intent drift`);
    assert.equal(parsed.risk, row.risk, `${row.id}: risk drift`);

    const candidate: AgentCandidate = {
      ...parsed,
      source: 'deterministic',
      modelVersion: null
    };
    assert.equal(agentCanAct('SHADOW', candidate), false, `${row.id}: Shadow must never act`);
    if (row.risk !== 'safe') assert.equal(agentCanAct('AUTOMATIC', candidate), false, `${row.id}: unsafe candidate must never auto-act`);
  }
});

void test('prompt-injection corpus remains review-only with no executable tool request', () => {
  for (const row of corpus.cases.filter((entry) => entry.id.startsWith('injection-'))) {
    const parsed = deterministicAgentParser.parse(row.text);
    assert.equal(parsed.risk, 'review');
    assert.equal(parsed.tool, null);
  }
});
