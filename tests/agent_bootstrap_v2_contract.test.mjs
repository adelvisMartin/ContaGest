import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

test('agent:bootstrap offline JSON exposes the canonical concise schema without live-state invention', () => {
  const run = spawnSync(process.execPath, [
    'scripts/agent-bootstrap.mjs',
    '--json',
    '--offline',
    '--files',
    'AGENTS.md,.agents/context/BOOTSTRAP.md',
  ], { encoding: 'utf8' });

  assert.equal(run.status, 0, run.stderr);
  const output = JSON.parse(run.stdout);
  assert.equal(output.marker, 'CONTAGEST_AGENT_BOOTSTRAP');
  for (const key of [
    'repoRoot',
    'branch',
    'headSha',
    'mainSha',
    'mainDrift',
    'liveState',
    'selectedWorkItem',
    'workClaims',
    'graphify',
    'riskDomains',
    'agentProfiles',
    'skills',
    'gates',
    'nextAction',
  ]) assert.ok(key in output, `missing ${key}`);

  assert.equal(output.liveState.status, 'BLOCKED_LIVE_STATE');
  assert.ok(['CURRENT', 'STALE', 'UNAVAILABLE'].includes(output.graphify.status));
  assert.ok(Array.isArray(output.riskDomains));
  assert.ok(Array.isArray(output.agentProfiles));
  assert.ok(Array.isArray(output.skills));
  assert.ok(Array.isArray(output.gates));
});

test('bootstrap help documents discovery-only behavior', () => {
  const run = spawnSync(process.execPath, ['scripts/agent-bootstrap.mjs', '--help'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /discovery-only/i);
  assert.match(run.stdout, /does not mutate GitHub/i);
});

test('bootstrap paginates open pull requests instead of truncating live claim discovery at 100', () => {
  const source = fs.readFileSync('scripts/agent-bootstrap.mjs', 'utf8');
  assert.match(source, /githubAllPages/);
  assert.match(source, /per_page=100&page=\$\{page\}/);
  assert.match(source, /pulls\?state=open/);
});
