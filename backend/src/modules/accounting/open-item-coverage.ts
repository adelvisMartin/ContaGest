import { createHash } from 'node:crypto';

// #744: invoice coverage evidence, NOT receivable/payable balance authority.
// No PaymentAllocation / dueDate exists in the canonical Prisma schema yet.
export type SubledgerKind = 'ar' | 'ap';
export type OpenItemEvidenceInput = Readonly<{
  tenantId: string; kind: SubledgerKind; asOf: string;
  invoices: readonly Readonly<{
    id: string; tenantId: string; number: string;
    status: string; issueDate: string; currency: string; totalExact: string;
  }>[];
}>;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
// Canonical SalesInvoice/PurchaseInvoice.total: nonnegative Decimal(18,2), max 16 integer digits.
const MONEY = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
const CURRENCY = /^[A-Z]{3}$/;
const STATES = new Set(['draft','issued','paid','overdue','cancelled']);
const fail=():never=>{throw new Error('SUBLEDGER_COVERAGE_EVIDENCE_INVALID');};
function realDay(s:unknown):s is string {
  return typeof s==='string' && DATE.test(s) &&
    Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
}
function text(s:unknown,max:number) {
  return typeof s==='string' && s.trim()===s && s.length>0 && s.length<=max;
}
function order(a:string,b:string){return a<b?-1:a>b?1:0;}
export function projectOpenItemCoverage(input:OpenItemEvidenceInput) {
  if(!input || !text(input.tenantId,160) ||
     !['ar','ap'].includes(input.kind) || !realDay(input.asOf) ||
     !Array.isArray(input.invoices) || input.invoices.length>100)fail();
  const seen=new Set<string>();
  const docs=input.invoices.map(row=>{
    if(!row || row.tenantId!==input.tenantId || !text(row.id,160) ||
       seen.has(row.id) || !text(row.number,120) ||
       !STATES.has(row.status) || typeof row.issueDate!=='string' ||
       !ISO.test(row.issueDate) || !Number.isFinite(Date.parse(row.issueDate)) ||
       new Date(row.issueDate).toISOString()!==row.issueDate ||
       row.issueDate.slice(0,10)>input.asOf ||
       typeof row.currency!=='string' || !CURRENCY.test(row.currency) ||
       typeof row.totalExact!=='string' || !MONEY.test(row.totalExact))fail();
    seen.add(row.id);
    return Object.freeze({
      sourceId:row.id,invoiceNumber:row.number,sourceStatus:row.status,
      issueDate:row.issueDate,currency:row.currency,
      sourceTotalExact:row.totalExact,
      allocationEvidence:'MISSING' as const,
      dueDateEvidence:'MISSING' as const,
      openBalanceExact:null,daysOverdue:null,
    });
  }).sort((a,b)=>order(a.sourceId,b.sourceId));
  const evidenceSha256=createHash('sha256')
    .update(JSON.stringify({tenantId:input.tenantId,kind:input.kind,asOf:input.asOf,docs}),'utf8')
    .digest('hex');
  return Object.freeze({
    tenantId:input.tenantId,kind:input.kind,asOf:input.asOf,
    evidenceSha256,sourceCount:docs.length,
    documents:Object.freeze(docs),
    status:'NOT_RECONCILABLE' as const,
    blockers:Object.freeze(['PAYMENT_ALLOCATIONS_NOT_AVAILABLE','DUE_DATE_SNAPSHOTS_NOT_AVAILABLE','GENERAL_LEDGER_RECONCILIATION_NOT_VERIFIED']),
    authoritativeOpenBalance:false,
  });
}
