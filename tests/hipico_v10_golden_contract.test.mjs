import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const v1 = 'backend/src/modules/hipico-bot/corpus/hipico-parser-corpus.v1.json';
const v10 = 'backend/src/modules/hipico/corpus/hipico-agent-adversarial.v10.json';
const runner = 'backend/scripts/hipico-agent-golden-v10.ts';
const workflow = '.github/workflows/hipico-golden-adversarial-v10.yml';

function read(path) {
  return readFileSync(path, 'utf8');
}

test('historical parser corpus v1 remains byte-for-byte unchanged', () => {
  assert.equal(existsSync(v1), true);
  const blob = execFileSync('git', ['hash-object', v1], { encoding: 'utf8' }).trim();
  assert.equal(blob, '03813ed7ae986875aa89b1f06be21020442eaac0');
});

test('v10 adversarial corpus is sanitized, versioned and separates expected policy authority', () => {
  assert.equal(existsSync(v10), true, 'v10 corpus missing');
  const corpus = JSON.parse(read(v10));
  assert.equal(corpus.schemaVersion, 1);
  assert.equal(corpus.corpusVersion, 'hipico-agent-adversarial-v10');
  assert.equal(corpus.sanitized, true);
  assert.match(corpus.parserVersion, /^hipico-agent-/);
  assert.match(corpus.policyVersion, /^hipico-risk-policy-/);
  assert.ok(corpus.cases.length >= 12);
  assert.equal(new Set(corpus.cases.map((entry) => entry.id)).size, corpus.cases.length);
  for (const entry of corpus.cases) {
    assert.equal(typeof entry.text, 'string');
    assert.ok(entry.text.length > 0);
    assert.ok(['safe', 'review', 'monetary'].includes(entry.expected.risk));
    assert.ok(['AUTO', 'SUGGEST', 'HUMAN_REQUIRED', 'DENY'].includes(entry.expected.disposition));
    if (entry.expected.risk !== 'safe') {
      assert.notEqual(entry.expected.disposition, 'AUTO', `${entry.id} cannot expect AUTO`);
      assert.equal(entry.expected.canAct, false, `${entry.id} cannot expect autonomous action`);
    }
  }
});

test('v10 evidence runner is exact-SHA bound and fails on unsafe automatic decisions', () => {
  assert.equal(existsSync(runner), true, 'v10 runner missing');
  const source = read(runner);
  assert.match(source, /HIPICO_CANDIDATE_SHA/);
  assert.match(source, /golden-adversarial\.json/);
  assert.match(source, /unsafeAuto/);
  assert.match(source, /highRiskAuto/);
  assert.match(source, /process\.exitCode\s*=\s*1/);
  assert.match(source, /financialAuthority/);
});

test('v10 workflow executes exact candidate, root contracts, evidence scorer, build and diff check', () => {
  assert.equal(existsSync(workflow), true, 'v10 workflow missing');
  const source = read(workflow);
  for (const marker of [
    'github.event.pull_request.head.sha || github.sha',
    'actions/checkout@v7',
    'node-version:',
    'npm ci --no-audit --no-fund',
    'npm --workspace backend run typecheck',
    'npm run test:hipico',
    'hipico-agent-golden-v10.ts',
    'npm --workspace backend run build',
    'git diff --check',
    'hipico-v10-golden-'
  ]) assert.ok(source.includes(marker), `workflow marker missing: ${marker}`);
  assert.doesNotMatch(source, /continue-on-error:\s*true/);
  assert.doesNotMatch(source, /\|\|\s*true/);
});
