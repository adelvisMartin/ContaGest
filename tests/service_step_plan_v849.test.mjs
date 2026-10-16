import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServiceStepPlan } from '../backend/src/modules/service-catalog/service-step-plan.policy.ts';

const step = (position, overrides = {}) => ({
  tenantId: 'tenant-A', serviceId: 'service-1', id: `step-${position}`,
  position, label: `Fase ${position}`, durationMinutes: 30, gapAfterMinutes: 0,
  ...overrides,
});
const valid = overrides => ({
  tenantId: 'tenant-A', serviceId: 'service-1', version: 1,
  steps: [step(1, { gapAfterMinutes: 10 }), step(2)], ...overrides,
});
const reject = candidate => assert.throws(() => buildServiceStepPlan(candidate), {
  message: 'SERVICE_CATALOG_STEP_PLAN_INVALID',
});

test('#849 derives ordered total duration without persisting availability or prices', () => {
  const result = buildServiceStepPlan(valid());
  assert.equal(result.durationMinutes, 60);
  assert.equal(result.totalMinutes, 70);
  assert.equal(result.steps.length, 2);
  assert.equal(result.previewOnly, true);
  for (const forbidden of ['price', 'currency', 'taxRate', 'remainingUses', 'resourceAllocations', 'clinicalNotes']) {
    assert.equal(Object.hasOwn(result, forbidden), false);
  }
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.steps));
  assert.ok(result.steps.every(Object.isFrozen));
});

test('#849 reorder input preserves deterministic ordered preview', () => {
  const original = valid();
  const first = buildServiceStepPlan(original);
  const second = buildServiceStepPlan(valid({ steps: [...original.steps].reverse() }));
  assert.deepEqual(first, second);
  assert.equal(original.steps[0].position, 1);
  assert.notEqual(first.steps, original.steps);
});

test('#849 rejects cross-tenant and cross-service steps even with valid IDs', () => {
  reject(valid({ steps: [step(1, { tenantId: 'tenant-B' }), step(2)] }));
  reject(valid({ steps: [step(1, { serviceId: 'service-2' }), step(2)] }));
  reject(valid({ tenantId: 'tenant-B' }));
  reject(valid({ serviceId: 'service-2' }));
});

test('#849 rejects duplicate, missing, out-of-order or zero positions', () => {
  reject(valid({ steps: [step(1), step(1, { id: 'duplicate-id' })] }));
  reject(valid({ steps: [step(1), step(2, { id: 'step-1' })] }));
  reject(valid({ steps: [step(1), step(3)] }));
  reject(valid({ steps: [step(0)] }));
  reject(valid({ steps: [step(-1)] }));
  reject(valid({ steps: [step(1.5)] }));
});

test('#849 rejects malformed duration, gaps, missing end boundary and capacity overflow', () => {
  for (const duration of [-1, 0, 480.1, 481, NaN, Infinity, '30']) {
    reject(valid({ steps: [step(1, { durationMinutes: duration }), step(2)] }));
  }
  for (const gap of [-1, 180.5, 181, NaN, Infinity]) {
    reject(valid({ steps: [step(1, { gapAfterMinutes: gap }), step(2)] }));
  }
  reject(valid({ steps: [step(1), step(2, { gapAfterMinutes: 1 })] }));
  reject(valid({ steps: Array.from({ length: 7 }, (_, i) => step(i + 1, { durationMinutes: 480 })) }));
  reject(valid({ steps: Array.from({ length: 25 }, (_, i) => step(i + 1)) }));
});

test('#849 rejects unknown price/ledger/patient/entitlement fields at definition boundary', () => {
  reject({ ...valid(), price: 100 });
  reject(valid({ steps: [step(1, { cost: 100 }), step(2)] }));
  reject(valid({ steps: [step(1, { remainingUses: 5 }), step(2)] }));
  reject(valid({ steps: [step(1, { clinicalNotes: 'private' }), step(2)] }));
  reject(valid({ steps: [step(1, { resourceAllocations: [] }), step(2)] }));
});

test('#849 validates ID, label and version shape fail-closed', () => {
  reject(null);
  reject(valid({ tenantId: '' }));
  reject(valid({ tenantId: ' tenant-A' }));
  reject(valid({ serviceId: '../other' }));
  reject(valid({ version: 0 }));
  reject(valid({ version: Number.MAX_SAFE_INTEGER + 1 }));
  reject(valid({ steps: [] }));
  reject(valid({ steps: [step(1, { id: '__proto__' })] }));
  reject(valid({ steps: [step(1, { label: '   ' })] }));
  reject(valid({ steps: [step(1, { label: 'a'.repeat(121) })] }));
});

test('#849 never mutates caller arrays or returns references usable for history rewrites', () => {
  const initial = valid();
  const before = JSON.stringify(initial);
  const result = buildServiceStepPlan(initial);
  assert.equal(JSON.stringify(initial), before);
  initial.steps[0].label = 'Alterada';
  assert.equal(result.steps[0].label, 'Fase 1');
  assert.notEqual(result.steps, initial.steps);
  const next = buildServiceStepPlan({ ...valid(), version: 2 });
  assert.notDeepEqual(result, next);
});
