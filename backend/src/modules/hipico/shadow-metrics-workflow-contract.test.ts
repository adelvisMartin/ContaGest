import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const workflowUrl = new URL('../../../../.github/workflows/hipico-shadow-metrics-v7.yml', import.meta.url);

test('shadow metrics v7 workflow verifies exact SHA with PostgreSQL and cleanup', () => {
  assert.equal(existsSync(workflowUrl), true, 'v7 exact-SHA workflow must exist');
  const source = readFileSync(workflowUrl, 'utf8');

  assert.match(source, /name:\s*Hípico Shadow Metrics v7/);
  assert.match(source, /HIPICO_CANDIDATE_SHA:\s*\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(source, /uses:\s*actions\/checkout@v7/);
  assert.match(source, /ref:\s*["']?\$\{\{ env\.HIPICO_CANDIDATE_SHA \}\}["']?/);
  assert.match(source, /node scripts\/hipico-exact-sha-gate\.mjs/);
  assert.match(source, /node-version:\s*['"]22['"]/);
  assert.match(source, /image:\s*postgres:16/);
  assert.match(source, /npm ci --no-audit --no-fund/);
  assert.match(source, /npm --workspace backend run typecheck/);
  assert.match(source, /npm --workspace backend run test:hipico\b/);
  assert.match(source, /npm --workspace backend run test:hipico:agent/);
  assert.match(source, /npm --workspace backend run build/);
  assert.match(source, /git diff --check/);
  assert.match(source, /if:\s*always\(\)/);
  assert.match(source, /dropdb .*--if-exists/);
  assert.match(source, /HIPICO_E2E_DATABASE_URL/);
});
