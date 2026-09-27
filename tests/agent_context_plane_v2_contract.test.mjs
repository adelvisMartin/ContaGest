import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

const CONTEXT_FILES = [
  '.agents/context/BOOTSTRAP.md',
  '.agents/context/CONTEXT_CONTRACT.md',
  '.agents/context/WORK_QUEUE.json',
  '.agents/context/PROJECT_MAP.json',
];

test('context plane exposes the four canonical cold-start artifacts', () => {
  for (const file of CONTEXT_FILES) {
    assert.equal(exists(file), true, `missing ${file}`);
  }
});

test('work queue is ordering metadata, not duplicated issue bodies', () => {
  const queue = JSON.parse(read('.agents/context/WORK_QUEUE.json'));
  assert.equal(queue.schemaVersion, 1);
  assert.equal(queue.source, 'github-live');
  assert.equal(queue.metaIssue, 553);
  assert.ok(Array.isArray(queue.queue));
  assert.ok(queue.queue.every(Number.isInteger));
  assert.equal('issues' in queue, false);
  assert.equal('descriptions' in queue, false);
});

test('bootstrap requires live state, duplicate-claim check, graph freshness and risk routing', () => {
  const bootstrap = read('.agents/context/BOOTSTRAP.md');
  for (const marker of [
    'AGENTS.md',
    'WORK_QUEUE.json',
    'GitHub',
    'DUPLICATE_WORK_CLAIM',
    'Graphify',
    'agent:gates',
    '2–4',
    'PASS',
    'FAIL',
    'BLOCKED',
    'NOT_EXECUTED',
  ]) {
    assert.match(bootstrap, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('stable context files never pin a current runtime SHA as authority', () => {
  const stable = `${read('.agents/context/BOOTSTRAP.md')}\n${read('.agents/context/PROJECT_MAP.json')}`;
  const fullSha = /\b[0-9a-f]{40}\b/gi;
  assert.deepEqual(stable.match(fullSha) ?? [], []);
  assert.match(stable, /live|runtime|resolve/i);
});

test('project map points to canonical repository authorities only', () => {
  const map = JSON.parse(read('.agents/context/PROJECT_MAP.json'));
  assert.equal(map.schemaVersion, 1);
  assert.equal(map.authority, 'stable-navigation-only');
  for (const key of ['platform', 'financial', 'commercial', 'operations', 'verticals', 'qa', 'agents']) {
    assert.ok(map[key], `missing project map section ${key}`);
  }
  assert.equal('currentSha' in map, false);
  assert.equal('openIssues' in map, false);
});
