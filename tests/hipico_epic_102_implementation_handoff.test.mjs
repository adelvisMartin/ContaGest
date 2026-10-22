import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateSourceAutoReplyPolicy, SOURCE_AUTO_REPLY_POLICY_NO_GO } from '../tools/hipico-whatsapp-web-bridge/src/source-policy-gate.mjs';

const handoff = JSON.parse(fs.readFileSync('ops/roadmap/hipico-implementation-handoff-v102.json', 'utf8'));

test('EPIC #102 implementation inventory is materially present', () => {
  const missing = [];
  for (const [issue, files] of Object.entries(handoff.implementationInventory)) {
    for (const file of files) if (!fs.existsSync(file)) missing.push(`${issue}: ${file}`);
  }
  assert.deepEqual(missing, [], `Missing Hípico implementation files:\n${missing.join('\n')}`);
});

test('implementation handoff never masquerades as release verification', () => {
  assert.equal(handoff.implementationPhaseComplete, true);
  assert.equal(handoff.verified, false);
  assert.equal(handoff.releaseReady, false);
  assert.equal(handoff.productionWriteAllowed, false);
  assert.equal(handoff.sourceMode, 'READ_ONLY');
  assert.equal(handoff.complianceDecision, 'NO_GO');
  assert.deepEqual(handoff.qaExecutionPending, [119, 120]);
});

test('production boundaries remain fail-closed after implementation phase', () => {
  const bridge = fs.readFileSync('tools/hipico-whatsapp-web-bridge/src/index.mjs', 'utf8');
  const promotion = fs.readFileSync('backend/src/modules/hipico-bot/hipico-promotion-gate.ts', 'utf8');
  const compliance = fs.readFileSync('backend/src/modules/hipico-bot/hipico-production-compliance.ts', 'utf8');
  const transport = fs.readFileSync('backend/src/modules/hipico-bot/hipico-whatsapp-transport.ts', 'utf8');

  assert.match(bridge, /FUENTE: SOLO LECTURA|SOURCE.*READ.?ONLY/i);
  // Dormant SOURCE reply machinery exists, but no environment flag may
  // authorize Messenger auto-send without legal/policy approval.
  const config = fs.readFileSync('tools/hipico-whatsapp-web-bridge/src/runtime-config.mjs', 'utf8');
  assert.match(config, /sourceAutoReplyEnabled:\s*boolEnv\(env,\s*'HIPICO_SOURCE_AUTO_REPLY_ENABLED',\s*false\)/);
  assert.match(config, /SOURCE_AUTO_REPLY_POLICY_NO_GO/);
  const policy = evaluateSourceAutoReplyPolicy({ sourceAutoReplyEnabled: true });
  assert.equal(policy.status, 'NO_GO');
  assert.equal(policy.eligible, false);
  assert.equal(policy.policyCode, SOURCE_AUTO_REPLY_POLICY_NO_GO);
  assert.ok(policy.reasons.includes('MESSENGER_AUTOMATED_MESSAGING_NOT_AUTHORIZED'));
  assert.match(bridge, /const SOURCE_AUTO_REPLY_ACTIVE = SOURCE_AUTO_REPLY_ENABLED && !SOURCE_REPLY_KILL_SWITCH\.active/);
  assert.match(bridge, /if \(!SOURCE_AUTO_REPLY_ACTIVE\) \{\s*const error = new Error\('SOURCE_AUTO_REPLY_DISABLED'\)/);
  assert.match(promotion, /shadow/i);
  assert.match(compliance, /NO_GO|NO-GO|no_go/i);
  assert.match(transport, /DisabledProductionTransport|production/i);
});

test('QA execution gates have concrete harnesses before handoff', () => {
  assert.ok(fs.existsSync('scripts/hipico-physical-qa-v119.mjs'));
  assert.ok(fs.existsSync('products/hipico-control/physical-qa-v119.json'));
  assert.ok(fs.existsSync('backend/scripts/hipico-soak-v120.ts'));
  assert.ok(fs.existsSync('backend/src/modules/hipico-bot/hipico-soak-policy.ts'));
});
