import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VE_EVENT_PREVIEW_FAMILIES, previewReviewedVeTaxEvent
} from '../backend/src/modules/fiscal/ve-reviewed-rule-policy.ts';

// Synthetic fixtures. No statutory tax rates are introduced by these tests.
const reviewed = (family, other = {}) => ({
  id: 'fixture-rule-1',
  tenantId: 'tenant-A',
  family,
  selector: 'fixture-tenant-verified-selector',
  version: 1,
  effectiveFrom: '2026-01-01',
  effectiveTo: '2027-01-01',
  status: 'ACTIVE',
  sourceId: 'synthetic-source-fixture',
  sourceReference: 'synthetic-reference-not-legal-guidance',
  sourceContentSha256: 'a'.repeat(64),
  reviewedBy: 'fixture-reviewer',
  reviewedAt: '2026-01-01T00:00:00.000Z',
  numerator: 1,
  denominator: 2,
  ...other
});
const event = (family, other = {}) => ({
  tenantId: 'tenant-A', family,
  selector: 'fixture-tenant-verified-selector',
  eventDate: '2026-06-01', baseMinor: 101, ...other
});

for (const family of VE_EVENT_PREVIEW_FAMILIES) {
  test(`#775/#776/#778/#780 ${family}: exact reviewed family resolves before computing preview`, () => {
    const computed = previewReviewedVeTaxEvent([reviewed(family)], event(family));
    assert.equal(computed.family, family);
    assert.equal(computed.taxMinor, 51, 'BigInt half-up arithmetic from existing preview');
    assert.equal(computed.previewOnly, true, 'not fiscal issue/posting authority');
    assert.equal(computed.sourceId, 'synthetic-source-fixture');
    assert.equal(computed.snapshotSha256.length, 64);
    assert.ok(Object.isFrozen(computed));
  });

  test(`#775/#776/#778/#780 ${family}: cross-family, cross-tenant, missing review all fail closed`, () => {
    const fixture = reviewed(family);
    const different = VE_EVENT_PREVIEW_FAMILIES.find((f) => f !== family);
    assert.throws(() => previewReviewedVeTaxEvent([fixture], event(different)),
      /VE_FISCAL_RULE_NOT_AUTHORIZED/);
    assert.throws(() => previewReviewedVeTaxEvent([fixture], event(family, {tenantId:'tenant-B'})),
      /VE_FISCAL_RULE_NOT_AUTHORIZED/);
    assert.throws(() => previewReviewedVeTaxEvent([fixture], event(family, {selector:'different'})),
      /VE_FISCAL_RULE_NOT_AUTHORIZED/);
    assert.throws(() => previewReviewedVeTaxEvent([reviewed(family, {status:'DRAFT'})], event(family)),
      /VE_FISCAL_RULE_NOT_AUTHORIZED/);
    assert.throws(() => previewReviewedVeTaxEvent([reviewed(family, {sourceContentSha256:'bad'})], event(family)),
      /VE_FISCAL_RULE_NOT_AUTHORIZED/);
  });
}

test('#775/#776/#778/#780 rejects missing, ambiguous or superseded versions', () => {
  const r = reviewed('IVA');
  assert.throws(() => previewReviewedVeTaxEvent([], event('IVA')), /NOT_AUTHORIZED/);
  assert.throws(() => previewReviewedVeTaxEvent([r, {...r,id:'duplicate'}], event('IVA')), /NOT_AUTHORIZED/);
  assert.throws(() => previewReviewedVeTaxEvent([reviewed('IVA',{status:'SUPERSEDED'})], event('IVA')), /NOT_AUTHORIZED/);
});

test('#775/#776/#778/#780 UTC boundaries and unsafe bases fail before computing', () => {
  const r = reviewed('IGTF');
  assert.equal(previewReviewedVeTaxEvent([r], event('IGTF',{eventDate:'2026-01-01'})).taxMinor,51);
  for (const invalid of [
    {eventDate:'2025-12-31'}, {eventDate:'2027-01-01'},
    {eventDate:'2026-02-30'}, {baseMinor:-1}, {baseMinor:0.1},
    {baseMinor:Number.MAX_SAFE_INTEGER + 1}
  ]) assert.throws(() => previewReviewedVeTaxEvent([r], event('IGTF', invalid)), /NOT_AUTHORIZED/);
});

test('#775/#776/#778/#780 no default rate, no inferred beneficiary/municipality or side effects', () => {
  assert.deepEqual([...VE_EVENT_PREVIEW_FAMILIES], ['IVA','RET_IVA','ISLR','IGTF','MUNICIPAL']);
  for (const family of VE_EVENT_PREVIEW_FAMILIES) {
    assert.throws(() => previewReviewedVeTaxEvent([], event(family)), /NOT_AUTHORIZED/);
  }
  const zeroRate = previewReviewedVeTaxEvent([reviewed('ISLR',{numerator:0,denominator:100})],event('ISLR'));
  assert.equal(zeroRate.taxMinor,0);
  assert.equal(zeroRate.previewOnly,true);
});
