import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { prisma } from '../backend/src/database/prisma.js';
import {
  getClosingBalanceSummary,
  getMatchingCandidates,
  getReconciliationHistory,
  importBankStatement,
  listStatementLines,
  reconcileStatementLine,
  reverseReconciliation
} from '../backend/src/modules/bank-reconciliation/bank-reconciliation.service.js';

const tenantData=(label:string)=>({rif:`QA-237-${label}-${randomUUID().slice(0,8)}`,name:`QA reconciliation ${label}`});
const csv=(rows:string[])=>Buffer.from(['date,amount,currency,reference,memo,counterparty',...rows].join('\n'),'utf8');
const idem=(label:string)=>`qa-237-${label}-${randomUUID()}`;
after(async()=>{await prisma.$disconnect();});

async function fixture(label:string){
  const tenant=await prisma.tenant.create({data:tenantData(label)});
  const user=await prisma.userProfile.create({data:{tenantId:tenant.id,email:`qa-${randomUUID().slice(0,8)}@example.test`,fullName:`QA ${label}`}});
  const account=await prisma.bankAccount.create({data:{tenantId:tenant.id,bankName:'Banco QA',accountNo:`QA-${randomUUID().slice(0,8)}`,currency:'VES',balance:'0'}});
  return {tenant,user,account};
}

async function importRows(fx:Awaited<ReturnType<typeof fixture>>,label:string,rows:string[]){
  const result=await importBankStatement({tenantId:fx.tenant.id,userId:fx.user.id,accountId:fx.account.id,fileName:`${label}.csv`,mimeType:'text/csv',bytes:csv(rows),sourceMetadata:{fixture:label}});
  const lines=await listStatementLines(fx.tenant.id,{accountId:fx.account.id,status:'all',take:500});
  return {result,lines};
}

test('v237 PostgreSQL: duplicate import, tenant isolation, explainable exact/ref mismatch and FX review',async(t)=>{
  const a=await fixture('A'); const b=await fixture('B');
  t.after(async()=>{await prisma.tenant.deleteMany({where:{id:{in:[a.tenant.id,b.tenant.id]}}});});
  const bytes=csv(['2026-09-01,100.00,VES,REF-EXACT,Pago cliente,Cliente Uno']);
  const first=await importBankStatement({tenantId:a.tenant.id,userId:a.user.id,accountId:a.account.id,fileName:'exact.csv',mimeType:'text/csv',bytes});
  const replay=await importBankStatement({tenantId:a.tenant.id,userId:a.user.id,accountId:a.account.id,fileName:'same.csv',mimeType:'text/csv',bytes});
  assert.equal(first.duplicate,false); assert.equal(first.inserted,1); assert.equal(replay.duplicate,true); assert.equal(replay.importId,first.importId);
  const [line]=await listStatementLines(a.tenant.id,{accountId:a.account.id,status:'all'}); assert.ok(line);
  await assert.rejects(()=>getMatchingCandidates(b.tenant.id,line.id),(error:any)=>error?.status===404,'tenant B must not inspect tenant A line');

  await prisma.bankMovement.create({data:{tenantId:a.tenant.id,accountId:a.account.id,date:new Date('2026-09-01T00:00:00Z'),description:'Cobro REF-EXACT',reference:'REF-EXACT',credit:'100.00',debit:'0'}});
  await prisma.bankMovement.create({data:{tenantId:a.tenant.id,accountId:a.account.id,date:new Date('2026-09-01T00:00:00Z'),description:'Mismo monto referencia distinta',reference:'OTHER',credit:'100.00',debit:'0'}});
  const usd=await prisma.bankAccount.create({data:{tenantId:a.tenant.id,bankName:'Banco USD',accountNo:`USD-${randomUUID().slice(0,6)}`,currency:'USD',balance:'0'}});
  await prisma.bankMovement.create({data:{tenantId:a.tenant.id,accountId:usd.id,date:new Date('2026-09-01T00:00:00Z'),description:'Transfer USD',reference:'REF-EXACT',credit:'100.00',debit:'0'}});
  const candidates=await getMatchingCandidates(a.tenant.id,line.id);
  assert.equal(candidates.candidates[0].reference,'REF-EXACT');
  assert.ok(candidates.candidates[0].reasons.includes('exact_reference'));
  const mismatch=candidates.candidates.find((item:any)=>item.reference==='OTHER'); assert.ok(mismatch); assert.ok(mismatch.confidence<candidates.candidates[0].confidence);
  const fx=candidates.candidates.find((item:any)=>item.currency==='USD'); assert.equal(fx?.blockedReason,'FX_REQUIRES_EXPLICIT_POSTING');
  assert.equal(candidates.requiresReview,Number(candidates.candidates[0].confidence)<0.95||candidates.status==='conflict');
});

