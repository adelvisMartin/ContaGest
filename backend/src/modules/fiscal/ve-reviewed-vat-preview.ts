import { assertReviewedVeRule, calculateReviewedVeTaxPreview, type VeReviewedRule } from './ve-reviewed-rule-policy.js';

// #775: domain-only arithmetic preview; a server-approved rate authority is
// required before this may be used by issuing/posted documents.
export type VatDraftBreakdown = Readonly<{
  tenantId:string; eventDate:string;
  taxableMinor:number; exemptMinor:number; notSubjectMinor:number;
  vatRule:VeReviewedRule; retentionRule?:VeReviewedRule|null;
}>;
const safe=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const fail=():never=>{throw new Error('VAT_REVIEWED_PREVIEW_REJECTED');};
export function previewReviewedVatBreakdown(input:VatDraftBreakdown){
  if(!input||typeof input!=='object'||!safe(input.taxableMinor)||
    !safe(input.exemptMinor)||!safe(input.notSubjectMinor)||
    typeof input.tenantId!=='string'||!input.tenantId)fail();
  const rule=assertReviewedVeRule(input.vatRule);
  if(rule.family!=='IVA'||rule.tenantId!==input.tenantId)fail();
  const total=BigInt(input.taxableMinor)+BigInt(input.exemptMinor)+BigInt(input.notSubjectMinor);
  if(total>BigInt(Number.MAX_SAFE_INTEGER))fail();
  const vat=calculateReviewedVeTaxPreview(rule,{
    tenantId:input.tenantId,eventDate:input.eventDate,baseMinor:input.taxableMinor
  });
  let retained=null;
  if(input.retentionRule!=null){
    const r=assertReviewedVeRule(input.retentionRule);
    if(r.family!=='RET_IVA'||r.tenantId!==input.tenantId)fail();
    retained=calculateReviewedVeTaxPreview(r,{
      tenantId:input.tenantId,eventDate:input.eventDate,baseMinor:vat.taxMinor
    });
  }
  const gross=total+BigInt(vat.taxMinor);
  const withholding=BigInt(retained?.taxMinor||0);
  if(withholding>BigInt(vat.taxMinor)||gross>BigInt(Number.MAX_SAFE_INTEGER))fail();
  const net=gross-withholding;
  return Object.freeze({
    tenantId:input.tenantId,eventDate:input.eventDate,
    taxableMinor:input.taxableMinor,exemptMinor:input.exemptMinor,
    notSubjectMinor:input.notSubjectMinor,
    vatMinor:vat.taxMinor,withheldVatMinor:Number(withholding),
    grossMinor:Number(gross),netAfterWithholdingMinor:Number(net),
    vatSnapshot:vat,withholdingSnapshot:retained,
    mode:'NON_POSTING_PREVIEW' as const
  });
}
