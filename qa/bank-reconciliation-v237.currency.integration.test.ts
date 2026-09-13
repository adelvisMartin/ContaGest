import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { prisma } from '../backend/src/database/prisma.js';
import { getMatchingCandidates, importBankStatement, listStatementLines } from '../backend/src/modules/bank-reconciliation/bank-reconciliation.service.js';

after(async()=>{await prisma.$disconnect();});

test('v237 USD purchase invoice is a same-currency CxP candidate, not a false FX conflict',async(t)=>{
  const suffix=randomUUID().slice(0,8);
  const tenant=await prisma.tenant.create({data:{rif:`QA-237-USD-CXP-${suffix}`,name:'QA 237 USD CxP'}});
  t.after(async()=>{await prisma.tenant.delete({where:{id:tenant.id}});});
  const user=await prisma.userProfile.create({data:{tenantId:tenant.id,email:`usd-cxp-${suffix}@example.test`,fullName:'USD CxP QA'}});
  const supplier=await prisma.supplier.create({data:{tenantId:tenant.id,rif:`J-${suffix}`,name:'Proveedor USD QA'}});
  const account=await prisma.bankAccount.create({data:{tenantId:tenant.id,bankName:'Banco USD QA',accountNo:`USD-CXP-${suffix}`,currency:'USD',balance:'0'}});
  const purchase=await prisma.purchaseInvoice.create({data:{
    tenantId:tenant.id,supplierId:supplier.id,number:`CXP-USD-${suffix}`,issueDate:new Date('2026-09-12T00:00:00Z'),fiscalPeriod:'2026-09',currency:'USD',subtotal:'100.00',iva:'0',igtf:'0',retiva:'0',total:'100.00',status:'issued'
  }});
  const bytes=Buffer.from(`date,amount,currency,reference,memo,counterparty\n2026-09-12,-100.00,USD,${purchase.number},Pago factura proveedor,Proveedor USD QA\n`,'utf8');
  await importBankStatement({tenantId:tenant.id,userId:user.id,accountId:account.id,fileName:'cxp-usd.csv',bytes});
  const [line]=await listStatementLines(tenant.id,{accountId:account.id,status:'all'});
  const result=await getMatchingCandidates(tenant.id,line.id);
  const candidate=result.candidates.find((item:any)=>item.targetType==='purchase_invoice'&&item.targetId===purchase.id);
  assert.ok(candidate);
  assert.equal(candidate.currency,'USD');
  assert.equal(candidate.blockedReason,null);
  assert.ok(candidate.reasons.includes('exact_reference'));
  assert.ok(candidate.reasons.includes('partner_match'));
});
