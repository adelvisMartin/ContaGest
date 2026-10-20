import test from 'node:test';
import assert from 'node:assert/strict';
import { municipalEventSelector, previewReviewedMunicipalEvent, previewReviewedMunicipalEventFromCatalog } from '../backend/src/modules/fiscal/ve-municipal-event-preview.ts';

// Synthetic geographic and rate identifiers: NO legal municipality determination.
const event = Object.freeze({ tenantId: 'tenant-A', eventDate: '2026-08-01',
  municipalityCode: 'MUN_ALPHA', activityCode: 'ACT_ONE',
  operationKind: 'SERVICE', counterpartyClass: 'ORDINARY', taxableBaseMinor: 103 });
const rule = Object.freeze({ id: 'fixture-municipality-1', tenantId: event.tenantId,
  family: 'MUNICIPAL', selector: 'MUN_ALPHA|ACT_ONE|SERVICE|ORDINARY',
  version: 1, effectiveFrom: '2026-01-01', effectiveTo: '2027-01-01',
  status: 'ACTIVE', sourceId: 'synthetic-source', sourceReference: 'Fixture, not law',
  sourceContentSha256: 'f'.repeat(64), reviewedBy: 'fixture-reviewer',
  reviewedAt: '2026-01-01T00:00:00Z', numerator: 1, denominator: 2 });
const denied = (fn) => assert.throws(fn);
test('#780 resolves all four municipality/activity/counterparty dimensions', () => {
  assert.equal(municipalEventSelector(event), rule.selector);
  assert.notEqual(municipalEventSelector({ ...event, municipalityCode: 'MUN_BETA' }), rule.selector);
});
test('#780 reviewed matching municipality produces an immutable preview', () => {
  const result = previewReviewedMunicipalEvent(event, rule);
  assert.equal(result.taxMinor, 52);
  assert.equal(result.mode, 'NON_POSTING_PREVIEW');
  assert.equal(result.ruleSnapshot.sourceId, 'synthetic-source');
  assert.ok(Object.isFrozen(result));
});
test('#780 rejects cross-municipality, cross-tenant, activity and counterparty changes', () => {
  for (const change of [{ municipalityCode: 'MUN_BETA' }, { tenantId: 'tenant-B' },
    { activityCode: 'ACT_TWO' }, { operationKind: 'SALES' }, { counterpartyClass: 'SPECIAL' }])
    denied(() => previewReviewedMunicipalEvent({ ...event, ...change }, rule));
});
test('#780 rejects draft, expired, wrong family or missing provenance', () => {
  denied(() => previewReviewedMunicipalEvent(event, { ...rule, status: 'DRAFT' }));
  denied(() => previewReviewedMunicipalEvent(event, { ...rule, family: 'IGTF' }));
  denied(() => previewReviewedMunicipalEvent(event, { ...rule, reviewedBy: '' }));
  denied(() => previewReviewedMunicipalEvent({ ...event, eventDate: '2027-01-01' }, rule));
});
test('#780 rejects malformed scope and invalid/overflow amount', () => {
  denied(() => previewReviewedMunicipalEvent({ ...event, municipalityCode: 'A|B' }, rule));
  denied(() => previewReviewedMunicipalEvent({ ...event, activityCode: '../secret' }, rule));
  denied(() => previewReviewedMunicipalEvent({ ...event, taxableBaseMinor: -1 }, rule));
  denied(() => previewReviewedMunicipalEvent({ ...event, taxableBaseMinor: 1.5 }, rule));
  denied(() => previewReviewedMunicipalEvent({ ...event, taxableBaseMinor: Number.MAX_SAFE_INTEGER + 1 }, rule));
});
test('#780 authoritative catalog selection rejects missing and overlapping municipal rules',()=>{
  const matched=previewReviewedMunicipalEventFromCatalog(event,[rule]);
  assert.equal(matched.taxMinor,52);
  denied(()=>previewReviewedMunicipalEventFromCatalog(event,[]));
  denied(()=>previewReviewedMunicipalEventFromCatalog(event,[rule,{...rule,id:'same-scope-review-2'}]));
  denied(()=>previewReviewedMunicipalEventFromCatalog(event,[rule,{...rule,id:'unreviewed-overlap',status:'DRAFT'}]));
  denied(()=>previewReviewedMunicipalEventFromCatalog({...event,municipalityCode:'MUN_BETA'},[rule]));
});
test('#780 catalog uses inclusive start and exclusive end without historical rule reinterpretation',()=>{
  const next={...rule,id:'next-v2',version:2,effectiveFrom:'2027-01-01',effectiveTo:'2028-01-01'};
  assert.equal(previewReviewedMunicipalEventFromCatalog({...event,eventDate:'2026-12-31'},[rule,next]).ruleSnapshot.ruleId,rule.id);
  assert.equal(previewReviewedMunicipalEventFromCatalog({...event,eventDate:'2027-01-01'},[rule,next]).ruleSnapshot.ruleId,next.id);
});
