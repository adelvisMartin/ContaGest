import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VE_RULE_FAMILIES, assertReviewedVeRule, resolveReviewedVeRule,
  calculateReviewedVeTaxPreview, assertBalancedVePostingPreview
} from '../backend/src/modules/fiscal/ve-reviewed-rule-policy.ts';

function rule(overrides={}) {
  return {
    id:'review-1',tenantId:'tenant-A',family:'IVA',selector:'ordinary',
    version:1,effectiveFrom:'2026-01-01',effectiveTo:'2027-01-01',
    status:'ACTIVE',sourceId:'official-source-id',sourceReference:'official-legal-reference',
    sourceContentSha256:'a'.repeat(64),reviewedBy:'fiscal-reviewer',
    reviewedAt:'2026-01-01T12:00:00.000Z',numerator:0,denominator:10000,...overrides
  };
}
const query=(overrides={})=>({tenantId:'tenant-A',family:'IVA',selector:'ordinary',eventDate:'2026-06-01',...overrides});
const previewInput=(overrides={})=>({tenantId:'tenant-A',eventDate:'2026-06-01',baseMinor:101,...overrides});

test('#751 no built-in tax rates; only explicitly reviewed sources can be resolved',()=>{
  assert.ok(VE_RULE_FAMILIES.includes('MUNICIPAL'));
  assert.ok(VE_RULE_FAMILIES.includes('FAOV'));
  assert.equal(resolveReviewedVeRule([rule()],query()).id,'review-1');
  assert.throws(()=>resolveReviewedVeRule([],query()),/VE_FISCAL_RULE_NOT_AUTHORIZED/);
  for(const invalid of [
    {status:'DRAFT'}, {status:'REVIEWED'}, {status:'SUPERSEDED'},
    {sourceId:''}, {sourceReference:''},{sourceContentSha256:'a'.repeat(12)},
    {reviewedBy:''},{reviewedAt:'2099-01-01T00:00:00Z'},
    {reviewedAt:'2026-02-30T01:02:03Z'},
    {effectiveFrom:'2026-02-30'},
    {effectiveFrom:'2027-01-01',effectiveTo:'2026-01-01'},
    {version:0},{denominator:0},{numerator:20000}
  ]) assert.throws(()=>assertReviewedVeRule(rule(invalid)),/VE_FISCAL_RULE_NOT_AUTHORIZED/);
});

test('#751 effective-date boundaries are inclusive/exclusive and tenant-scoped',()=>{
  const r=rule();
  assert.equal(resolveReviewedVeRule([r],query({eventDate:'2026-01-01'})).id,r.id);
  for(const q of [
    {eventDate:'2025-12-31'}, {eventDate:'2027-01-01'},
    {tenantId:'tenant-B'}, {selector:'special'},
    {family:'IGTF'},{eventDate:'2026-02-30'}
  ]) assert.throws(()=>resolveReviewedVeRule([r],query(q)),/VE_FISCAL_RULE_NOT_AUTHORIZED/);
  assert.throws(()=>resolveReviewedVeRule([r,{...r,id:'overlap',version:2}],query()),/VE_FISCAL_RULE_NOT_AUTHORIZED/);
});

test('#751 deterministic half-up amount and immutable applied provenance snapshot',()=>{
  const r=rule({numerator:1,denominator:2});
  const first=calculateReviewedVeTaxPreview(r,previewInput());
  assert.equal(first.baseMinor,101);
  assert.equal(first.taxMinor,51);
  assert.equal(first.snapshotSha256.length,64);
  assert.equal(first.snapshotSha256,calculateReviewedVeTaxPreview(r,previewInput()).snapshotSha256);
  assert.ok(Object.isFrozen(first));
  const next=calculateReviewedVeTaxPreview(rule({id:'v2',version:2,numerator:0}),previewInput());
  assert.equal(first.taxMinor,51);
  assert.equal(next.taxMinor,0);
  assert.notEqual(first.snapshotSha256,next.snapshotSha256);
});

test('#751 monetary previews never cross a tenant or effective interval',()=>{
  const r=rule({numerator:1,denominator:100});
  for(const input of [
    {tenantId:'tenant-B'}, {eventDate:'2028-01-01'}, {baseMinor:-1},
    {baseMinor:0.25}, {baseMinor:Number.MAX_SAFE_INTEGER+1}
  ]) assert.throws(()=>calculateReviewedVeTaxPreview(r,previewInput(input)),/VE_FISCAL_RULE_NOT_AUTHORIZED/);
  const value=calculateReviewedVeTaxPreview(r,previewInput({baseMinor:0}));
  assert.equal(value.taxMinor,0);
});

test('#785 semantic account posting preview never allows an unbalanced entry',()=>{
  const balanced=[
    {accountRole:'CASH',debitMinor:101,creditMinor:0},
    {accountRole:'TAX_PAYABLE',debitMinor:0,creditMinor:101}
  ];
  assert.deepEqual(assertBalancedVePostingPreview(balanced),{balanced:true,totalMinor:101});
  for(const bad of [
    [{accountRole:'CASH',debitMinor:50,creditMinor:0}],
    [{accountRole:'CASH',debitMinor:2,creditMinor:2},{accountRole:'REVENUE',debitMinor:0,creditMinor:2}],
    [{accountRole:'CASH',debitMinor:101,creditMinor:0},{accountRole:'TAX_PAYABLE',debitMinor:0,creditMinor:100}],
    [{accountRole:'',debitMinor:101,creditMinor:0},{accountRole:'TAX_PAYABLE',debitMinor:0,creditMinor:101}]
  ]) assert.throws(()=>assertBalancedVePostingPreview(bad),/VE_FISCAL_RULE_NOT_AUTHORIZED/);
});

test('#775 #776 #778 #780 #781 #782 no tax family can invent a rate without reviewed rule',()=>{
  for(const family of VE_RULE_FAMILIES){
    assert.throws(()=>resolveReviewedVeRule([],query({family})),/VE_FISCAL_RULE_NOT_AUTHORIZED/);
  }
});
