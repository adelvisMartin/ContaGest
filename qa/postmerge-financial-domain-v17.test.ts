import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

const RUN=`QA58FIN-${Date.now().toString(36).toUpperCase()}`;
const OPEN_PERIOD='2097-07';
const CLOSED_PERIOD='2097-08';

const num=(value:any)=>Number(value||0);
const balanced=(lines:any[])=>Math.round((lines.reduce((s,l)=>s+num(l.debit),0)-lines.reduce((s,l)=>s+num(l.credit),0))*100)/100===0;

test('post-merge financial workflows persist and enforce domain invariants',async(t)=>{
  const h=await createRealBackendHarness();
  const ids={sales:[] as string[],purchases:[] as string[],ledgers:[] as string[],closing:[] as string[],bankAccounts:[] as string[],bankMovements:[] as string[],employees:[] as string[],payrollPeriods:[] as string[],payrollReceipts:[] as string[],audits:[] as string[]};
  t.after(async()=>{
    await h.prisma.auditLog.deleteMany({where:{OR:[{entityId:{in:[...ids.sales,...ids.purchases,...ids.closing,...ids.bankAccounts,...ids.bankMovements,...ids.employees,...ids.payrollPeriods,...ids.payrollReceipts]}},{after:{path:['qaRun'],equals:RUN} as any}]}}).catch(()=>undefined);
    await h.prisma.payrollReceipt.deleteMany({where:{id:{in:ids.payrollReceipts}}}).catch(()=>undefined);
    await h.prisma.payrollPeriod.deleteMany({where:{id:{in:ids.payrollPeriods}}}).catch(()=>undefined);
    await h.prisma.employee.deleteMany({where:{id:{in:ids.employees}}}).catch(()=>undefined);
    await h.prisma.bankMovement.deleteMany({where:{id:{in:ids.bankMovements}}}).catch(()=>undefined);
    await h.prisma.bankAccount.deleteMany({where:{id:{in:ids.bankAccounts}}}).catch(()=>undefined);
    await h.prisma.ledgerEntry.deleteMany({where:{OR:[{id:{in:ids.ledgers}},{sourceId:{startsWith:RUN}}]}}).catch(()=>undefined);
    await h.prisma.salesInvoice.deleteMany({where:{id:{in:ids.sales}}}).catch(()=>undefined);
    await h.prisma.purchaseInvoice.deleteMany({where:{id:{in:ids.purchases}}}).catch(()=>undefined);
    await h.prisma.closingPeriod.deleteMany({where:{id:{in:ids.closing}}}).catch(()=>undefined);
    await h.close();
  });

  await t.test('contabilidad: balanced draft persists, explicit post publishes it; unbalanced entry is rejected',async()=>{
    const entry=await h.ok('/accounting/entries',{method:'POST',body:JSON.stringify({fiscalPeriod:OPEN_PERIOD,description:`${RUN} asiento balanceado`,source:'manual',lines:[{accountCode:`${RUN}.D`,accountName:'QA Débito',debit:100,credit:0},{accountCode:`${RUN}.C`,accountName:'QA Crédito',debit:0,credit:100}]})});
    ids.ledgers.push(entry.id);
    assert.equal(entry.fiscalPeriod,OPEN_PERIOD);
    assert.equal(entry.posted,false,'Manual ledger must start as DRAFT');
    assert.equal(balanced(entry.lines),true,'Ledger entry is not balanced');
    const stored=await h.prisma.ledgerEntry.findFirst({where:{id:entry.id,tenantId:h.tenant.id},include:{lines:true}});
    assert.ok(stored,'Ledger entry did not persist');
    assert.equal(balanced(stored.lines),true,'Stored ledger entry is not balanced');
    await h.status('/accounting/entries',422,{method:'POST',body:JSON.stringify({fiscalPeriod:OPEN_PERIOD,description:`${RUN} descuadrado`,source:'manual',lines:[{accountCode:'QA.D',accountName:'Débito',debit:100},{accountCode:'QA.C',accountName:'Crédito',credit:90}]})});

    const beforePostTrial=await h.ok('/accounting/trial-balance');
    assert.equal(beforePostTrial.some((row:any)=>row.accountCode===`${RUN}.D`),false,'DRAFT leaked into trial balance');
    const posted=await h.ok(`/accounting/entries/${entry.id}/post`,{method:'POST'});
    assert.equal(posted.posted,true);
    assert.ok(posted.postedAt);
    const trial=await h.ok('/accounting/trial-balance');
    assert.ok(Array.isArray(trial)&&trial.some((row:any)=>row.accountCode===`${RUN}.D`),'Trial balance omitted posted account');
  });

  await t.test('ventas: draft delete, issued atomic posting, cancellation reversal and idempotency',async()=>{
    const draftNo=`${RUN}-SALE-DRAFT`;
    const draft=await h.ok('/sales',{method:'POST',body:JSON.stringify({number:draftNo,fiscalPeriod:OPEN_PERIOD,status:'draft',lines:[{description:'QA draft',quantity:2,unitPrice:10,taxRate:16}]})});
    ids.sales.push(draft.id);
    assert.equal(num(draft.subtotal),20);assert.equal(num(draft.iva),3.2);assert.equal(num(draft.total),23.2);
    assert.equal(await h.prisma.ledgerEntry.count({where:{tenantId:h.tenant.id,source:'sales',sourceId:draft.id}}),0,'Draft sale unexpectedly posted ledger');
    await h.ok(`/sales/${draft.id}`,{method:'DELETE'});
    ids.sales=ids.sales.filter((id)=>id!==draft.id);
    assert.equal(await h.prisma.salesInvoice.count({where:{id:draft.id}}),0,'Draft sale remained after delete');

    const number=`${RUN}-SALE`;
    const sale=await h.ok('/sales',{method:'POST',body:JSON.stringify({number,fiscalPeriod:OPEN_PERIOD,status:'issued',currency:'VES',lines:[{description:'QA item A',quantity:2,unitPrice:25,taxRate:16},{description:'QA item B',quantity:1,unitPrice:10,taxRate:0}]})});
    ids.sales.push(sale.id);if(sale.ledgerEntryId)ids.ledgers.push(sale.ledgerEntryId);
    assert.equal(num(sale.subtotal),60);assert.equal(num(sale.iva),8);assert.equal(num(sale.total),68);
    const ledger=await h.prisma.ledgerEntry.findFirst({where:{tenantId:h.tenant.id,source:'sales',sourceId:sale.id},include:{lines:true}});
    assert.ok(ledger,'Issued sale did not create ledger');ids.ledgers.push(ledger.id);
    assert.equal(ledger.posted,true,'Issued sale ledger is not POSTED');
    assert.ok(ledger.postedAt,'Issued sale ledger lacks posting timestamp');
    assert.equal(ledger.salesInvoiceId,sale.id,'Sales ledger is not linked to invoice');
    assert.equal(balanced(ledger.lines),true,'Sales ledger is not balanced');
    assert.equal(ledger.lines.reduce((s,l)=>s+num(l.debit),0),68);

    const cancelled=await h.ok(`/sales/${sale.id}/cancel`,{method:'PATCH',body:JSON.stringify({reason:'QA cancellation verification'})});
    assert.equal(cancelled.sale.status,'cancelled');assert.ok(cancelled.reversalId,'Sale cancellation did not create reversal');ids.ledgers.push(cancelled.reversalId);
    const reversal=await h.prisma.ledgerEntry.findUnique({where:{id:cancelled.reversalId},include:{lines:true}});
    assert.ok(reversal);assert.equal(reversal.posted,true);assert.equal(reversal.reversalOfId,ledger.id);assert.equal(balanced(reversal.lines),true,'Sales reversal is not balanced');
    assert.equal(reversal.lines.reduce((s,l)=>s+num(l.credit),0),68,'Sales reversal did not invert original debit');
    const again=await h.ok(`/sales/${sale.id}/cancel`,{method:'PATCH',body:JSON.stringify({reason:'QA idempotency'})});
    assert.equal(again.alreadyCancelled,true);assert.equal(again.reversalId,cancelled.reversalId,'Repeated cancellation created/returned another reversal');
  });

  await t.test('compras: issued posting and auditable cancellation reversal',async()=>{
    const number=`${RUN}-PURCHASE`;
    const purchase=await h.ok('/purchases',{method:'POST',body:JSON.stringify({number,fiscalPeriod:OPEN_PERIOD,status:'issued',lines:[{description:'QA compra',quantity:3,unitCost:20,taxRate:16}]})});
    ids.purchases.push(purchase.id);if(purchase.ledgerEntryId)ids.ledgers.push(purchase.ledgerEntryId);
    assert.equal(num(purchase.subtotal),60);assert.equal(num(purchase.iva),9.6);assert.equal(num(purchase.total),69.6);
    const ledger=await h.prisma.ledgerEntry.findFirst({where:{tenantId:h.tenant.id,source:'purchase',sourceId:purchase.id},include:{lines:true}});
    assert.ok(ledger);ids.ledgers.push(ledger.id);assert.equal(ledger.posted,true);assert.ok(ledger.postedAt);assert.equal(balanced(ledger.lines),true);
    const cancelled=await h.ok(`/purchases/${purchase.id}/cancel`,{method:'PATCH',body:JSON.stringify({reason:'QA purchase cancellation'})});
    assert.equal(cancelled.purchase.status,'cancelled');assert.ok(cancelled.reversalId);ids.ledgers.push(cancelled.reversalId);
    const reversal=await h.prisma.ledgerEntry.findUnique({where:{id:cancelled.reversalId},include:{lines:true}});
    assert.ok(reversal);assert.equal(reversal.posted,true);assert.equal(reversal.reversalOfId,ledger.id);assert.equal(balanced(reversal.lines),true,'Purchase reversal is not balanced');
    const again=await h.ok(`/purchases/${purchase.id}/cancel`,{method:'PATCH',body:JSON.stringify({reason:'QA idempotency'})});
    assert.equal(again.alreadyCancelled,true);assert.equal(again.reversalId,cancelled.reversalId);
  });

  await t.test('cierre contable: close is persistent and blocks manual, sales and purchase posting',async()=>{
    const period=await h.ok('/accounting/closing-periods',{method:'POST',body:JSON.stringify({period:CLOSED_PERIOD,note:`${RUN} close gate`})});ids.closing.push(period.id);
    assert.equal(period.status,'open');
    const closed=await h.ok(`/accounting/closing-periods/${period.id}/close`,{method:'POST',body:JSON.stringify({note:`${RUN} closed`})});
    assert.equal(closed.status,'closed');assert.ok(closed.closedAt);
    await h.status('/accounting/entries',409,{method:'POST',body:JSON.stringify({fiscalPeriod:CLOSED_PERIOD,description:`${RUN} blocked entry`,lines:[{accountCode:'QA.D',accountName:'Débito',debit:1},{accountCode:'QA.C',accountName:'Crédito',credit:1}]})});
    const blockedSaleNo=`${RUN}-BLOCKED-SALE`;
    await h.status('/sales',409,{method:'POST',body:JSON.stringify({number:blockedSaleNo,fiscalPeriod:CLOSED_PERIOD,status:'issued',lines:[{description:'blocked',quantity:1,unitPrice:10,taxRate:16}]})});
    assert.equal(await h.prisma.salesInvoice.count({where:{tenantId:h.tenant.id,number:blockedSaleNo}}),0,'Closed-period sale left orphan invoice');
    const blockedPurchaseNo=`${RUN}-BLOCKED-PURCHASE`;
    await h.status('/purchases',409,{method:'POST',body:JSON.stringify({number:blockedPurchaseNo,fiscalPeriod:CLOSED_PERIOD,status:'issued',lines:[{description:'blocked',quantity:1,unitCost:10,taxRate:16}]})});
    assert.equal(await h.prisma.purchaseInvoice.count({where:{tenantId:h.tenant.id,number:blockedPurchaseNo}}),0,'Closed-period purchase left orphan invoice');
  });

  await t.test('bancos: movement updates balance, reconcile protects deletion, cleanup restores balance',async()=>{
    const account=await h.ok('/bank-accounts',{method:'POST',body:JSON.stringify({bankName:`${RUN} Banco`,accountNo:`${RUN}-ACCT`,currency:'USD',balance:100})});ids.bankAccounts.push(account.id);
    const movement=await h.ok('/banking/movements',{method:'POST',body:JSON.stringify({accountId:account.id,description:`${RUN} ingreso`,reference:RUN,type:'income',currency:'USD',amount:35.5})});ids.bankMovements.push(movement.id);
    assert.equal(movement.type,'income');assert.equal(num(movement.amount),35.5);
    let storedAccount=await h.prisma.bankAccount.findUnique({where:{id:account.id}});assert.equal(num(storedAccount?.balance),135.5,'Bank balance did not increment');
    const reconciled=await h.ok(`/banking/movements/${movement.id}/reconcile`,{method:'PATCH',body:JSON.stringify({matched:true})});assert.equal(reconciled.reconciled,true);
    await h.status(`/banking/movements/${movement.id}`,409,{method:'DELETE'});
    await h.ok(`/banking/movements/${movement.id}/reconcile`,{method:'PATCH',body:JSON.stringify({matched:false})});
    await h.ok(`/banking/movements/${movement.id}`,{method:'DELETE'});ids.bankMovements=ids.bankMovements.filter((id)=>id!==movement.id);
    storedAccount=await h.prisma.bankAccount.findUnique({where:{id:account.id}});assert.equal(num(storedAccount?.balance),100,'Deleting unreconciled movement did not restore balance');
    await h.ok(`/bank-accounts/${account.id}`,{method:'DELETE'});ids.bankAccounts=ids.bankAccounts.filter((id)=>id!==account.id);
  });

  await t.test('rrhh/nomina: employee persistence, receipt totals and forward-only terminal lifecycle',async()=>{
    const employee=await h.ok('/employees',{method:'POST',body:JSON.stringify({idNumber:`${RUN}-ID`,fullName:`${RUN} Empleado`,position:'QA Analyst',department:'QA',salary:1000})});ids.employees.push(employee.id);
    const edited=await h.ok(`/employees/${employee.id}`,{method:'PUT',body:JSON.stringify({position:'QA Senior Analyst',salary:1100})});assert.equal(edited.position,'QA Senior Analyst');assert.equal(num(edited.salary),1100);
    const persistedEmployee=await h.ok(`/employees/${employee.id}`);assert.equal(persistedEmployee.position,'QA Senior Analyst');

    const periodName=`${RUN}-P1`;
    const period=await h.ok('/payroll/periods',{method:'POST',body:JSON.stringify({period:periodName})});ids.payrollPeriods.push(period.id);
    const receiptResult=await h.ok('/payroll/receipts',{method:'POST',body:JSON.stringify({periodId:period.id,employeeId:employee.id,gross:1100,deductions:100,net:1000,details:{qaRun:RUN}})});
    ids.payrollReceipts.push(receiptResult.receipt.id);
    assert.equal(num(receiptResult.period.totalGross),1100);assert.equal(num(receiptResult.period.totalDeductions),100);assert.equal(num(receiptResult.period.totalNet),1000);
    const approved=await h.ok(`/payroll/periods/${period.id}/status`,{method:'PATCH',body:JSON.stringify({status:'approved'})});assert.equal(approved.status,'approved');
    const paid=await h.ok(`/payroll/periods/${period.id}/status`,{method:'PATCH',body:JSON.stringify({status:'paid'})});assert.equal(paid.status,'paid');
    await h.status(`/payroll/periods/${period.id}/status`,409,{method:'PATCH',body:JSON.stringify({status:'draft'})});
    await h.status(`/payroll/receipts/${receiptResult.receipt.id}`,409,{method:'DELETE'});
    const storedPeriod=await h.prisma.payrollPeriod.findUnique({where:{id:period.id}});assert.equal(storedPeriod?.status,'paid','Paid status did not persist');
  });
});
