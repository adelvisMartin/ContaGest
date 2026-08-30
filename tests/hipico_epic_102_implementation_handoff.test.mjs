import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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
  assert.doesNotMatch(bridge, /function\s+send(?:Text)?(?:InCurrent)?Source/i);
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