test('v237 PostgreSQL: partial + one-to-many + many-to-one are exact and overpayment is rejected',async(t)=>{
  const fx=await fixture('ALLOC'); t.after(async()=>{await prisma.tenant.delete({where:{id:fx.tenant.id}});});
  const m60=await prisma.bankMovement.create({data:{tenantId:fx.tenant.id,accountId:fx.account.id,date:new Date('2026-09-02T00:00:00Z'),description:'Parte 60',reference:'M60',credit:'60.00',debit:'0'}});
  const m40=await prisma.bankMovement.create({data:{tenantId:fx.tenant.id,accountId:fx.account.id,date:new Date('2026-09-02T00:00:00Z'),description:'Parte 40',reference:'M40',credit:'40.00',debit:'0'}});
  const imported=await importRows(fx,'one-many',['2026-09-02,100.00,VES,ONE-MANY,Lote,Cliente']); const line=imported.lines.find((item:any)=>item.reference==='ONE-MANY'); assert.ok(line);
  const partial=await reconcileStatementLine({tenantId:fx.tenant.id,userId:fx.user.id,lineId:line.id,idempotencyKey:idem('partial'),allocations:[{targetType:'bank_movement',targetId:m60.id,amount:'60.00'}],confidence:1,reasons:['qa_partial']});
  assert.equal((partial.line as any).status,'partial'); assert.equal((partial.line as any).remaining,'40.00');
  const completed=await reconcileStatementLine({tenantId:fx.tenant.id,userId:fx.user.id,lineId:line.id,idempotencyKey:idem('complete'),allocations:[{targetType:'bank_movement',targetId:m40.id,amount:'40.00'}],confidence:1,reasons:['qa_complete']});
  assert.equal((completed.line as any).status,'reconciled'); assert.equal((completed.line as any).remaining,'0.00');

  const target100=await prisma.bankMovement.create({data:{tenantId:fx.tenant.id,accountId:fx.account.id,date:new Date('2026-09-03T00:00:00Z'),description:'Objetivo 100',reference:'TARGET100',credit:'100.00',debit:'0'}});
  const many=await importRows(fx,'many-one',['2026-09-03,30.00,VES,A30,Parte A,Cliente','2026-09-04,70.00,VES,A70,Parte B,Cliente']);
  const l30=many.lines.find((item:any)=>item.reference==='A30'), l70=many.lines.find((item:any)=>item.reference==='A70'); assert.ok(l30&&l70);
  await reconcileStatementLine({tenantId:fx.tenant.id,userId:fx.user.id,lineId:l30.id,idempotencyKey:idem('m1'),allocations:[{targetType:'bank_movement',targetId:target100.id,amount:'30.00'}]});
  await reconcileStatementLine({tenantId:fx.tenant.id,userId:fx.user.id,lineId:l70.id,idempotencyKey:idem('m2'),allocations:[{targetType:'bank_movement',targetId:target100.id,amount:'70.00'}]});
  const final=await listStatementLines(fx.tenant.id,{accountId:fx.account.id,status:'all'}); assert.equal(final.find((item:any)=>item.id===l30.id)?.status,'reconciled'); assert.equal(final.find((item:any)=>item.id===l70.id)?.status,'reconciled');

  const over=await importRows(fx,'over',['2026-09-05,101.00,VES,OVER,Overpay,Cliente']); const overLine=over.lines.find((item:any)=>item.reference==='OVER'); assert.ok(overLine);
  await assert.rejects(()=>reconcileStatementLine({tenantId:fx.tenant.id,userId:fx.user.id,lineId:overLine.id,idempotencyKey:idem('over'),allocations:[{targetType:'bank_movement',targetId:target100.id,amount:'101.00'}]}),(error:any)=>error?.status===409);
});

