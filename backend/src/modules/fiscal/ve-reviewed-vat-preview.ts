import { assertReviewedVeRule, calculateReviewedVeTaxPreview, type VeReviewedRule } from './ve-reviewed-rule-policy.js';

// #775: domain-only arithmetic preview; a server-approved rate authority is
// required before this may be used by issuing/posted documents.
export type VatDraftBreakdown = Readonly<{
  tenantId:string; eventDate:string;
  taxableMinor:number; exemptMinor:number; notSubjectMinor:number;
  // Selectors must come from server-derived taxpayer/event context, not from
  // a rule supplied by the caller. This is still a non-posting preview.
  vatSelector:string; retentionSelector?:string|null;
  vatRule:VeReviewedRule; retentionRule?:VeReviewedRule|null;
}>;
const safe=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const selector=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=200;
const fail=():never=>{throw new Error('VAT_REVIEWED_PREVIEW_REJECTED');};
export function previewReviewedVatBreakdown(input:VatDraftBreakdown){
  if(!input||typeof input!=='object'||!safe(input.taxableMinor)||
    !safe(input.exemptMinor)||!safe(input.notSubjectMinor)||
    typeof input.tenantId!=='string'||!input.tenantId||!selector(input.vatSelector))fail();
  const rule=assertReviewedVeRule(input.vatRule);
  if(rule.family!=='IVA'||rule.tenantId!==input.tenantId||rule.selector!==input.vatSelector)fail();
  const total=BigInt(input.taxableMinor)+BigInt(input.exemptMinor)+BigInt(input.notSubjectMinor);
  if(total>BigInt(Number.MAX_SAFE_INTEGER))fail();
  const vat=calculateReviewedVeTaxPreview(rule,{
    tenantId:input.tenantId,eventDate:input.eventDate,baseMinor:input.taxableMinor
  });
  let retained=null;
  if(input.retentionRule!=null){
    if(!selector(input.retentionSelector))fail();
    const r=assertReviewedVeRule(input.retentionRule);
    if(r.family!=='RET_IVA'||r.tenantId!==input.tenantId||r.selector!==input.retentionSelector)fail();
    retained=calculateReviewedVeTaxPreview(r,{
      tenantId:input.tenantId,eventDate:input.eventDate,baseMinor:vat.taxMinor
    });
  }else if(input.retentionSelector!=null)fail();
  const gross=total+BigInt(vat.taxMinor);
  const withholding=BigInt(retained?.taxMinor||0);
  if(withholding>BigInt(vat.taxMinor)||gross>BigInt(Number.MAX_SAFE_INTEGER))fail();
  const net=gross-withholding;
  return Object.freeze({
    tenantId:input.tenantId,eventDate:input.eventDate,
    vatSelector:input.vatSelector,retentionSelector:input.retentionSelector??null,
    taxableMinor:input.taxableMinor,exemptMinor:input.exemptMinor,
    notSubjectMinor:input.notSubjectMinor,
    vatMinor:vat.taxMinor,withheldVatMinor:Number(withholding),
    grossMinor:Number(gross),netAfterWithholdingMinor:Number(net),
    vatSnapshot:vat,withholdingSnapshot:retained,
    mode:'NON_POSTING_PREVIEW' as const
  });
}
