import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const inventory = JSON.parse(read('ops/roadmap/hipico-v13-mainline-reconciliation.json'));
const ALLOWED = new Set(['PRESENT', 'SUPERSEDED']);

test('v13 inventory preserves authority invariants and has no unresolved historical area', () => {
  assert.equal(inventory.baseline, 'ab02c550f24c3347121d8c74c636b450245036ac');
  assert.equal(inventory.historicalMergeBase, 'd40a00134104bd7f6ad3d72e9b6ff267a7b94f75');
  assert.equal(inventory.invariants.sourceReadOnly, true);
  assert.equal(inventory.invariants.labWriteOnlyDuringQa, true);
  assert.equal(inventory.invariants.financialAuthority, false);
  assert.equal(inventory.invariants.llmDirectDbWrites, false);
  assert.equal(inventory.invariants.llmSettlementAuthority, false);
  assert.ok(Array.isArray(inventory.entries) && inventory.entries.length >= 7);
  for (const entry of inventory.entries) {
    assert.ok(ALLOWED.has(entry.classification), `unresolved classification for ${entry.area}: ${entry.classification}`);
    assert.ok(entry.authority, `${entry.area} must name current authority`);
    assert.ok(entry.decision, `${entry.area} must document reconciliation decision`);
  }
});

test('v13 contains the required v9-v12 production artifacts', () => {
  for (const file of [
    '.github/workflows/hipico-production-gates-v290.yml',
    'scripts/hipico-release-readiness-v9.mjs',
    'backend/src/modules/hipico/agent-adversarial-golden.ts',
    '.github/workflows/hipico-golden-adversarial-v10.yml',
    'backend/src/modules/hipico-bot/hipico-observability.ts',
    'supabase/sql/hipico_v25_observability.sql',
    '.github/workflows/hipico-observability-v11.yml',
    'scripts/hipico-release-manifest-v12.mjs',
    '.github/workflows/hipico-production-release-v12.yml'
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), `missing reconciled artifact: ${file}`);
  }
});

test('v13 schema evidence composes the canonical v12-v26 chain and retains the isolated observability probe', () => {
  const baseSchema = read('scripts/hipico-apply-e2e-schema-v290.mjs');
  const observabilityWorkflow = read('.github/workflows/hipico-observability-v11.yml');
  const v25 = read('supabase/sql/hipico_v25_observability.sql');
  assert.match(baseSchema, /hipico_v23_risk_policy\.sql/);
  assert.match(baseSchema, /hipico_v24_shadow_metrics\.sql/);
  assert.match(baseSchema, /hipico_v25_observability\.sql/);
  assert.match(baseSchema, /hipico_v26_audit_rpc_integrity\.sql/);
  assert.match(observabilityWorkflow, /hipico-apply-e2e-schema-v290\.mjs/);
  assert.match(observabilityWorkflow, /hipico-observability-v11-pg\.mjs/);
  assert.match(v25, /hipico_observability_events/);
  assert.match(v25, /append-only/);
});

test('v13 release contract remains fail-closed and non-financial', () => {
  const manifest = read('scripts/hipico-release-manifest-v12.mjs');
  assert.match(manifest, /SHADOW.*ASSISTED.*AUTOMATIC_LOW_RISK.*AUTOMATIC/);
  assert.match(manifest, /sourceReadOnly:true/);
  assert.match(manifest, /labWriteOnlyDuringQa:true/);
  assert.match(manifest, /financialAuthority:false/);
  assert.match(manifest, /llmDirectDbWrites:false/);
  assert.match(manifest, /llmSettlementAuthority:false/);
  assert.match(manifest, /gate\.status==='PASS'&&gate\.sameCandidate/);
});
