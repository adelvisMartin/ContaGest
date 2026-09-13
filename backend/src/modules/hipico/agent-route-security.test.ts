import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routes = readFileSync(new URL('./agent.routes.ts', import.meta.url), 'utf8');
const store = readFileSync(new URL('./automation.store.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../app.ts', import.meta.url), 'utf8');

test('automation routes derive audit identity from authenticated operator token and reject client actor fields by strict schema', () => {
  assert.match(routes, /operatorActorRef/);
  assert.match(routes, /modeSchema[\s\S]*\.strict\(\)/);
  assert.match(routes, /reviewSchema[\s\S]*\.strict\(\)/);
  assert.doesNotMatch(routes, /operatorId\s*:/);
  assert.match(routes, /actorRef:\s*actorRef\(\)/);
});

test('AUTOMATIC promotion cannot trust an ownerApproved boolean supplied by the request body', () => {
  const modeSchemaSource = routes.slice(routes.indexOf('const modeSchema'), routes.indexOf('const evaluateSchema'));
  assert.doesNotMatch(modeSchemaSource, /ownerApproved/);
  assert.match(routes, /automationOwnerApprovalTokenConfigured/);
  assert.match(routes, /automationOwnerApprovalTokenValid/);
  assert.match(routes, /x-hipico-owner-approval-token/);
  assert.match(routes, /target\s*!==\s*'AUTOMATIC'|target\s*===\s*'AUTOMATIC'/);
  assert.match(routes, /HIPICO_AUTOMATION_OWNER_APPROVAL_NOT_CONFIGURED/);
  assert.match(routes, /HIPICO_AUTOMATION_OWNER_APPROVAL_UNAUTHORIZED/);
});

test('automation mode mutation has bounded idempotency plus optimistic-state contract', () => {
  const modeSchemaSource = routes.slice(routes.indexOf('const modeSchema'), routes.indexOf('const evaluateSchema'));
  assert.match(routes, /const keySchema\s*=\s*z\.string\(\)\.regex\(\/\^\[A-Za-z0-9\._:-\]\{8,120\}\$\//);
  assert.match(modeSchemaSource, /expectedMode:\s*z\.enum\(AUTOMATION_STATES\)/);
  assert.match(modeSchemaSource, /requestId:\s*keySchema/);
  assert.match(modeSchemaSource, /idempotencyKey:\s*keySchema\.optional\(\)/);
  assert.match(routes, /req\.header\('idempotency-key'\)/);
  assert.match(routes, /HIPICO_AUTOMATION_IDEMPOTENCY_KEY_INVALID/);
  assert.match(routes, /HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH/);
  assert.match(routes, /HIPICO_AUTOMATION_STATE_CONFLICT/);
  assert.match(routes, /const idempotencyKey\s*=\s*headerKey\s*\|\|\s*body\.idempotencyKey\s*\|\|\s*body\.requestId/);
  assert.match(routes, /expectedMode:\s*body\.expectedMode/);
  assert.match(routes, /requestId:\s*body\.requestId/);
  assert.match(routes, /idempotencyKey/);
});

test('automation persistence serializes promotion/review and makes review immutable', () => {
  assert.match(store, /pg_advisory_xact_lock/);
  assert.match(store, /FOR UPDATE/);
  assert.match(store, /HIPICO_AGENT_EVALUATION_ALREADY_REVIEWED/);
  assert.match(store, /updated_by\s*=\s*\$\{input\.actorRef\}/);
  assert.match(store, /reviewed_by\s*=\s*\$\{input\.actorRef\}/);
});

test('automation mode transition is replay-safe and append-only audited', () => {
  assert.match(store, /hipico_automation_transitions/);
  assert.match(store, /idempotency_key/);
  assert.match(store, /request_id/);
  assert.match(store, /expected_mode/);
  assert.match(store, /HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH/);
  assert.match(store, /HIPICO_AUTOMATION_STATE_CONFLICT/);
  assert.match(store, /duplicate:\s*true/);
  assert.match(store, /duplicate:\s*false/);
  assert.match(store, /previous_mode/);
  assert.match(store, /target_mode/);
  assert.match(store, /decision_reason/);
  assert.match(store, /metrics/);
  assert.match(store, /owner_approved/);
  assert.match(store, /actor_ref/);
});

test('agent routes share the canonical Hípico limiter chain rather than creating an independent prefix', () => {
  const mount = app.match(/app\.use\(\s*'\/api\/v1\/hipico',[\s\S]*?\);/m)?.[0] || '';
  assert.match(mount, /authRateLimit/);
  assert.match(mount, /mutationRateLimit/);
  assert.match(mount, /hipicoAgentRoutes/);
  assert.equal((app.match(/'\/api\/v1\/hipico'/g) || []).length, 1);
});

test('agent evaluation API exposes evidence-only receipts and never direct monetary authority', () => {
  assert.match(routes, /actions:\s*\[\]/);
  assert.match(routes, /financialAuthority:\s*false/);
  assert.match(routes, /directEffectsApplied:\s*false/);
  assert.doesNotMatch(routes, /ledger|settlement|sendMessage|sendCloudText/);
});
