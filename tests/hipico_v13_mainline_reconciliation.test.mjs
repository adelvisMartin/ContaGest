import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const inventory = JSON.parse(
  fs.readFileSync(path.join(root, 'ops/roadmap/hipico-v13-mainline-reconciliation.json'), 'utf8')
);
const ALLOWED = new Set(['PRESENT', 'MISSING', 'SUPERSEDED', 'CONFLICT']);

test('v13 inventory preserves authority invariants and valid classifications', () => {
  assert.equal(inventory.baseline, 'ab02c550f24c3347121d8c74c636b450245036ac');
  assert.equal(inventory.invariants.sourceReadOnly, true);
  assert.equal(inventory.invariants.labWriteOnlyDuringQa, true);
  assert.equal(inventory.invariants.financialAuthority, false);
  assert.equal(inventory.invariants.llmDirectDbWrites, false);
  assert.equal(inventory.invariants.llmSettlementAuthority, false);
  assert.ok(Array.isArray(inventory.entries) && inventory.entries.length > 0);
  for (const entry of inventory.entries) {
    assert.ok(ALLOWED.has(entry.classification), `invalid classification for ${entry.area}`);
    if (entry.classification === 'CONFLICT') {
      assert.ok(entry.authority, `conflict ${entry.area} must name authority`);
    }
  }
});

test('v13 reconciles v10 v11 and v12 required artifacts', () => {
  for (const file of [
    'backend/src/modules/hipico/agent-adversarial-golden.ts',
    'backend/src/modules/hipico-bot/hipico-observability.ts',
    'scripts/hipico-release-manifest-v12.mjs'
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), `missing reconciled artifact: ${file}`);
  }
});
