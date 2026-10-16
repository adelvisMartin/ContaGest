import assert from 'node:assert/strict';
import test from 'node:test';
import { previewVeObligationEvidence, VE_OBLIGATION_MODULES } from '../backend/src/modules/fiscal/ve-obligation-evidence-preflight.ts';

const sha = key => key.repeat(64);
const scope = Object.freeze({ tenantId: 'tenant-A', period: '2026-09', module: 'iva' });
const review = { ...scope, evidenceHash: sha('a'), actorId: 'reviewer-1', recordedAt: '2026-10-01T09:00:00Z' };
const closeEvidence = { ...scope, evidenceHash: sha('b') };
const externalFiling = { ...scope, evidenceHash: sha('c'), actorId: 'operator-1', recordedAt: '2026-10-04T10:00:00Z', externalReference: 'SYNTHETIC-FILING-REF' };
const payment = { ...scope, evidenceHash: sha('d'), paymentRecordId: 'confirmed-payment-1', status: 'confirmed' };
const reconciliation = { ...scope, evidenceHash: sha('e'), paymentRecordId: payment.paymentRecordId, reconciliationId: 'bank-reconciliation-1', matched: true };
const make = (change = {}) => ({ ...scope, periodStatus: 'open', ruleSnapshotHashes: [sha('f')], review: null, closeEvidence: null, externalFiling: null, payment: null, reconciliation: null, ...change });
const reject = x => assert.throws(() => previewVeObligationEvidence(x), /VE_OBLIGATION_EVIDENCE_NOT_AUTHORIZED/);

test('#783 DRAFT and REVIEWED are previews only, with no inferred official action', () => {
  assert.deepEqual([...VE_OBLIGATION_MODULES], ['iva', 'islr', 'igtf', 'retiva', 'municipal']);
  const draft = previewVeObligationEvidence(make());
  assert.equal(draft.stage, 'DRAFT');
  assert.equal(draft.previewOnly, true);
  assert.equal(draft.externalFilingHash, null);
  assert.equal(previewVeObligationEvidence(make({ review })).stage, 'REVIEWED');
  assert.equal(draft.previewSha256.length, 64);
  assert.ok(Object.isFrozen(draft));
  assert.ok(Object.isFrozen(draft.ruleSnapshotHashes));
});

test('#783 READY depends on the actual fiscal close evidence and a prior review', () => {
  assert.equal(previewVeObligationEvidence(make({ periodStatus: 'closed', review, closeEvidence })).stage, 'READY');
  reject(make({ periodStatus: 'closed' }));
  reject(make({ closeEvidence }));
  reject(make({ periodStatus: 'closed', closeEvidence }));
  reject(make({ periodStatus: 'open', review, closeEvidence }));
});

test('#783 external filing must be an explicitly attributed off-platform fact', () => {
  assert.equal(previewVeObligationEvidence(make({ periodStatus: 'closed', review, closeEvidence, externalFiling })).stage, 'FILED_EXTERNALLY');
  reject(make({ externalFiling }));
  reject(make({ periodStatus: 'closed', review, closeEvidence, externalFiling: { ...externalFiling, externalReference: '' } }));
  reject(make({ periodStatus: 'closed', review, closeEvidence, externalFiling: { ...externalFiling, actorId: '' } }));
  reject(make({ periodStatus: 'closed', review, closeEvidence, externalFiling: { ...externalFiling, recordedAt: '2026-02-30T10:00:00Z' } }));
  reject(make({ periodStatus: 'closed', review, closeEvidence, externalFiling: { ...externalFiling, recordedAt: '2026-09-01T10:00:00Z' } }));
  reject(make({ periodStatus: 'closed', review, closeEvidence, externalFiling: { ...externalFiling, recordedAt: '2099-01-01T10:00:00Z' } }));
});

