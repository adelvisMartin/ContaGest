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

test('#712 timeline cursor rejects semantically equivalent but noncanonical encodings', () => {
  const item = {
    effectiveAt:'2026-10-19T10:00:00.000Z',
    sourceType:'fact' as const,
    sourceId:'fact-123'
  };
  const canonical = encodeCareTimelineCursor(item);
  assert.deepEqual(decodeCareTimelineCursor(canonical), item);

  // A different property order or duplicate JSON key must not be a second
  // usable token for the same clinical cursor.
  const reordered = Buffer.from(JSON.stringify({
    sourceId:item.sourceId,sourceType:item.sourceType,effectiveAt:item.effectiveAt
  })).toString('base64url');
  assert.notEqual(reordered, canonical);
  assert.throws(() => decodeCareTimelineCursor(reordered), /Cursor clínico inválido/);

  const duplicate = Buffer.from(
    JSON.stringify(item).replace('"sourceId":"fact-123"',
      '"sourceId":"fact-123","sourceId":"fact-123"')
  ).toString('base64url');
  assert.throws(() => decodeCareTimelineCursor(duplicate), /Cursor clínico inválido/);
});

test('#712 timeline cursor rejects alternate base64url tail bits', () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const common = { effectiveAt:'2026-10-19T10:00:00.000Z', sourceType:'fact' as const };
  const token = ['x-1','x-12','x-123','x-1234']
    .map(sourceId => encodeCareTimelineCursor({...common,sourceId}))
    .find(value => value.length % 4 !== 0);
  assert.ok(token, 'Need a cursor whose last sextet has unused padding bits');
  const last = token.at(-1)!;
  const tailIndex = alphabet.indexOf(last);
  const replacement = alphabet[tailIndex ^ 1];
  const alias = token.slice(0,-1) + replacement;
  assert.notEqual(alias, token);
  assert.deepEqual(Buffer.from(alias,'base64url'),Buffer.from(token,'base64url'),
    'Noncanonical final sextet can decode to the same bytes');
  assert.throws(() => decodeCareTimelineCursor(alias), /Cursor clínico inválido/);
});