test('v237 PostgreSQL: lost-response retry and concurrent reconcile create one financial allocation',async(t)=>{
  const fx=await fixture('RETRY'); t.after(async()=>{await prisma.tenant.delete({where:{id:fx.tenant.id}});});
  const target=await prisma.bankMovement.create({data:{tenantId:fx.tenant.id,accountId:fx.account.id,date:new Date('2026-09-06T00:00:00Z'),description:'Retry target',reference:'RETRY',credit:'50.00',debit:'0'}});
  const imported=await importRows(fx,'retry',['2026-09-06,50.00,VES,RETRY,Retry,Cliente']); const line=imported.lines.find((item:any)=>item.reference==='RETRY'); assert.ok(line);
  const key=idem('lost-response');
  const first=await reconcileStatementLine({tenantId:fx.tenant.id,userId:fx.user.id,lineId:line.id,idempotencyKey:key,allocations:[{targetType:'bank_movement',targetId:target.id,amount:'50.00'}]});
  const replay=await reconcileStatementLine({tenantId:fx.tenant.id,userId:fx.user.id,lineId:line.id,idempotencyKey:key,allocations:[{targetType:'bank_movement',targetId:target.id,amount:'50.00'}]});
  assert.equal(replay.replayed,true); assert.equal(replay.reconciliation.id,first.reconciliation.id);
  const count=await prisma.$queryRaw<Array<{count:bigint}>>`SELECT COUNT(*)::bigint AS count FROM "BankReconciliation" WHERE "tenantId"=${fx.tenant.id} AND "statementLineId"=${line.id} AND "status"='confirmed'`; assert.equal(Number(count[0].count),1);

  const target2=await prisma.bankMovement.create({data:{tenantId:fx.tenant.id,accountId:fx.account.id,date:new Date('2026-09-07T00:00:00Z'),description:'Concurrent target',reference:'CONCUR',credit:'80.00',debit:'0'}});
  const conc=await importRows(fx,'concurrent',['2026-09-07,80.00,VES,CONCUR,Concurrent,Cliente']); const concLine=conc.lines.find((item:any)=>item.reference==='CONCUR'); assert.ok(concLine);
  const attempts=await Promise.allSettled([
    reconcileStatementLine({tenantId:fx.tenant.id,userId:fx.user.id,lineId:concLine.id,idempotencyKey:idem('c1'),allocations:[{targetType:'bank_movement',targetId:target2.id,amount:'80.00'}]}),
    reconcileStatementLine({tenantId:fx.tenant.id,userId:fx.user.id,lineId:concLine.id,idempotencyKey:idem('c2'),allocations:[{targetType:'bank_movement',targetId:target2.id,amount:'80.00'}]})
  ]);
  assert.equal(attempts.filter((item)=>item.status==='fulfilled').length,1); assert.equal(attempts.filter((item)=>item.status==='rejected').length,1);
  const concurrentCount=await prisma.$queryRaw<Array<{count:bigint}>>`SELECT COUNT(*)::bigint AS count FROM "BankReconciliation" WHERE "tenantId"=${fx.tenant.id} AND "statementLineId"=${concLine.id} AND "status"='confirmed'`; assert.equal(Number(concurrentCount[0].count),1);
});

test('v237 PostgreSQL: reversal restores remaining state, preserves history, closing difference and rounding are exact',async(t)=>{
  const fx=await fixture('REVERSE'); t.after(async()=>{await prisma.tenant.delete({where:{id:fx.tenant.id}});});
  const target=await prisma.bankMovement.create({data:{tenantId:fx.tenant.id,accountId:fx.account.id,date:new Date('2026-09-08T00:00:00Z'),description:'Reverse target',reference:'REV',credit:'25.55',debit:'0'}});
  const imported=await importRows(fx,'reverse',['2026-09-08,25.55,VES,REV,Reverse,Cliente']); const line=imported.lines.find((item:any)=>item.reference==='REV'); assert.ok(line);
  const matched=await reconcileStatementLine({tenantId:fx.tenant.id,userId:fx.user.id,lineId:line.id,idempotencyKey:idem('rev'),allocations:[{targetType:'bank_movement',targetId:target.id,amount:'25.55'}]});
  const reversed=await reverseReconciliation({tenantId:fx.tenant.id,userId:fx.user.id,reconciliationId:matched.reconciliation.id,reason:'QA reversible'});
  assert.equal((reversed.line as any).status,'unmatched'); assert.equal((reversed.line as any).remaining,'25.55');
  const history=await getReconciliationHistory(fx.tenant.id,line.id); assert.ok(history.some((event:any)=>event.type==='reconciliation.confirmed')); assert.ok(history.some((event:any)=>event.type==='reconciliation.reversed'));

  await prisma.bankAccount.update({where:{id:fx.account.id},data:{balance:'95.50'}});
  const ofx=Buffer.from('<OFX><CURDEF>VES<BANKTRANLIST><STMTTRN><DTPOSTED>20260909<TRNAMT>5.00<FITID>CLOSE-1<MEMO>Cierre</BANKTRANLIST><LEDGERBAL><BALAMT>100.00</OFX>','utf8');
  const closeImport=await importBankStatement({tenantId:fx.tenant.id,userId:fx.user.id,accountId:fx.account.id,fileName:'close.ofx',bytes:ofx});
  const closing=await getClosingBalanceSummary(fx.tenant.id,fx.account.id,closeImport.importId); assert.equal(closing.closingBalance,'100.00'); assert.equal(closing.ledgerBalance,'95.50'); assert.equal(closing.difference,'4.50'); assert.equal(closing.exact,false);

  await assert.rejects(()=>importBankStatement({tenantId:fx.tenant.id,userId:fx.user.id,accountId:fx.account.id,fileName:'rounding.csv',bytes:csv(['2026-09-09,10.001,VES,ROUND,Rounding,Cliente'])}),(error:any)=>/2 decimales|Monto inválido|scale/i.test(error?.message));
});
