import test from 'node:test';
import assert from 'node:assert/strict';
import {
  careClinicalFactSchema,
  careClinicalFactAmendmentSchema,
  assertCareFactReviewable,
  assertCareFactAmendable,
  fingerprintCareFact,
  encodeCareTimelineCursor,
  decodeCareTimelineCursor
} from './care-longitudinal-policy.js';

const base = {
  idempotencyKey: 'f9ae89aa-dcc3-43d0-8582-169cb366684e',
  patientId: 'patient-1234567890',
  kind: 'allergy',
  detail: { substance: 'Penicillin', reaction: 'rash' },
  effectiveAt: '2026-10-19T10:00:00.000Z'
};

test('clinical fact accepts explicit categories and timestamps', () => {
  for (const kind of ['problem', 'allergy', 'medication', 'diagnosis', 'procedure']) {
    assert.equal(careClinicalFactSchema.safeParse({ ...base, kind }).success, true, kind);
  }
  for (const kind of ['unknown', 'patient', 'billing']) {
    assert.equal(careClinicalFactSchema.safeParse({ ...base, kind }).success, false, kind);
  }
  assert.equal(careClinicalFactSchema.safeParse({ ...base, effectiveAt: '2026-02-30' }).success, false);
  assert.equal(careClinicalFactSchema.safeParse({ ...base, effectiveAt: '19/10/2026' }).success, false);
  assert.equal(careClinicalFactSchema.safeParse({ ...base, detail: {} }).success, false);
  assert.equal(careClinicalFactSchema.safeParse({ ...base, tenantId: 'tenant-from-client' }).success, false);
  assert.equal(careClinicalFactSchema.safeParse({ ...base, provenance: 'external-verified' }).success, false);
  assert.equal(careClinicalFactSchema.safeParse({ ...base, idempotencyKey: 'not-a-uuid' }).success, false);
  assert.equal(careClinicalFactSchema.safeParse({ ...base, idempotencyKey: undefined }).success, false);
});

test('review only allows drafts; signed records are not edited in place', () => {
  assert.doesNotThrow(() => assertCareFactReviewable('draft'));
  for (const status of ['reviewed', 'entered_in_error']) {
    assert.throws(() => assertCareFactReviewable(status));
  }
  assert.doesNotThrow(() => assertCareFactAmendable('reviewed'));
  for (const status of ['draft', 'entered_in_error']) {
    assert.throws(() => assertCareFactAmendable(status));
  }
  const { patientId: _patientId, idempotencyKey: _key, ...amendment } = base;
  assert.equal(careClinicalFactAmendmentSchema.safeParse({ ...amendment, reason: 'typo' }).success, false);
  assert.equal(careClinicalFactAmendmentSchema.safeParse({ ...amendment, reason: 'Corrección comprobada tras la revisión' }).success, true);
});

test('clinical snapshot fingerprint is stable for the same reviewed material', () => {
  const material = { tenantId: 'a', patientId: 'p', kind: 'allergy', detail: base.detail, effectiveAt: base.effectiveAt };
  assert.match(fingerprintCareFact(material), /^[0-9a-f]{64}$/);
  assert.equal(fingerprintCareFact(material), fingerprintCareFact(material));
  assert.equal(fingerprintCareFact(material), fingerprintCareFact({ ...material, detail: { reaction: 'rash', substance: 'Penicillin' } }));
  assert.notEqual(fingerprintCareFact(material), fingerprintCareFact({ ...material, tenantId: 'b' }));
  assert.notEqual(fingerprintCareFact(material), fingerprintCareFact({ ...material, detail: { ...base.detail, reaction: 'anaphylaxis' } }));
  assert.notEqual(fingerprintCareFact(material), fingerprintCareFact({ ...material, provenance: 'externally-verified' }));
  assert.notEqual(fingerprintCareFact(material), fingerprintCareFact({ ...material, encounterId: 'encounter-b' }));
});

test('timeline cursor is bounded, stable, and fails closed on invalid structure', () => {
  const item = { effectiveAt: '2026-10-19T10:00:00.000Z', sourceType: 'fact' as const, sourceId: 'x-1' };
  assert.deepEqual(decodeCareTimelineCursor(encodeCareTimelineCursor(item)), item);
  assert.equal(decodeCareTimelineCursor(undefined), null);
  for (const token of ['???', Buffer.from(JSON.stringify({ ...item, sourceType: 'unknown' })).toString('base64url'), 'x'.repeat(2048)]) {
    assert.throws(() => decodeCareTimelineCursor(token));
  }
});
