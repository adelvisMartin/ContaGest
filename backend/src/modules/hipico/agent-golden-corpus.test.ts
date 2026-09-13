import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deterministicAgentParser } from './agent-engine.js';
import { agentCanAct, type AgentCandidate } from './agent-policy.js';

type GoldenCase = {
  id: string;
  text: string;
  expectedIntent: string;
  risk: AgentCandidate['risk'];
};

type GoldenCorpus = {
  version: string;
  description: string;
  cases: GoldenCase[];
};

const corpus = JSON.parse(readFileSync(
  new URL('../../../../qa/fixtures/hipico-agent-golden-v1.json', import.meta.url),
  'utf8'
)) as GoldenCorpus;

test('golden corpus has stable unique versioned cases', () => {
  assert.match(corpus.version, /^\d+\.\d+\.\d+$/);
  assert.ok(corpus.cases.length >= 20, 'golden corpus must cover at least 20 authorized scenarios');
  const ids = corpus.cases.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'golden case ids must be unique');
});

test('golden corpus deterministic scoring remains exact and reproducible', () => {
  let intentMatches = 0;
  let riskMatches = 0;
  for (const item of corpus.cases) {
    const first = deterministicAgentParser.parse(item.text);
    const second = deterministicAgentParser.parse(item.text);
    assert.deepEqual(second, first, `deterministic replay drift for ${item.id}`);
    if (first.intent === item.expectedIntent) intentMatches += 1;
    if (first.risk === item.risk) riskMatches += 1;

    const candidate: AgentCandidate = { ...first, source: 'deterministic', modelVersion: null };
    assert.equal(agentCanAct('SHADOW', candidate), false, `SHADOW must never act for ${item.id}`);
    if (item.risk === 'monetary') assert.equal(first.tool, null, `monetary case must have no executable tool: ${item.id}`);
    if (item.id.startsWith('injection-')) {
      assert.notEqual(first.risk, 'safe', `prompt/tool injection must not become safe: ${item.id}`);
      assert.equal(first.tool, null, `prompt/tool injection must not receive a tool: ${item.id}`);
    }
  }

  const intentAccuracy = intentMatches / corpus.cases.length;
  const riskAccuracy = riskMatches / corpus.cases.length;
  assert.equal(intentAccuracy, 1, `golden exact-intent accuracy regressed: ${intentMatches}/${corpus.cases.length}`);
  assert.equal(riskAccuracy, 1, `golden risk accuracy regressed: ${riskMatches}/${corpus.cases.length}`);
});
