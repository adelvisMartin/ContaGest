import { assertReviewedVeRule, calculateReviewedVeTaxPreview, type VeReviewedRule } from './ve-reviewed-rule-policy.js';

// #776: an externally reviewed concept selector is mandatory. No beneficiary
// classification, minimum or statutory rate is inferred from local defaults.
export type IslrConceptPreviewInput=Readonly<{
  tenantId:string; eventDate:string; conceptCode:string; beneficiaryClass:string;
  residenceClass:string; incomeBaseMinor:number; rule:VeReviewedRule;
}>;
const token=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const isToken=(value:unknown):value is string=>typeof value==='string'&&token.test(value);
const fail=():never=>{throw new Error('ISLR_CONCEPT_PREVIEW_NOT_AUTHORIZED');};
export function previewReviewedIslrConcept(input:IslrConceptPreviewInput){
  if(!input||typeof input!=='object'||!isToken(input.conceptCode)||
    !isToken(input.beneficiaryClass)||!isToken(input.residenceClass)||
    typeof input.tenantId!=='string'||!input.tenantId||
    !Number.isSafeInteger(input.incomeBaseMinor)||input.incomeBaseMinor<0)fail();
  const rule=assertReviewedVeRule(input.rule);
  const selector=[input.conceptCode,input.beneficiaryClass,input.residenceClass].join('|');
  if(rule.family!=='ISLR'||rule.tenantId!==input.tenantId||rule.selector!==selector)fail();
  const applied=calculateReviewedVeTaxPreview(rule,{
    tenantId:input.tenantId,eventDate:input.eventDate,baseMinor:input.incomeBaseMinor
  });
  return Object.freeze({
    tenantId:input.tenantId,eventDate:input.eventDate,
    conceptCode:input.conceptCode,beneficiaryClass:input.beneficiaryClass,
    residenceClass:input.residenceClass,incomeBaseMinor:input.incomeBaseMinor,
    withheldMinor:applied.taxMinor,ruleSnapshot:applied,mode:'NON_POSTING_PREVIEW' as const
  });
}
