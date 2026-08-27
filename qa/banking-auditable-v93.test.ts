import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

const RUN=`QA93-${Date.now().toString(36).toUpperCase()}`;
const key=(name:string)=>`${RUN}-${name}-${randomUUID()}`;
const headers=(name:string)=>({ 'Idempotency-Key':key(name), 'x-request-id':`${RUN}-${name}`.slice(0,96) });
const body=(value:any)=>JSON.stringify(value);
const exact=(value:any)=>String(value?.balanceExact ?? value?.balance ?? '0');

test('issue #93 banking balances are append-only and auditable on real PostgreSQL',async(t)=>{
  const h=await createRealBackendHarness();
  const accountIds:string[]=[];
  const movementIds:string[]=[];
  const ledgerIds:string[]=[];
  const tenantB=await h.prisma.tenant.create({data:{rif:`${RUN}-B`,name:`${RUN} tenant B`,legalName:`${RUN} tenant B`}});

  t.after(async()=>{
    await h.prisma.$executeRaw`DELETE FROM "BankMovementAuditLink" WHERE "tenantId" IN (${h.tenant.id}, ${tenantB.id})`.catch(()=>undefined);
    await h.prisma.auditLog.deleteMany({where:{tenantId:h.tenant.id,OR:[{entityId:{in:[...accountIds,...movementIds]}},{action:{startsWith:'bank.'}},{action:{startsWith:'banking.'}}]}}).catch(()=>undefined);
    await h.prisma.idempotencyRecord.deleteMany({where:{tenantId:{in:[h.tenant.id,tenantB.id]},requestId:{startsWith:RUN}}}).catch(()=>undefined);
    await h.prisma.bankMovement.deleteMany({where:{tenantId:{in:[h.tenant.id,tenantB.id]},OR:[{id:{in:movementIds}},{description:{contains:RUN}}]}}).catch(()=>undefined);
    await h.prisma.bankAccount.deleteMany({where:{id:{in:accountIds}}}).catch(()=>undefined);
    await h.prisma.ledgerEntry.deleteMany({where:{id:{in:ledgerIds}}}).catch(()=>undefined);
    await h.prisma.tenant.delete({where:{id:tenantB.id}}).catch(()=>undefined);
    await h.close();
  });

  await t.test('generic CRUD rejects a client-supplied balance',async()=>{
    const result=await h.status('/bank-accounts',422,{method:'POST',body:body({bankName:`${RUN} Direct`,accountNo:`${RUN}-DIRECT`,currency:'USD',balance:'999.99'})});
    assert.equal(result.payload?.message,'Datos inválidos');
    assert.equal(await h.prisma.bankAccount.count({where:{tenantId:h.tenant.id,accountNo:`${RUN}-DIRECT`}}),0);
  });

  await t.test('opening balance is created with one linked movement and is retry-safe',async()=>{
    const requestBody={bankName:`${RUN} Opening`,accountNo:`${RUN}-OPEN`,currency:'USD',openingBalance:'100.25'};
    const requestHeaders={ 'Idempotency-Key':`${RUN}-OPEN-0123456789`, 'x-request-id':`${RUN}-OPEN` };
    const first=await h.ok('/banking/accounts',{method:'POST',headers:requestHeaders,body:body(requestBody)});
    const second=await h.ok('/banking/accounts',{method:'POST',headers:requestHeaders,body:body(requestBody)});
    accountIds.push(first.id);
    assert.equal(first.id,second.id);
    assert.equal(exact(first),'100.25');
    const movements=await h.prisma.bankMovement.findMany({where:{tenantId:h.tenant.id,accountId:first.id}});
    movementIds.push(...movements.map((row)=>row.id));
    assert.equal(movements.length,1);
    assert.equal(String(movements[0].credit),'100.25');
    assert.equal(String(movements[0].debit),'0');
    const links=await h.prisma.$queryRaw<Array<{kind:string;relatedMovementId:string}>>`SELECT "kind", "relatedMovementId" FROM "BankMovementAuditLink" WHERE "tenantId"=${h.tenant.id} AND "accountId"=${first.id}`;
    assert.equal(links.length,1);
    assert.equal(links[0].kind,'opening');
    assert.equal(links[0].relatedMovementId,movements[0].id);
  });

  await t.test('income and expense reversals preserve originals and restore the exact balance',async()=>{
    const account=await h.ok('/banking/accounts',{method:'POST',headers:headers('REV-ACCOUNT'),body:body({bankName:`${RUN} Reversal`,accountNo:`${RUN}-REV`,currency:'USD',openingBalance:'50.00'})});
    accountIds.push(account.id);
    const opening=await h.prisma.bankMovement.findFirst({where:{tenantId:h.tenant.id,accountId:account.id,reference:'OPENING'}});if(opening)movementIds.push(opening.id);
    const income=await h.ok('/banking/movements',{method:'POST',headers:headers('INCOME'),body:body({accountId:account.id,description:`${RUN} income`,type:'income',currency:'USD',amount:'10.10'})});movementIds.push(income.id);
    const expense=await h.ok('/banking/movements',{method:'POST',headers:headers('EXPENSE'),body:body({accountId:account.id,description:`${RUN} expense`,type:'expense',currency:'USD',amount:'3.05'})});movementIds.push(expense.id);
    let stored=await h.prisma.bankAccount.findUniqueOrThrow({where:{id:account.id}});
    assert.equal(String(stored.balance),'57.05');

    const reverseIncome=await h.ok(`/banking/movements/${income.id}/reverse`,{method:'POST',headers:headers('REV-INCOME'),body:body({reason:'QA reversal income'})});movementIds.push(reverseIncome.id);
    const reverseExpense=await h.ok(`/banking/movements/${expense.id}/reverse`,{method:'POST',headers:headers('REV-EXPENSE'),body:body({reason:'QA reversal expense'})});movementIds.push(reverseExpense.id);
    stored=await h.prisma.bankAccount.findUniqueOrThrow({where:{id:account.id}});
    assert.equal(String(stored.balance),'50');
    assert.equal(await h.prisma.bankMovement.count({where:{id:{in:[income.id,expense.id]}}}),2,'Original bank movements were deleted');
    const links=await h.prisma.$queryRaw<Array<{kind:string;originalMovementId:string}>>`SELECT "kind", "originalMovementId" FROM "BankMovementAuditLink" WHERE "tenantId"=${h.tenant.id} AND "originalMovementId" IN (${income.id},${expense.id})`;
    assert.equal(links.filter((row)=>row.kind==='reversal').length,2);
    await h.status(`/banking/movements/${income.id}/reverse`,409,{method:'POST',headers:headers('REV-INCOME-AGAIN'),body:body({reason:'QA second reversal denied'})});
    await h.status(`/banking/movements/${income.id}`,409,{method:'DELETE'});
  });

  await t.test('correction creates a reversal plus replacement without rewriting history',async()=>{
    const account=await h.ok('/banking/accounts',{method:'POST',headers:headers('CORR-ACCOUNT'),body:body({bankName:`${RUN} Correction`,accountNo:`${RUN}-CORR`,currency:'VES',openingBalance:'20.00'})});accountIds.push(account.id);
    const opening=await h.prisma.bankMovement.findFirst({where:{tenantId:h.tenant.id,accountId:account.id,reference:'OPENING'}});if(opening)movementIds.push(opening.id);
    const original=await h.ok('/banking/movements',{method:'POST',headers:headers('CORR-ORIGINAL'),body:body({accountId:account.id,description:`${RUN} wrong expense`,type:'expense',currency:'VES',amount:'7.00'})});movementIds.push(original.id);
    const result=await h.ok(`/banking/movements/${original.id}/correct`,{method:'POST',headers:headers('CORRECT'),body:body({reason:'QA wrong amount correction',description:`${RUN} corrected expense`,reference:`${RUN}-CORRECTED`,type:'expense',amount:'5.50'})});
    movementIds.push(result.reversal.id,result.correction.id);
    assert.equal(result.originalId,original.id);
    const stored=await h.prisma.bankAccount.findUniqueOrThrow({where:{id:account.id}});
    assert.equal(String(stored.balance),'14.5');
    assert.ok(await h.prisma.bankMovement.findUnique({where:{id:original.id}}));
    const links=await h.prisma.$queryRaw<Array<{kind:string;relatedMovementId:string}>>`SELECT "kind", "relatedMovementId" FROM "BankMovementAuditLink" WHERE "tenantId"=${h.tenant.id} AND "originalMovementId"=${original.id} ORDER BY "kind"`;
    assert.deepEqual(new Set(links.map((row)=>row.kind)),new Set(['reversal','correction']));
  });

  await t.test('ledger reconciliation is tenant-scoped and reconciled movements require explicit unreconcile before reversal',async()=>{
    const account=await h.ok('/banking/accounts',{method:'POST',headers:headers('LEDGER-ACCOUNT'),body:body({bankName:`${RUN} Ledger`,accountNo:`${RUN}-LEDGER`,currency:'VES',openingBalance:'0'})});accountIds.push(account.id);
    const movement=await h.ok('/banking/movements',{method:'POST',headers:headers('LEDGER-MOVE'),body:body({accountId:account.id,description:`${RUN} ledger move`,type:'income',currency:'VES',amount:'9.00'})});movementIds.push(movement.id);
    const ledgerA=await h.prisma.ledgerEntry.create({data:{tenantId:h.tenant.id,fiscalPeriod:'2099-01',description:`${RUN} ledger A`}});ledgerIds.push(ledgerA.id);
    const ledgerB=await h.prisma.ledgerEntry.create({data:{tenantId:tenantB.id,fiscalPeriod:'2099-01',description:`${RUN} ledger B`}});ledgerIds.push(ledgerB.id);
    await h.status(`/banking/movements/${movement.id}/reconcile`,404,{method:'PATCH',body:body({matched:true,ledgerEntryId:ledgerB.id})});
    const reconciled=await h.ok(`/banking/movements/${movement.id}/reconcile`,{method:'PATCH',body:body({matched:true,ledgerEntryId:ledgerA.id})});
    assert.equal(reconciled.reconciled,true);
    assert.equal(reconciled.ledgerEntryId,ledgerA.id);
    await h.status(`/banking/movements/${movement.id}/reverse`,409,{method:'POST',headers:headers('RECON-REV-DENIED'),body:body({reason:'QA must unreconcile first'})});
    const unreconciled=await h.ok(`/banking/movements/${movement.id}/reconcile`,{method:'PATCH',body:body({matched:false})});
    assert.equal(unreconciled.reconciled,false);
    assert.equal(unreconciled.ledgerEntryId,null);
    const reversal=await h.ok(`/banking/movements/${movement.id}/reverse`,{method:'POST',headers:headers('RECON-REV'),body:body({reason:'QA reversal after unreconcile'})});movementIds.push(reversal.id);
  });

  await t.test('tenant isolation blocks foreign movements and concurrent movements reconcile exactly',async()=>{
    const foreignAccount=await h.prisma.bankAccount.create({data:{tenantId:tenantB.id,bankName:`${RUN} Foreign`,accountNo:`${RUN}-FOREIGN`,currency:'USD',balance:0}});accountIds.push(foreignAccount.id);
    const foreignMovement=await h.prisma.bankMovement.create({data:{tenantId:tenantB.id,accountId:foreignAccount.id,description:`${RUN} foreign`,credit:'1.00',debit:'0.00'}});movementIds.push(foreignMovement.id);
    await h.status(`/banking/movements/${foreignMovement.id}/reverse`,404,{method:'POST',headers:headers('FOREIGN'),body:body({reason:'QA cross tenant denied'})});

    const account=await h.ok('/banking/accounts',{method:'POST',headers:headers('CONC-ACCOUNT'),body:body({bankName:`${RUN} Concurrent`,accountNo:`${RUN}-CONCURRENT`,currency:'USD',openingBalance:'0'})});accountIds.push(account.id);
    const results=await Promise.all(Array.from({length:10},(_,index)=>h.ok('/banking/movements',{method:'POST',headers:headers(`CONC-${index}`),body:body({accountId:account.id,description:`${RUN} concurrent ${index}`,type:'income',currency:'USD',amount:'0.10'})})));
    movementIds.push(...results.map((row)=>row.id));
    const stored=await h.prisma.bankAccount.findUniqueOrThrow({where:{id:account.id}});
    assert.equal(String(stored.balance),'1');
    const summary=await h.ok('/banking/summary');
    const projected=summary.accounts.find((row:any)=>row.id===account.id);
    assert.equal(projected?.balanceExact,'1.00');
    assert.equal(projected?.projectedBalanceExact,'1.00');
    assert.equal(projected?.integrity,'ok');
  });

  await t.test('audit log captures the financial lifecycle actor/reason events',async()=>{
    const rows=await h.prisma.auditLog.findMany({where:{tenantId:h.tenant.id,action:{in:['bank.movement.created','bank.movement.reversed','bank.movement.corrected','bank.movement.reconciled','bank.movement.unreconciled','banking.account-opened']}}});
    assert.ok(rows.some((row)=>row.action==='bank.movement.reversed'));
    assert.ok(rows.some((row)=>row.action==='bank.movement.corrected'));
    assert.ok(rows.every((row)=>row.userId===h.admin.id),'Audit records did not preserve the authenticated actor');
  });
});