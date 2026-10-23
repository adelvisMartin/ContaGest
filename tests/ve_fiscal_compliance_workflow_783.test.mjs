import test from 'node:test';
import assert from 'node:assert/strict';
import { assertComplianceTransition } from '../backend/src/modules/fiscal/fiscal-compliance-workflow-policy.ts';

const clock = new Date('2026-10-22T15:00:00.000Z');
const source = { legalSourceId: 'fixture-source-1', legalSourceHash: 'a'.repeat(64),
  reason: 'Manual verified by a second reviewer' };
const filing = { authority: 'MUNICIPAL', receiptReference: 'receipt-1',
  receiptSha256: 'b'.repeat(64), filedAt: '2026-10-20T12:00:00.000Z' };
const payment = { bankMovementId: 'bank-1', ledgerEntryId: 'gl-1',
  amountExact: '100.00', currency: 'VES' };
test('#783 valid explicit manual workflow never pretends to be official e-filing', () => {
  const a = assertComplianceTransition('draft', 'REVIEW', 'reviewer', source, clock);
  const b = assertComplianceTransition(a.to, 'RECORD_EXTERNAL_FILING', 'operator', filing, clock);
  const c = assertComplianceTransition(b.to, 'LINK_BANK_PAYMENT', 'operator', payment, clock);
  const d = assertComplianceTransition(c.to, 'CONFIRM_RECONCILIATION', 'auditor', payment, clock);
  assert.deepEqual([a.to,b.to,c.to,d.to], ['reviewed','filed_externally','paid','reconciled']);
  assert.ok(Object.isFrozen(d.evidence));
  assert.equal(b.evidence.receiptReference, 'receipt-1');
});
test('#783 cannot skip review, filing, payment or reconcile before bank evidence', () => {
  assert.throws(() => assertComplianceTransition('draft', 'RECORD_EXTERNAL_FILING', 'attacker', filing, clock));
  assert.throws(() => assertComplianceTransition('reviewed', 'LINK_BANK_PAYMENT', 'attacker', payment, clock));
  assert.throws(() => assertComplianceTransition('paid', 'REVIEW', 'attacker', source, clock));
  assert.throws(() => assertComplianceTransition('paid', 'CONFIRM_RECONCILIATION', '', payment, clock));
});
test('#783 rejects forged future filing, missing receipt and invalid money', () => {
  assert.throws(() => assertComplianceTransition('reviewed', 'RECORD_EXTERNAL_FILING', 'u', {
    ...filing, filedAt: '2027-01-01T00:00:00.000Z',
  }, clock));
  assert.throws(() => assertComplianceTransition('reviewed', 'RECORD_EXTERNAL_FILING', 'u', {
    ...filing, receiptSha256: 'not-a-hash',
  }, clock));
  assert.throws(() => assertComplianceTransition('filed_externally', 'LINK_BANK_PAYMENT', 'u', {
    ...payment, amountExact: '1e3',
  }, clock));
  assert.throws(() => assertComplianceTransition('filed_externally', 'LINK_BANK_PAYMENT', 'u', {
    ...payment, currency: 'USD',
  }, clock));
  assert.throws(() => assertComplianceTransition('filed_externally', 'LINK_BANK_PAYMENT', 'u', {
    ...payment, amountExact: '0.00',
  }, clock));
});
test('#783 reject partial or injected evidence keys', () => {
  assert.throws(() => assertComplianceTransition('draft', 'REVIEW', 'u', {
    ...source, amountExact: '999.00',
  }, clock));
  assert.throws(() => assertComplianceTransition('paid', 'CONFIRM_RECONCILIATION', 'u', {
    bankMovementId: 'abc', ledgerEntryId: 'def',
  }, clock));
});
