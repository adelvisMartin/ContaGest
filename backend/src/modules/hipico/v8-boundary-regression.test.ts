import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const outboxStore = readFileSync(new URL('../hipico-bot/hipico-outbox.store.ts', import.meta.url), 'utf8');
const outboxPolicy = readFileSync(new URL('../hipico-bot/hipico-outbox-policy.ts', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../hipico-bot/hipico-outbound-runner.ts', import.meta.url), 'utf8');
const commandCenter = readFileSync(new URL('./command-center.routes.ts', import.meta.url), 'utf8');
const agentRoutes = readFileSync(new URL('./agent.routes.ts', import.meta.url), 'utf8');
const automationStore = readFileSync(new URL('./automation.store.ts', import.meta.url), 'utf8');

test('v8 preserves the canonical production outbox authority and generic approval boundary', () => {
  assert.match(outboxStore, /public\.hipico_outbox/);
  assert.match(outboxStore, /public\.hipico_outbox_receipts/);
  assert.match(outboxStore, /COALESCE\(o\.payload->>'approvalRequired','false'\)<>'true'/);
  assert.match(outboxStore, /FOR UPDATE SKIP LOCKED/);
});

test('v8 preserves ambiguous-delivery reconciliation and monotonic delivery states', () => {
  assert.match(outboxPolicy, /HIPICO_CLOUD_DELIVERY_AMBIGUOUS/);
  assert.match(outboxPolicy, /status===408/);
  assert.match(outboxPolicy, /status>=500/);
  assert.match(outboxPolicy, /action:'reconciliation_required'/);
  assert.match(outboxPolicy, /accepted:1,sent:2,delivered:3,read:4/);
});

test('v8 keeps the outbound runner disabled by default and non-approval claims fail-closed', () => {
  assert.match(runner, /HIPICO_OUTBOX_WORKER_ENABLED/);
  assert.match(runner, /\.toLowerCase\(\)==='true'/);
  assert.match(runner, /allowApprovalRequired:false/);
});

test('v8 leaves Command Center and automation safety contracts intact', () => {
  assert.match(commandCenter, /router\.get\('\/command-center'/);
  assert.match(commandCenter, /buildHipicoCommandCenter/);
  assert.match(commandCenter, /Cache-Control', 'no-store, max-age=0'/);
  assert.match(agentRoutes, /financialAuthority:\s*false/);
  assert.match(agentRoutes, /directEffectsApplied:\s*false/);
  assert.match(automationStore, /SOURCE_SHADOW_ONLY/);
  assert.doesNotMatch(agentRoutes, /financialAuthority:\s*true/);
});
