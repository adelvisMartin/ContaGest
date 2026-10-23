/** #743. Read-only exception window over canonical statement lines; never a bank/GL balance. */
export type BankExceptionLine = Readonly<{
  id:string;tenantId:string;accountId:string;status:string;
  amount:string;allocated:string;remaining:string;bookedAt:Date;
}>;
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MONEY=/^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
const STATUS=new Set(['unmatched','suggested','partial','reconciled','conflict']);
const fail=():never=>{throw new Error('BANK_EXCEPTION_EVIDENCE_INVALID');};
const validId=(value:unknown):value is string=>typeof value==='string'&&ID.test(value);
function cents(s:string):bigint{
  if(typeof s!=='string'||!MONEY.test(s))fail();
  const neg=s.startsWith('-');const [major,dec='']=(neg?s.slice(1):s).split('.');
  const value=BigInt(major)*100n+BigInt(dec.padEnd(2,'0'));
  return neg?-value:value;
}
function fixed(value:bigint){const neg=value<0n,positive=neg?-value:value;return (neg?'-':'')+(positive/100n).toString()+'.'+(positive%100n).toString().padStart(2,'0');}
export function projectBankReconciliationExceptions(input:{
  tenantId:string;accountId:string;lines:readonly BankExceptionLine[];
}) {
  if(!input||!validId(input.tenantId)||!validId(input.accountId)||
     !Array.isArray(input.lines)||input.lines.length>100)fail();
  const seen=new Set<string>();const rows=[] as Array<Readonly<{
    lineId:string;status:string;bookedAt:string;absoluteAmountExact:string;
    allocatedExact:string;remainingExact:string;blockers:readonly string[];
  }>>;
  let pending=0,overallocated=0;
  for(const row of input.lines){
    if(!row||!validId(row.id)||seen.has(row.id)||row.tenantId!==input.tenantId||
      row.accountId!==input.accountId||!STATUS.has(row.status)||
      !(row.bookedAt instanceof Date)||!Number.isFinite(row.bookedAt.getTime()))fail();
    seen.add(row.id);
    const amount=cents(row.amount),allocated=cents(row.allocated),remaining=cents(row.remaining);
    const abs=amount<0n?-amount:amount;
    if(allocated<0n||remaining!==abs-allocated)fail();
    const blockers:string[]=[];
    if(remaining<0n){blockers.push('OVERALLOCATED');overallocated++;}
    if(row.status!=='reconciled'){blockers.push('UNRECONCILED_STATUS');pending++;}
    if(row.status==='reconciled'&&remaining!==0n)blockers.push('STATUS_AMOUNT_MISMATCH');
    if(blockers.length)rows.push(Object.freeze({
      lineId:row.id,status:row.status,bookedAt:row.bookedAt.toISOString(),
      absoluteAmountExact:fixed(abs),allocatedExact:fixed(allocated),
      remainingExact:fixed(remaining),blockers:Object.freeze(blockers)
    }));
  }
  return Object.freeze({
    tenantId:input.tenantId,accountId:input.accountId,
    inspectedCount:input.lines.length,exceptionCount:rows.length,
    pendingStatusCount:pending,overallocatedCount:overallocated,
    exceptions:Object.freeze(rows),
    reconciliationCertified:false as const,scope:'PAGE_ONLY' as const,
  });
}
