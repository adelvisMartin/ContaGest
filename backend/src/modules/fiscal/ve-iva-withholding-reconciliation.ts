/** Pure internal RET_IVA reconciliation. Never signals SENIAT filing readiness. */
export type WithholdingReconciliationRow = Readonly<{
  id:string;tenantId:string;purchaseInvoiceId:string;status:'POSTED'|'REVERSED';
  purchaseStatus:string;sourceLedgerPosted:boolean;
  ledgerEntryId:string;ledgerPosted:boolean;ledgerSourceId:string;
  reversalLedgerEntryId:string|null;reversalLedgerPosted:boolean|null;
  reversalOfId:string|null;reversalLinesInverse:boolean;withheldMinor:string;
  postedDebitMinor:string;postedCreditMinor:string;
  reversalDebitMinor:string;reversalCreditMinor:string;
  evidenceValid:boolean;
}>;
const money=/^\d{1,16}$/;
const blocked=():never=>{throw new Error('RETIVA_INTERNAL_RECONCILIATION_INVALID');};
const parse=(text:string)=>{if(typeof text!=='string'||!money.test(text))blocked();return BigInt(text);};
export function reconcileVatWithholdingApplications(tenantId:string,period:string,rows:readonly WithholdingReconciliationRow[]){
  if(!tenantId||!/^(20|21)\d{2}-(0[1-9]|1[0-2])$/.test(period)||!Array.isArray(rows)||rows.length>1000)blocked();
  const seen=new Set<string>();
  let gross=0n,reverse=0n;
  const evidence=rows.map(row=>{
    if(!row||row.tenantId!==tenantId||typeof row.id!=='string'||!row.id||
      seen.has(row.id)||typeof row.purchaseInvoiceId!=='string'||!row.purchaseInvoiceId||
      !['POSTED','REVERSED'].includes(row.status))blocked();
    seen.add(row.id);
    const amount=parse(row.withheldMinor);
    const debit=parse(row.postedDebitMinor);
    const credit=parse(row.postedCreditMinor);
    const reasons:string[]=[];
    if(!row.evidenceValid)reasons.push('WITHHOLDING_EVIDENCE_HASH_MISMATCH');
    if(!row.sourceLedgerPosted)reasons.push('SOURCE_PURCHASE_NOT_POSTED');
    if(!row.ledgerPosted||row.ledgerSourceId!==row.id)
      reasons.push('WITHHOLDING_JOURNAL_NOT_POSTED');
    if(amount===0n||debit!==amount||credit!==amount)
      reasons.push('WITHHOLDING_JOURNAL_OUT_OF_BALANCE');
    if(row.status==='POSTED'){
      if(row.purchaseStatus==='cancelled')reasons.push('ACTIVE_WITHHOLDING_FOR_CANCELLED_PURCHASE');
      if(row.reversalLedgerEntryId!==null||row.reversalOfId!==null)
        reasons.push('ACTIVE_HAS_REVERSAL');
    }else{
      if(!row.reversalLedgerEntryId||row.reversalLedgerPosted!==true||
        row.reversalOfId!==row.ledgerEntryId)
        reasons.push('REVERSAL_JOURNAL_MISSING');
      if(parse(row.reversalDebitMinor)!==amount||parse(row.reversalCreditMinor)!==amount)
        reasons.push('REVERSAL_JOURNAL_OUT_OF_BALANCE');
      if(row.reversalLinesInverse!==true)reasons.push('REVERSAL_LINES_NOT_INVERSE');
    }
    gross+=amount;
    if(row.status==='REVERSED')reverse+=amount;
    return Object.freeze({
      id:row.id,purchaseInvoiceId:row.purchaseInvoiceId,status:row.status,
      withheldMinor:row.withheldMinor,blockingIssues:Object.freeze(reasons)
    });
  });
  const issueCount=evidence.reduce((sum,row)=>sum+row.blockingIssues.length,0);
  return Object.freeze({
    tenantId,period,applicationCount:rows.length,
    grossWithheldMinor:gross.toString(),reversedMinor:reverse.toString(),
    netOutstandingMinor:(gross-reverse).toString(),issueCount,
    rows:Object.freeze(evidence),
    status:rows.length===0?'BLOCKED_EMPTY_PERIOD':
      issueCount===0?'RECONCILED_INTERNAL_ONLY':'BLOCKED_INTERNAL_RECONCILIATION',
    officialCertificateVerified:false,externalFilingVerified:false
  });
}
