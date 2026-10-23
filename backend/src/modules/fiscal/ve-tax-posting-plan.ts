import { assertFiscalRatioDefinition, type FiscalRatioDefinition } from './fiscal-rule-governance-policy.js';

/** Exact minor-unit arithmetic. No magic tax rate, binary-money or DB code execution. */
export type TaxPostingLine = Readonly<{
  accountRole: 'ar'|'ap'|'revenue'|'cost_of_sales'|'vat_output'|'vat_input'|
    'withholding_payable'|'withholding_receivable';
  debitMinor: number; creditMinor: number;
}>;
export type AppliedRatio = Readonly<{
  ruleId: string; ruleKey: string; ruleHash: string; legalSourceId: string; legalSourceSha256: string;
  definition: FiscalRatioDefinition;
}>;
const denied=():never=>{throw new Error('VE_TAX_POSTING_PLAN_REJECTED');};
const safe=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const safeId=(v:unknown):v is string=>typeof v==='string'&&v.trim()===v&&v.length>0;
const SHA=/^[0-9a-f]{64}$/;
const numeric=(value:bigint):number=>{
  if(value<0n||value>BigInt(Number.MAX_SAFE_INTEGER))denied();
  return Number(value);
};
export function calculateRatioMinor(
  baseMinor:number, ratio:AppliedRatio, requiredBasis:FiscalRatioDefinition['basis'],
): number {
  if(!safe(baseMinor)||!ratio||!safeId(ratio.ruleId)||!safeId(ratio.ruleKey)||
     !safeId(ratio.legalSourceId)||!SHA.test(ratio.ruleHash)||!SHA.test(ratio.legalSourceSha256))denied();
  try{assertFiscalRatioDefinition(ratio.definition);}catch{denied();}
  if(ratio.definition.basis!==requiredBasis)denied();
  const amount=(2n*BigInt(baseMinor)*BigInt(ratio.definition.numerator)+
    BigInt(ratio.definition.denominator))/(2n*BigInt(ratio.definition.denominator));
  return numeric(amount);
}
function balanced(lines:readonly TaxPostingLine[]):boolean{
  const debit=lines.reduce((sum,l)=>sum+BigInt(l.debitMinor),0n);
  const credit=lines.reduce((sum,l)=>sum+BigInt(l.creditMinor),0n);
  return debit===credit&&debit>0n&&debit<=BigInt(Number.MAX_SAFE_INTEGER);
}
/** Non-posting, deterministic plan from server-selected fiscal rules.
 * Persistence must resolve semantic ChartAccounts and commit via #637 ledger. */
export function planReviewedTaxEvent(input:Readonly<{
  kind:'purchase'|'sale'; taxableMinor:number; exemptMinor:number; notSubjectMinor:number;
  vat:AppliedRatio; retainedVat?:AppliedRatio|null; retainedIslr?:AppliedRatio|null;
}>) {
  if(!input||!['purchase','sale'].includes(input.kind)||
     !safe(input.taxableMinor)||!safe(input.exemptMinor)||!safe(input.notSubjectMinor))denied();
  const base=numeric(BigInt(input.taxableMinor)+BigInt(input.exemptMinor)+BigInt(input.notSubjectMinor));
  const vatMinor=calculateRatioMinor(input.taxableMinor,input.vat,'taxable_minor');
  const retVatMinor=input.retainedVat?calculateRatioMinor(vatMinor,input.retainedVat,'tax_minor'):0;
  const retIslrMinor=input.retainedIslr?calculateRatioMinor(input.taxableMinor,input.retainedIslr,'taxable_minor'):0;
  if(retVatMinor>vatMinor||retIslrMinor>input.taxableMinor)denied();
  const withheld=numeric(BigInt(retVatMinor)+BigInt(retIslrMinor));
  const gross=numeric(BigInt(base)+BigInt(vatMinor));
  const net=numeric(BigInt(gross)-BigInt(withheld));
  const lines:TaxPostingLine[]=input.kind==='purchase'
    ?[
      {accountRole:'cost_of_sales',debitMinor:base,creditMinor:0},
      {accountRole:'vat_input',debitMinor:vatMinor,creditMinor:0},
      {accountRole:'ap',debitMinor:0,creditMinor:net},
      ...(withheld?[{accountRole:'withholding_payable' as const,debitMinor:0,creditMinor:withheld}]:[])
    ]
    :[
      {accountRole:'ar',debitMinor:net,creditMinor:0},
      ...(withheld?[{accountRole:'withholding_receivable' as const,debitMinor:withheld,creditMinor:0}]:[]),
      {accountRole:'revenue',debitMinor:0,creditMinor:base},
      {accountRole:'vat_output',debitMinor:0,creditMinor:vatMinor}
    ];
  if(!balanced(lines))denied();
  return Object.freeze({
    mode:'NON_POSTING_PLAN' as const, kind:input.kind,
    baseMinor:base,vatMinor,retainedVatMinor:retVatMinor,retainedIslrMinor:retIslrMinor,
    totalWithheldMinor:withheld,grossMinor:gross,netMinor:net,
    lines:Object.freeze(lines.map(line=>Object.freeze(line))),
    provenance:Object.freeze([input.vat,input.retainedVat,input.retainedIslr].filter((r):r is AppliedRatio=>!!r)
      .map(rule=>({ruleId:rule.ruleId,ruleKey:rule.ruleKey,ruleHash:rule.ruleHash,
        legalSourceId:rule.legalSourceId,legalSourceSha256:rule.legalSourceSha256})))
  });
}
/** Reverse the exact historical journal without consulting current rates/catalogs. */
export function reverseTaxPostingPlan(lines:readonly TaxPostingLine[]):readonly TaxPostingLine[]{
  if(!Array.isArray(lines)||!lines.length||!balanced(lines)||
     lines.some(l=>!safe(l.debitMinor)||!safe(l.creditMinor)||
       (l.debitMinor>0&&l.creditMinor>0)))denied();
  return Object.freeze(lines.map(l=>Object.freeze({
    accountRole:l.accountRole, debitMinor:l.creditMinor, creditMinor:l.debitMinor,
  })));
}