test('#783 PAID and RECONCILED require a complete, matching evidence chain', () => {
  const ready = { periodStatus: 'closed', review, closeEvidence, externalFiling };
  assert.equal(previewVeObligationEvidence(make({ ...ready, payment })).stage, 'PAID');
  assert.equal(previewVeObligationEvidence(make({ ...ready, payment, reconciliation })).stage, 'RECONCILED');
  reject(make({ payment }));
  reject(make({ ...ready, reconciliation }));
  reject(make({ ...ready, payment, reconciliation: { ...reconciliation, paymentRecordId: 'different' } }));
  reject(make({ ...ready, payment: { ...payment, status: 'pending' } }));
  reject(make({ ...ready, payment, reconciliation: { ...reconciliation, matched: false } }));
});

test('#783 enforces tenant and module scope for every evidence layer', () => {
  for (const data of [
    { review: { ...review, tenantId: 'tenant-B' } },
    { review: { ...review, module: 'islr' } },
    { closeEvidence: { ...closeEvidence, period: '2026-08' } },
    { externalFiling: { ...externalFiling, tenantId: 'tenant-B' } },
    { payment: { ...payment, tenantId: 'tenant-B' } },
    { reconciliation: { ...reconciliation, tenantId: 'tenant-B' } },
  ]) reject(make({ periodStatus: 'closed', review, closeEvidence, externalFiling, payment, reconciliation, ...data }));
});

test('#783 fails closed on unsupported modules, periods, identifiers and bad hashes', () => {
  for (const x of [
    { tenantId: '' }, { tenantId: 'tenant B' }, { period: '0000-01' }, { period: '2026-13' }, { period: '2026-1' },
    { module: 'payroll' }, { module: 'fiscal' }, { module: 'IVA' }, { periodStatus: 'posted' },
    { ruleSnapshotHashes: ['invalid'] }, { ruleSnapshotHashes: [sha('f'), sha('f')] },
    { ruleSnapshotHashes: new Array(65).fill(sha('f')) }, { ruleSnapshotHashes: null },
  ]) reject(make(x));
  reject(null);
});

test('#783 never treats empty rule snapshots as reviewed or ready', () => {
  const noRules = make({ ruleSnapshotHashes: [] });
  assert.equal(previewVeObligationEvidence(noRules).stage, 'DRAFT');
  reject({ ...noRules, review });
  reject({ ...noRules, periodStatus: 'closed', review, closeEvidence });
});

test('#783 digest is deterministic, tenant/period/evidence specific and unaffected by order of snapshot hashes', () => {
  const x = make({ ruleSnapshotHashes: [sha('e'), sha('f')], review });
  const first = previewVeObligationEvidence(x);
  assert.equal(first.previewSha256, previewVeObligationEvidence(make({ ...x, ruleSnapshotHashes: [sha('f'), sha('e')] })).previewSha256);
  assert.notEqual(first.previewSha256, previewVeObligationEvidence(make({ ...x, period: '2026-08', review: { ...review, period: '2026-08' } })).previewSha256);
  assert.notEqual(first.previewSha256, previewVeObligationEvidence(make({ ...x, tenantId: 'tenant-B', review: { ...review, tenantId: 'tenant-B' } })).previewSha256);
  assert.equal(x.ruleSnapshotHashes[0], sha('e'));
  const full = make({ periodStatus: 'closed', review, closeEvidence, externalFiling, payment, reconciliation });
  const firstFull = previewVeObligationEvidence(full);
  for (const changed of [
    { externalFiling: { ...externalFiling, externalReference: 'ANOTHER-SYNTHETIC-REF' } },
    { payment: { ...payment, paymentRecordId: 'confirmed-payment-2' }, reconciliation: { ...reconciliation, paymentRecordId: 'confirmed-payment-2' } },
    { reconciliation: { ...reconciliation, reconciliationId: 'different-reconciliation-2' } },
    { review: { ...review, actorId: 'another-reviewer' } },
  ]) {
    assert.notEqual(firstFull.previewSha256, previewVeObligationEvidence({ ...full, ...changed }).previewSha256);
  }
});
