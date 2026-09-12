import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { prisma } from '../backend/src/database/prisma.js';
import {
  createReconciliationModel,
  getMatchingCandidates,
  importBankStatement,
  listReconciliationModels,
  listStatementLines
} from '../backend/src/modules/bank-reconciliation/bank-reconciliation.service.js';

after(async()=>{await prisma.$disconnect();});

test('v237 recurring fee model becomes an explainable suggestion and uses canonical chart-account name',async(t)=>{
  const suffix=randomUUID().slice(0,8);
  const tenant=await prisma.tenant.create({data:{rif:`QA-237-MODEL-${suffix}`,name:'QA 237 recurring model'}});
  t.after(async()=>{await prisma.tenant.delete({where:{id:tenant.id}});});
  const user=await prisma.userProfile.create({data:{tenantId:tenant.id,email:`model-${suffix}@example.test`,fullName:'Model QA'}});
  const bank=await prisma.bankAccount.create({data:{tenantId:tenant.id,bankName:'Banco QA',accountNo:`MODEL-${suffix}`,currency:'VES',balance:'0'}});
  await prisma.chartAccount.create({data:{tenantId:tenant.id,code:'6.1.99.237',name:'Comisiones bancarias canónicas',type:'expense',nature:'debit',allowPosting:true,active:true}});

  const model=await createReconciliationModel({
    tenantId:tenant.id,userId:user.id,name:'Comisión mensual',memoPattern:'comision mantenimiento',
    accountCode:'6.1.99.237',accountName:'NOMBRE INYECTADO NO DEBE PERSISTIR',reasonCode:'BANK_FEE',autoApply:true,minConfidence:'0.9500'
  });
  assert.equal(model.accountName,'Comisiones bancarias canónicas');

  const bytes=Buffer.from('date,amount,currency,reference,memo,counterparty\n2026-09-12,-12.50,VES,FEE-SEP,COMISION MANTENIMIENTO SEPTIEMBRE,Banco QA\n','utf8');
  await importBankStatement({tenantId:tenant.id,userId:user.id,accountId:bank.id,fileName:'model.csv',bytes});
  const [line]=await listStatementLines(tenant.id,{accountId:bank.id,status:'all'});
  const result=await getMatchingCandidates(tenant.id,line.id);
  const suggestion=result.modelSuggestions?.find((item:any)=>item.modelId===model.id);
  assert.ok(suggestion,'matching memo pattern must surface the recurring model');
  assert.equal(suggestion.accountCode,'6.1.99.237');
  assert.equal(suggestion.accountName,'Comisiones bancarias canónicas');
  assert.equal(suggestion.reasonCode,'BANK_FEE');
  assert.equal(suggestion.confidence,1);
  assert.equal(suggestion.requiresConfirmation,true,'model must not silently post a write-off from a GET');
  assert.ok(suggestion.reasons.includes('reconciliation_model_memo_match'));
});

test('v237 recurring model versions serialize, preserve history and leave only latest active',async(t)=>{
  const suffix=randomUUID().slice(0,8);
  const tenant=await prisma.tenant.create({data:{rif:`QA-237-MODEL-V-${suffix}`,name:'QA 237 model versions'}});
  t.after(async()=>{await prisma.tenant.delete({where:{id:tenant.id}});});
  const user=await prisma.userProfile.create({data:{tenantId:tenant.id,email:`model-v-${suffix}@example.test`,fullName:'Model Version QA'}});
  await prisma.chartAccount.create({data:{tenantId:tenant.id,code:'6.1.99.239',name:'Comisiones versiones',type:'expense',nature:'debit',allowPosting:true,active:true}});
  const name=`Comisión concurrente ${suffix}`;
  const attempts=await Promise.all([
    createReconciliationModel({tenantId:tenant.id,userId:user.id,name,memoPattern:'fee alpha',accountCode:'6.1.99.239',reasonCode:'FEE_ALPHA',minConfidence:'0.90'}),
    createReconciliationModel({tenantId:tenant.id,userId:user.id,name,memoPattern:'fee beta',accountCode:'6.1.99.239',reasonCode:'FEE_BETA',minConfidence:'0.95'})
  ]);
  assert.deepEqual(attempts.map((item:any)=>item.version).sort((a,b)=>a-b),[1,2]);
  const models=(await listReconciliationModels(tenant.id)).filter((item:any)=>item.name===name);
  assert.equal(models.length,2);
  assert.equal(models.filter((item:any)=>item.active).length,1);
  assert.equal(models.find((item:any)=>item.active)?.version,2);
  assert.equal(models.find((item:any)=>item.version===1)?.active,false);
  const audits=await prisma.auditLog.findMany({where:{tenantId:tenant.id,action:'bank-reconciliation.model.version-created',entity:'BankReconciliationModel'}});
  assert.equal(audits.length,2);
});

test('v237 recurring model does not match unrelated statement text',async(t)=>{
  const suffix=randomUUID().slice(0,8);
  const tenant=await prisma.tenant.create({data:{rif:`QA-237-NOMODEL-${suffix}`,name:'QA 237 model negative'}});
  t.after(async()=>{await prisma.tenant.delete({where:{id:tenant.id}});});
  const user=await prisma.userProfile.create({data:{tenantId:tenant.id,email:`nomodel-${suffix}@example.test`,fullName:'No Model QA'}});
  const bank=await prisma.bankAccount.create({data:{tenantId:tenant.id,bankName:'Banco QA',accountNo:`NOMODEL-${suffix}`,currency:'VES',balance:'0'}});
  await prisma.chartAccount.create({data:{tenantId:tenant.id,code:'6.1.99.238',name:'Comisiones varias',type:'expense',nature:'debit',allowPosting:true,active:true}});
  await createReconciliationModel({tenantId:tenant.id,userId:user.id,name:'SWIFT fee',memoPattern:'swift fee',accountCode:'6.1.99.238',accountName:'ignored',reasonCode:'SWIFT_FEE'});
  await importBankStatement({tenantId:tenant.id,userId:user.id,accountId:bank.id,fileName:'unrelated.csv',bytes:Buffer.from('date,amount,currency,reference,memo,counterparty\n2026-09-12,-12.50,VES,OTHER,PAGO SERVICIO ELECTRICO,Proveedor\n','utf8')});
  const [line]=await listStatementLines(tenant.id,{accountId:bank.id,status:'all'});
  const result=await getMatchingCandidates(tenant.id,line.id);
  assert.equal(result.modelSuggestions?.length,0);
});
