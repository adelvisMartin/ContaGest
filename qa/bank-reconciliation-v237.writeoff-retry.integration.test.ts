import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { prisma } from '../backend/src/database/prisma.js';
import {
  createWriteoff,
  importBankStatement,
  listStatementLines,
  reverseReconciliation
} from '../backend/src/modules/bank-reconciliation/bank-reconciliation.service.js';

after(async()=>{await prisma.$disconnect();});

async function fixture(label:string,amount='20.00'){
  const suffix=randomUUID().slice(0,8);
  const tenant=await prisma.tenant.create({data:{rif:`QA-237-WR-${label}-${suffix}`,name:`QA 237 writeoff retry ${label}`}});
  const user=await prisma.userProfile.create({data:{tenantId:tenant.id,email:`wr-${suffix}@example.test`,fullName:`Writeoff Retry ${label}`}});
  const account=await prisma.bankAccount.create({data:{tenantId:tenant.id,bankName:'Banco QA',accountNo:`WR-${suffix}`,currency:'VES',balance:'0'}});
  await prisma.chartAccount.createMany({data:[
    {tenantId:tenant.id,code:'1.1.01.237',name:'Banco conciliación',type:'asset',nature:'debit',allowPosting:true,active:true},
    {tenantId:tenant.id,code:'6.1.99.237',name:'Ajustes bancarios',type:'expense',nature:'debit',allowPosting:true,active:true}
  ]});
  const bytes=Buffer.from(`date,amount,currency,reference,memo,counterparty\n2026-09-12,-${amount},VES,WR-${suffix},Comision QA,Banco QA\n`,'utf8');
  await importBankStatement({tenantId:tenant.id,userId:user.id,accountId:account.id,fileName:`wr-${suffix}.csv`,bytes});
  const [line]=await listStatementLines(tenant.id,{accountId:account.id,status:'all'});
  return {tenant,user,account,line};
}

const payload=(fx:any)=>({tenantId:fx.tenant.id,userId:fx.user.id,lineId:fx.line.id,amount:fx.line.remaining,writeoffAccountCode:'6.1.99.237',bankLedgerAccountCode:'1.1.01.237',reason:'Comisión bancaria QA',fiscalPeriod:'2026-09'});

test('v237 concurrent retries with the same write-off key converge to one reconciliation and one ledger entry',async(t)=>{
  const fx=await fixture('SAME');t.after(async()=>{await prisma.tenant.delete({where:{id:fx.tenant.id}});});
  const idempotencyKey=`wo-same-${randomUUID()}`;
  const attempts=await Promise.allSettled([
    createWriteoff({...payload(fx),idempotencyKey}),
    createWriteoff({...payload(fx),idempotencyKey})
  ]);
  assert.equal(attempts.filter((item)=>item.status==='fulfilled').length,2);
  const values=attempts.filter((item):item is PromiseFulfilledResult<any>=>item.status==='fulfilled').map((item)=>item.value);
  assert.equal(new Set(values.map((item)=>item.reconciliation.id)).size,1);
  const reconciliations=await prisma.$queryRaw<Array<{count:bigint}>>`SELECT COUNT(*)::bigint AS count FROM "BankReconciliation" WHERE "tenantId"=${fx.tenant.id} AND "idempotencyKey"=${idempotencyKey}`;
  assert.equal(Number(reconciliations[0].count),1);
  const ledgers=await prisma.ledgerEntry.count({where:{tenantId:fx.tenant.id,source:'banking',sourceId:{startsWith:'bank-reconciliation:'}}});
  assert.equal(ledgers,1);
});

test('v237 two write-offs cannot concurrently reserve the same remaining statement amount',async(t)=>{
  const fx=await fixture('DIFF');t.after(async()=>{await prisma.tenant.delete({where:{id:fx.tenant.id}});});
  const attempts=await Promise.allSettled([
    createWriteoff({...payload(fx),idempotencyKey:`wo-a-${randomUUID()}`}),
    createWriteoff({...payload(fx),idempotencyKey:`wo-b-${randomUUID()}`})
  ]);
  assert.equal(attempts.filter((item)=>item.status==='fulfilled').length,1);
  assert.equal(attempts.filter((item)=>item.status==='rejected').length,1);
  const confirmed=await prisma.$queryRaw<Array<{count:bigint;total:any}>>`SELECT COUNT(*)::bigint AS count,COALESCE(SUM("matchedAmount"),0)::numeric(18,2) AS total FROM "BankReconciliation" WHERE "tenantId"=${fx.tenant.id} AND "statementLineId"=${fx.line.id} AND "status"='confirmed'`;
  assert.equal(Number(confirmed[0].count),1);
  assert.equal(confirmed[0].total.toFixed(2),'20.00');
});

test('v237 concurrent reversal converges to one linked ledger reversal and preserved reconciliation',async(t)=>{
  const fx=await fixture('REV');t.after(async()=>{await prisma.tenant.delete({where:{id:fx.tenant.id}});});
  const created=await createWriteoff({...payload(fx),idempotencyKey:`wo-rev-${randomUUID()}`});
  const attempts=await Promise.allSettled([
    reverseReconciliation({tenantId:fx.tenant.id,userId:fx.user.id,reconciliationId:created.reconciliation.id,fiscalPeriod:'2026-09',reason:'Reverso QA concurrente A'}),
    reverseReconciliation({tenantId:fx.tenant.id,userId:fx.user.id,reconciliationId:created.reconciliation.id,fiscalPeriod:'2026-09',reason:'Reverso QA concurrente B'})
  ]);
  assert.equal(attempts.filter((item)=>item.status==='fulfilled').length,2);
  const current=(await prisma.$queryRaw<Array<any>>`SELECT * FROM "BankReconciliation" WHERE "tenantId"=${fx.tenant.id} AND "id"=${created.reconciliation.id}`)[0];
  assert.equal(current.status,'reversed');
  assert.ok(current.reversalLedgerEntryId);
  const reversalCount=await prisma.ledgerEntry.count({where:{tenantId:fx.tenant.id,reversalOfId:created.reconciliation.ledgerEntryId}});
  assert.equal(reversalCount,1);
});
