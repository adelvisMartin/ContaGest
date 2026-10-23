import test from 'node:test';import assert from 'node:assert/strict';
import {calculateRatioMinor,planReviewedTaxEvent,reverseTaxPostingPlan} from '../backend/src/modules/fiscal/ve-tax-posting-plan.ts';
const ratio=(basis,numerator,denominator=100)=>({ruleId:'r1',ruleKey:'iva',ruleHash:'a'.repeat(64),legalSourceId:'source',legalSourceSha256:'b'.repeat(64),definition:{formula:'RATIO_MINOR_UNITS',numerator,denominator,basis}});
const vat=ratio('taxable_minor',16),ret=ratio('tax_minor',75),islr=ratio('taxable_minor',3);
const denied=fn=>assert.throws(fn,/VE_TAX_POSTING_PLAN_REJECTED/);
test('purchase: IVA + IVA withheld + ISLR withheld balances with no hardcoded rates',()=>{
 const p=planReviewedTaxEvent({kind:'purchase',taxableMinor:10000,exemptMinor:2500,notSubjectMinor:0,vat,retainedVat:ret,retainedIslr:islr});
 assert.equal(p.baseMinor,12500);assert.equal(p.vatMinor,1600);assert.equal(p.retainedVatMinor,1200);assert.equal(p.retainedIslrMinor,300);
 assert.equal(p.netMinor,12600);assert.deepEqual(p.lines.map(x=>x.accountRole),['cost_of_sales','vat_input','ap','withholding_payable']);
 assert.equal(p.lines.reduce((a,l)=>a+l.debitMinor,0),p.lines.reduce((a,l)=>a+l.creditMinor,0));
});
test('sale: withholding receivable and exact original historical reversals',()=>{
 const p=planReviewedTaxEvent({kind:'sale',taxableMinor:10000,exemptMinor:0,notSubjectMinor:0,vat,retainedVat:ret});
 assert.equal(p.netMinor,10400);assert.deepEqual(p.lines.map(x=>x.accountRole),['ar','withholding_receivable','revenue','vat_output']);
 const reversal=reverseTaxPostingPlan(p.lines);assert.equal(reversal.length,p.lines.length);
 assert.deepEqual(reversal.map(l=>l.debitMinor),p.lines.map(l=>l.creditMinor));
});
test('one-cent rounding uses half-up integer not floating point',()=>{const rule=ratio('taxable_minor',1,2);
 assert.equal(calculateRatioMinor(1,rule,'taxable_minor'),1);
 assert.equal(calculateRatioMinor(3,rule,'taxable_minor'),2);
});
test('fail closed for bad source, basis, illegal ratios, bad amounts or arithmetic overflow',()=>{
 denied(()=>calculateRatioMinor(100,{...vat,legalSourceId:''},'taxable_minor'));
 denied(()=>calculateRatioMinor(100,ret,'taxable_minor'));
 denied(()=>calculateRatioMinor(100,{...vat,definition:{...vat.definition,numerator:120}},'taxable_minor'));
 denied(()=>planReviewedTaxEvent({kind:'purchase',taxableMinor:-1,exemptMinor:0,notSubjectMinor:0,vat}));
 denied(()=>planReviewedTaxEvent({kind:'sale',taxableMinor:Number.MAX_SAFE_INTEGER,exemptMinor:1,notSubjectMinor:0,vat}));
});
test('zero tax retained is valid on taxable exempt/non-subject classifications',()=>{
 const p=planReviewedTaxEvent({kind:'sale',taxableMinor:0,exemptMinor:10000,notSubjectMinor:0,vat:ratio('taxable_minor',0)});
 assert.equal(p.vatMinor,0);assert.equal(p.grossMinor,10000);assert.equal(p.netMinor,10000);
});
