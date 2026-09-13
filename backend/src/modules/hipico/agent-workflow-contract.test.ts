import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const workflowUrl = new URL('../../../../.github/workflows/hipico-agent-shadow.yml', import.meta.url);

void test('agent/shadow gate validates the exact candidate with real ephemeral PostgreSQL', () => {
  assert.equal(existsSync(workflowUrl), true, 'agent/shadow workflow must exist');
  const workflow = readFileSync(workflowUrl, 'utf8');
  assert.match(workflow, /pull_request\s*:/);
  assert.match(workflow, /HIPICO_CANDIDATE_SHA/);
  assert.match(workflow, /ref:\s*\$\{\{\s*env\.HIPICO_CANDIDATE_SHA\s*\}\}/);
  assert.match(workflow, /postgres:16/);
  assert.match(workflow, /hipico_agent_e2e_\$\{GITHUB_RUN_ID\}_\$\{GITHUB_RUN_ATTEMPT\}/);
  assert.match(workflow, /npm --workspace backend run typecheck/);
  assert.match(workflow, /npm --workspace backend run test:hipico/);
  assert.match(workflow, /npm --workspace backend run test:hipico:agent/);
  assert.match(workflow, /npm --workspace backend run build/);
  assert.match(workflow, /hipico-exact-sha-gate\.mjs/);
});

void test('agent/shadow workflow path filter covers the actual agent route and persistence boundary', () => {
  const workflow = readFileSync(workflowUrl, 'utf8');
  assert.match(workflow, /backend\/src\/modules\/hipico\/agent\.routes\.ts/);
  assert.match(workflow, /backend\/src\/modules\/hipico\/automation\.store\.ts/);
  assert.match(workflow, /supabase\/sql\/hipico_v22_agent_shadow\.sql/);
});

void test('agent/shadow runtime smoke uses an operator token that satisfies production secret policy', () => {
  const workflow = readFileSync(workflowUrl, 'utf8');
  const envMatch = workflow.match(/HIPICO_OPERATOR_CONTROL_TOKEN=([^"\n]+)/);
  assert.ok(envMatch?.[1], 'workflow must configure the operator token used by runtime smoke');
  const token = String(envMatch[1]).trim();
  assert.ok(Buffer.byteLength(token, 'utf8') >= 32, 'runtime smoke token must satisfy the 32-byte production minimum');
  assert.doesNotMatch(token, /CHANGE[_-]?ME|PLACEHOLDER|EXAMPLE|YOUR[_-]?(?:SECRET|TOKEN|KEY)/i);
  assert.ok(workflow.includes(`x-hipico-operator-token: ${token}`), 'runtime request must use exactly the configured token');
});

void test('agent/shadow gate remains fail-closed during cleanup', () => {
  const workflow = readFileSync(workflowUrl, 'utf8');
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /dropdb/);
  assert.doesNotMatch(workflow, /continue-on-error\s*:\s*true/i);
  assert.doesNotMatch(workflow, /\|\|\s*true/);
});