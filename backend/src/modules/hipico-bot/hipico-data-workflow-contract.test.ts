import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../../../.github/workflows/hipico-data-engines.yml', import.meta.url), 'utf8');

test('data-engine workflow is triggered by the shared race-provider implementation and its regressions', () => {
  assert.match(workflow, /backend\/src\/modules\/hipico-bot\/hipico-race-provider\*\.ts/);
  assert.match(workflow, /backend\/src\/modules\/hipico\/\*\*/);
  assert.match(workflow, /npm run test:hipico/);
});

test('data-engine workflow keeps cleanup explicit and never masks teardown errors with shell success fallbacks', () => {
  assert.doesNotMatch(workflow, /\|\|\s*true/);
  assert.doesNotMatch(workflow, /continue-on-error\s*:\s*true/i);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /dropdb/);
});

test('data-engine workflow uses an isolated PostgreSQL database and exact candidate checkout', () => {
  assert.match(workflow, /HIPICO_CANDIDATE_SHA/);
  assert.match(workflow, /ref:\s*\$\{\{\s*env\.HIPICO_CANDIDATE_SHA\s*\}\}/);
  assert.match(workflow, /hipico_e2e_\$\{GITHUB_RUN_ID\}_\$\{GITHUB_RUN_ATTEMPT\}/);
  assert.match(workflow, /postgres:16/);
  assert.match(workflow, /npm --workspace backend run test:hipico:data/);
});
