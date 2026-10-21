import test from 'node:test';
import assert from 'node:assert/strict';
import {previewReviewedIslrConcept} from '../backend/src/modules/fiscal/ve-reviewed-islr-preview.ts';
const rule={
  id:'synthetic-rule',tenantId:'t1',family:'ISLR',
  selector:'CONCEPT_A|BENEFICIARY_A|LOCAL',version:1,
  effectiveFrom:'2026-01-01',effectiveTo:'2027-01-01',
  status:'ACTIVE',sourceId:'synthetic-source',
  sourceReference:'Fixture NON STATUTORY',sourceContentSha256:'b'.repeat(64),
  reviewedBy:'synthetic-reviewer',reviewedAt:'2026-01-01T00:00:00Z',
  numerator:5,denominator:100
};
const input={tenantId:'t1',eventDate:'2026-06-05',conceptCode:'CONCEPT_A',beneficiaryClass:'BENEFICIARY_A',residenceClass:'LOCAL',incomeBaseMinor:12345,rule};
const denied=fn=>assert.throws(fn);
test('#776 exact concept, beneficiary, residence and source snapshot',()=>{
  const p=previewReviewedIslrConcept(input);
  assert.equal(p.withheldMinor,617);assert.equal(p.ruleSnapshot.sourceContentSha256,'b'.repeat(64));
  assert.equal(p.mode,'NON_POSTING_PREVIEW');assert.ok(Object.isFrozen(p));
});
test('#776 mismatch of any one classification or tenant is blocked',()=>{
  for(const patch of [{conceptCode:'CONCEPT_B'},{beneficiaryClass:'OTHER'},{residenceClass:'FOREIGN'},{tenantId:'t2'}])denied(()=>previewReviewedIslrConcept({...input,...patch}));
});
test('#776 without approved effective ISLR source cannot calculate',()=>{
  denied(()=>previewReviewedIslrConcept({...input,rule:{...rule,status:'DRAFT'}}));
  denied(()=>previewReviewedIslrConcept({...input,rule:{...rule,family:'IVA'}}));
  denied(()=>previewReviewedIslrConcept({...input,eventDate:'2027-01-01'}));
  denied(()=>previewReviewedIslrConcept({...input,rule:{...rule,sourceContentSha256:'bad'}}));
});
test('#776 invalid untrusted concept identifiers or bases fail closed',()=>{
  for(const patch of [{conceptCode:'A|B'},{beneficiaryClass:''},{residenceClass:'../'},{incomeBaseMinor:-1},{incomeBaseMinor:0.2},{incomeBaseMinor:Number.MAX_SAFE_INTEGER+1}])denied(()=>previewReviewedIslrConcept({...input,...patch}));
});
test('#776 numeric classifications must never be coerced into valid selectors',()=>{
  for(const field of ['conceptCode','beneficiaryClass','residenceClass']){
    const candidate={...input,[field]:123};
    const selector=[candidate.conceptCode,candidate.beneficiaryClass,candidate.residenceClass].join('|');
    denied(()=>previewReviewedIslrConcept({...candidate,rule:{...rule,selector}}));
  }
});
