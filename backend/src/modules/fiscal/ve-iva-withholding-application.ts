import { calculateRatioMinor, type AppliedRatio } from './ve-tax-posting-plan.js';

/** Internal AP withholding recognition, not a SENIAT certificate.
 * All rate, legal and invoice values must come from reviewed DB evidence. */
export type PostedPurchaseEvidence = Readonly<{
  tenantId:string; invoiceTenantId:string; supplierTenantId:string;
  invoiceStatus:'issued'|'paid'|'overdue'|'draft'|'cancelled';
  supplierRetentionProfile:string; taxpayerCategory:string;
  originalLedgerPosted:boolean; sourceLedgerTenantId:string;
  issuedAt:Date; recognizedAt:Date;
  currency:string; exchangeRate:string; functionalCurrency:string;
  period:string; taxableMinor:number; invoiceVatMinor:number; invoiceTotalMinor:number;
  iva:AppliedRatio; retention:AppliedRatio;
}>;
const denied=():never=>{throw new Error('VE_IVA_WITHHOLDING_APPLICATION_REJECTED');};
const integer=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
export function exactMinor(value:string):number {
  if(typeof value!=='string'||!/^\d{1,14}\.\d{2}$/.test(value)) denied();
  const [whole,fraction]=value.split('.');
  const n=BigInt(whole)*100n+BigInt(fraction);
  if(n>BigInt(Number.MAX_SAFE_INTEGER))denied();
  return Number(n);
}
export function planPostedPurchaseWithholding(input:PostedPurchaseEvidence) {
  if(!input||!input.tenantId||input.invoiceTenantId!==input.tenantId||
    input.supplierTenantId!==input.tenantId||input.sourceLedgerTenantId!==input.tenantId||
    !['issued','paid','overdue'].includes(input.invoiceStatus)||
    input.originalLedgerPosted!==true||input.supplierRetentionProfile!=='ordinary'||
    input.taxpayerCategory!=='special_notified'||input.currency!=='VES'||
    input.functionalCurrency!=='VES'||input.exchangeRate!=='1'||
    !(input.issuedAt instanceof Date)||!Number.isFinite(input.issuedAt.getTime())||
    !(input.recognizedAt instanceof Date)||!Number.isFinite(input.recognizedAt.getTime())||
    input.recognizedAt<input.issuedAt||
    input.period!==input.recognizedAt.toISOString().slice(0,7)||
    ![input.taxableMinor,input.invoiceVatMinor,input.invoiceTotalMinor].every(integer)||
    input.taxableMinor===0||input.invoiceVatMinor===0||
    !/^iva[.:]/i.test(input.iva?.ruleKey??'')||!/^ret_iva[.:]/i.test(input.retention?.ruleKey??'')) denied();
  let vat:number,withheld:number;
  try{
    vat=calculateRatioMinor(input.taxableMinor,input.iva,'taxable_minor');
    withheld=calculateRatioMinor(input.invoiceVatMinor,input.retention,'tax_minor');
  }catch{denied();}
  if(vat!==input.invoiceVatMinor||withheld<=0||withheld>vat||
    BigInt(input.taxableMinor)+BigInt(vat)!==BigInt(input.invoiceTotalMinor))denied();
  return Object.freeze({
    taxableMinor:input.taxableMinor,vatMinor:vat,withheldMinor:withheld,
    period:input.period,
    debitRole:'ap' as const,creditRole:'withholding_payable' as const,
    mode:'INTERNAL_POSTING_PLAN' as const,
  });
}
