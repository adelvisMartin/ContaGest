import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { prisma } from '../backend/src/database/prisma.js';
import { createApprovalPolicy, createApprovalRequest, decideApprovalRequest } from '../backend/src/modules/approvals/approvals.service.js';
import {
  createReconciliationModel,
  createWriteoff,
  getReconciliationHistory,
  importBankStatement,
  listReconciliationModels,
  listStatementLines,
  reverseReconciliation
} from '../backend/src/modules/bank-reconciliation/bank-reconciliation.service.js';

after(async()=>{await prisma.$disconnect();});

test('v237 fee model is versioned and write-off is ledger-backed, maker-checker gated and reversible',async(t)=>{
  const suffix=randomUUID().slice(0,8);
  const tenant=await prisma.tenant.create({data:{rif:`QA-237-WO-${suffix}`,name:'QA 237 writeoff'}});
  t.after(async()=>{await prisma.tenant.delete({where:{id:tenant.id}});});
  const maker=await prisma.userProfile.create({data:{tenantId:tenant.id,email:`maker-${suffix}@example.test`,fullName:'Maker QA'}});
  const approver=await prisma.userProfile.create({data:{tenantId:tenant.id,email:`approver-${suffix}@example.test`,fullName:'Approver QA'}});
  const permission=await prisma.permission.upsert({where:{key:'admin.manage'},update:{},create:{key:'admin.manage',description:'QA approval'}});
  const role=await prisma.role.create({data:{tenantId:tenant.id,name:`QA Approver ${suffix}`,permissions:{create:{permissionId:permission.id}}}});
  await prisma.userRole.create({data:{userId:approver.id,roleId:role.id}});
  const bank=await prisma.bankAccount.create({data:{tenantId:tenant.id,bankName:'Banco QA',accountNo:`WO-${suffix}`,currency:'VES',balance:'100.00'}});
  await prisma.chartAccount.createMany({data:[
    {tenantId:tenant.id,code:'1.1.01.001',name:'Banco QA contable',type:'asset',nature:'debit',allowPosting:true,active:true},
    {tenantId:tenant.id,code:'6.1.99.001',name:'Comisiones bancarias',type:'expense',nature:'debit',allowPosting:true,active:true}
  ]});

  const model1=await createReconciliationModel({tenantId:tenant.id,userId:maker.id,name:'Comisión bancaria',memoPattern:'COMISION',accountCode:'6.1.99.001',accountName:'Comisiones bancarias',reasonCode:'BANK_FEE',autoApply:false,minConfidence:'0.9500'});
  const model2=await createReconciliationModel({tenantId:tenant.id,userId:maker.id,name:'Comisión bancaria',memoPattern:'FEE',accountCode:'6.1.99.001',accountName:'Comisiones bancarias',reasonCode:'BANK_FEE_V2',autoApply:false,minConfidence:'0.9800'});
  assert.equal(model1.version,1); assert.equal(model2.version,2);
  const models=await listReconciliationModels(tenant.id); assert.equal(models.filter((item:any)=>item.name==='Comisión bancaria').length,2);

  const statement=Buffer.from('date,amount,currency,reference,memo,counterparty\n2026-09-10,-5.25,VES,FEE-1,COMISION MANTENIMIENTO,Banco QA\n','utf8');
  await importBankStatement({tenantId:tenant.id,userId:maker.id,accountId:bank.id,fileName:'fee.csv',bytes:statement});
  const [line]=await listStatementLines(tenant.id,{accountId:bank.id,status:'all'}); assert.ok(line);

  await createApprovalPolicy({tenantId:tenant.id,capability:'banking.correct',thresholdAmount:'0.01',currency:'VES',requiredApprovals:1,selfApprovalAllowed:false,approverPermissions:['admin.manage'],createdBy:maker.id});
  const payload={lineId:line.id,accountId:bank.id,amount:'5.25',currency:'VES',writeoffAccountCode:'6.1.99.001',bankLedgerAccountCode:'1.1.01.001',reason:'Comisión bancaria del extracto',fiscalPeriod:'2026-09'};
  await assert.rejects(()=>createWriteoff({tenantId:tenant.id,userId:maker.id,lineId:line.id,idempotencyKey:`wo-missing-${suffix}`,amount:'5.25',writeoffAccountCode:'6.1.99.001',bankLedgerAccountCode:'1.1.01.001',reason:payload.reason,fiscalPeriod:'2026-09'}),(error:any)=>error?.status===428&&error?.details?.code==='APPROVAL_REQUIRED');

  const request=await createApprovalRequest({tenantId:tenant.id,requesterId:maker.id,capability:'banking.correct',payload,amount:'5.25',currency:'VES',reasonCode:'BANK_FEE',comment:'QA write-off'});
  await assert.rejects(()=>decideApprovalRequest({tenantId:tenant.id,approverId:maker.id,requestId:request.id,decision:'approved'}),(error:any)=>error?.status===403,'maker cannot approve own write-off');
  const approved=await decideApprovalRequest({tenantId:tenant.id,approverId:approver.id,requestId:request.id,decision:'approved',reasonCode:'CHECKED'}); assert.equal(approved.status,'approved');

  const before=(await prisma.bankAccount.findUniqueOrThrow({where:{id:bank.id}})).balance.toFixed(2);
  const result=await createWriteoff({tenantId:tenant.id,userId:maker.id,lineId:line.id,idempotencyKey:`wo-${suffix}`,amount:'5.25',writeoffAccountCode:'6.1.99.001',bankLedgerAccountCode:'1.1.01.001',reason:payload.reason,fiscalPeriod:'2026-09',approvalRequestId:request.id});
  assert.equal(result.reconciliation.status,'confirmed'); assert.ok(result.reconciliation.ledgerEntryId);
  const ledger=await prisma.ledgerEntry.findFirstOrThrow({where:{id:result.reconciliation.ledgerEntryId,tenantId:tenant.id},include:{lines:true}}); assert.equal(ledger.posted,true); assert.equal(ledger.source,'banking'); assert.equal(ledger.lines.length,2);
  assert.equal(ledger.lines.reduce((sum,item)=>sum.plus(item.debit),new (ledger.lines[0].debit.constructor as any)(0)).toFixed(2),'5.25');
  assert.equal(ledger.lines.reduce((sum,item)=>sum.plus(item.credit),new (ledger.lines[0].credit.constructor as any)(0)).toFixed(2),'5.25');
  const after=(await prisma.bankAccount.findUniqueOrThrow({where:{id:bank.id}})).balance.toFixed(2); assert.equal(after,before,'write-off must not mutate bank balance directly');

  const replay=await createWriteoff({tenantId:tenant.id,userId:maker.id,lineId:line.id,idempotencyKey:`wo-${suffix}`,amount:'5.25',writeoffAccountCode:'6.1.99.001',bankLedgerAccountCode:'1.1.01.001',reason:payload.reason,fiscalPeriod:'2026-09',approvalRequestId:request.id}); assert.equal(replay.replayed,true); assert.equal(replay.reconciliation.id,result.reconciliation.id);
  const ledgerCount=await prisma.ledgerEntry.count({where:{tenantId:tenant.id,source:'banking',sourceId:`bank-reconciliation:${result.reconciliation.id}`}}); assert.equal(ledgerCount,1);

  const reversed=await reverseReconciliation({tenantId:tenant.id,userId:approver.id,reconciliationId:result.reconciliation.id,fiscalPeriod:'2026-09',reason:'QA reverso de comisión'}); assert.equal(reversed.reconciliation.status,'reversed'); assert.ok(reversed.reconciliation.reversalLedgerEntryId);
  const reversal=await prisma.ledgerEntry.findUniqueOrThrow({where:{id:reversed.reconciliation.reversalLedgerEntryId!}}); assert.equal(reversal.reversalOfId,ledger.id); assert.equal(reversal.posted,true);
  const history=await getReconciliationHistory(tenant.id,line.id); assert.ok(history.some((event:any)=>event.type==='writeoff.confirmed')); assert.ok(history.some((event:any)=>event.type==='reconciliation.reversed'));
});
