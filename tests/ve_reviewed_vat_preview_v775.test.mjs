import test from 'node:test';
import assert from 'node:assert/strict';
import { previewReviewedVatBreakdown } from '../backend/src/modules/fiscal/ve-reviewed-vat-preview.ts';
const active=(family,numerator,selector=family)=>({
  id:family, tenantId:'A',family,selector,version:1,effectiveFrom:'2026-01-01',
  effectiveTo:'2027-01-01',status:'ACTIVE',sourceId:'source-SYNTHETIC',
  sourceReference:'Fixture, NOT legal rate',sourceContentSha256:'a'.repeat(64),
  reviewedBy:'synthetic-actor',reviewedAt:'2026-01-01T00:00:00Z',
  numerator,denominator:100
});
const input={tenantId:'A',eventDate:'2026-06-01',taxableMinor:10000,exemptMinor:250,notSubjectMinor:50,vatSelector:'IVA',retentionSelector:'RET_IVA',vatRule:active('IVA',10),retentionRule:active('RET_IVA',50)};
const denied=fn=>assert.throws(fn);
test('#775 VAT/retention recomposes exact monetary bases without altering ledger',()=>{
  const p=previewReviewedVatBreakdown(input);
  assert.equal(p.vatMinor,1000);assert.equal(p.withheldVatMinor,500);
  assert.equal(p.grossMinor,11300);assert.equal(p.netAfterWithholdingMinor,10800);
  assert.equal(p.mode,'NON_POSTING_PREVIEW');
  assert.equal(p.vatSnapshot.sourceId,'source-SYNTHETIC');
  assert.ok(Object.isFrozen(p));
});
test('#775 no optional retention returns tax without fabricated withheld amount',()=>{
  const p=previewReviewedVatBreakdown({...input,retentionSelector:null,retentionRule:null});
  assert.equal(p.withheldVatMinor,0);assert.equal(p.netAfterWithholdingMinor,p.grossMinor);
});
test('#775 rejects classification selectors that do not match reviewed IVA/retention rules',()=>{
  denied(()=>previewReviewedVatBreakdown({...input,vatSelector:'WRONG_CLASS'}));
  denied(()=>previewReviewedVatBreakdown({...input,retentionSelector:'WRONG_AGENT_CLASS'}));
  denied(()=>previewReviewedVatBreakdown({...input,vatSelector:''}));
  denied(()=>previewReviewedVatBreakdown({...input,retentionSelector:null}));
  denied(()=>previewReviewedVatBreakdown({...input,retentionRule:null}));
  denied(()=>previewReviewedVatBreakdown({...input,vatRule:active('IVA',10,'OTHER_CONTEXT')}));
});
test('#775 rejects wrong family, cross-tenant, draft and outside effectivity',()=>{
  denied(()=>previewReviewedVatBreakdown({...input,vatRule:active('ISLR',10)}));
  denied(()=>previewReviewedVatBreakdown({...input,retentionRule:active('IVA',50)}));
  denied(()=>previewReviewedVatBreakdown({...input,tenantId:'B'}));
  denied(()=>previewReviewedVatBreakdown({...input,eventDate:'2027-01-01'}));
  denied(()=>previewReviewedVatBreakdown({...input,vatRule:{...input.vatRule,status:'DRAFT'}}));
});
test('#775 rejects negative, overflow and non-integer monetary inputs',()=>{
  for(const patch of [{taxableMinor:-1},{exemptMinor:1.2},{notSubjectMinor:Number.MAX_SAFE_INTEGER}])
    denied(()=>previewReviewedVatBreakdown({...input,...patch}));
});
