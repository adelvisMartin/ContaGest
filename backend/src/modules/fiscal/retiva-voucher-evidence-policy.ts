/** #775: statutory IVA retention voucher evidence, validation only.
 * Ref: SNAT/2025/000054 art. 16 (GO 43.171); never issue a certificate here.
 */
export type RetivaVoucherEvidence = Readonly<{
  number:string; period:string; agentRif:string; agentName:string;
  supplierRif:string; supplierName:string; supplierFiscalAddress:string;
  invoiceNumber:string; invoiceControlNumber:string|null; invoiceDate:string;
  recognizedAt:string; deliveredAt:string|null;
  taxableMinor:number; invoiceVatMinor:number; withheldVatMinor:number;
  applicationId:string; applicationEvidenceSha256:string;
}>;
const forbidden=():never=>{throw new Error('RETIVA_VOUCHER_EVIDENCE_INVALID');};
const digits=/^\d{14}$/;
const rif=/^[VEJPGC]-?\d{8}-?\d$/i;
const iso=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const sha=/^[a-f0-9]{64}$/;
const safe=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const label=(v:unknown,n:number):v is string=>typeof v==='string'&&v.trim()===v&&v.length>=1&&v.length<=n;
const instant=(v:unknown):v is string=>{
  if(typeof v!=='string'||!iso.test(v))return false;
  const parsed=new Date(v);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,19)===v.slice(0,19);
};
/** Strictly validate the 14-character AAAAMMSSSSSSSS format, not an arbitrary sequence. */
export function assertRetivaVoucherEvidence(v:RetivaVoucherEvidence):RetivaVoucherEvidence{
  if(!v||typeof v!=='object'||Array.isArray(v)||
    !digits.test(v.number)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(v.period)||
    v.number.slice(0,6)!==v.period.replace('-','')||
    !/^[0-9]{8}$/.test(v.number.slice(6))||v.number.slice(6)==='00000000'||
    !rif.test(v.agentRif)||!rif.test(v.supplierRif)||
    !label(v.agentName,240)||!label(v.supplierName,240)||
    !label(v.supplierFiscalAddress,500)||!label(v.invoiceNumber,120)||
    !(v.invoiceControlNumber===null||label(v.invoiceControlNumber,120))||
    !instant(v.invoiceDate)||!instant(v.recognizedAt)||
    (v.deliveredAt!==null&&!instant(v.deliveredAt))||
    v.recognizedAt<v.invoiceDate||
    (v.deliveredAt!==null&&v.deliveredAt<v.recognizedAt)||
    !safe(v.taxableMinor)||!safe(v.invoiceVatMinor)||!safe(v.withheldVatMinor)||
    v.withheldVatMinor>v.invoiceVatMinor||
    !label(v.applicationId,128)||!sha.test(v.applicationEvidenceSha256))forbidden();
  return Object.freeze({...v});
}
/** Format is a presentation constraint; DB sequence must allocate under lock. */
export function formatRetivaVoucherNumber(period:string,sequence:number):string{
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||
    !Number.isSafeInteger(sequence)||sequence<1||sequence>99_999_999)forbidden();
  return period.replace('-','')+String(sequence).padStart(8,'0');
}
