import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { prisma } from '../backend/src/database/prisma.js';
import {
  approvalPayloadHash, approvalReport, createApprovalPolicy, createApprovalRequest, decideApprovalRequest,
  guardApprovalTx, consumeApprovalTx, reviseApprovalRequest, createDelegation, listApprovalInbox, listMyApprovalRequests
} from '../backend/src/modules/approvals/approvals.service.js';

async function fixture(label:string){
  const tenant=await prisma.tenant.create({data:{rif:`QA236-${label}-${randomUUID().slice(0,8)}`,name:`QA236 ${label}`}});
  const maker=await prisma.userProfile.create({data:{tenantId:tenant.id,email:`maker-${label}@qa.local`,fullName:'Maker',status:'active'}});
  const checker=await prisma.userProfile.create({data:{tenantId:tenant.id,email:`checker-${label}@qa.local`,fullName:'Checker',status:'active'}});
  const checker2=await prisma.userProfile.create({data:{tenantId:tenant.id,email:`checker2-${label}@qa.local`,fullName:'Checker 2',status:'active'}});
  const permission=await prisma.permission.upsert({where:{key:'qa236.approve'},update:{},create:{key:'qa236.approve',description:'QA maker-checker'}});
  const role=await prisma.role.create({data:{tenantId:tenant.id,name:'Aprobador QA'}});
  await prisma.rolePermission.create({data:{roleId:role.id,permissionId:permission.id}});
  await prisma.userRole.createMany({data:[{userId:checker.id,roleId:role.id},{userId:checker2.id,roleId:role.id}]});
  return {tenant,maker,checker,checker2,role};
}

test('v236: threshold, self approval, payload invalidation and tenant isolation',async(t)=>{
  const a=await fixture('A');const b=await fixture('B');
  t.after(async()=>{await prisma.tenant.deleteMany({where:{id:{in:[a.tenant.id,b.tenant.id]}}});await prisma.$disconnect();});
  await createApprovalPolicy({tenantId:a.tenant.id,capability:'banking.payment',thresholdAmount:'100.00',currency:'VES',requiredApprovals:1,approverPermissions:['qa236.approve'],createdBy:a.maker.id});
  const payload={accountId:'acc-1',description:'Pago proveedor',type:'expense',amount:'100.00',currency:'VES'};
  const request=await createApprovalRequest({tenantId:a.tenant.id,requesterId:a.maker.id,capability:'banking.payment',payload,amount:'100.00',currency:'VES',reasonCode:'PAYMENT'});
  assert.equal(request.status,'pending');
  await assert.rejects(()=>decideApprovalRequest({tenantId:a.tenant.id,approverId:a.maker.id,requestId:request.id,decision:'approved'}),(error:any)=>error?.status===403&&error?.details?.code==='APPROVAL_SELF_APPROVAL_FORBIDDEN');
  await assert.rejects(()=>decideApprovalRequest({tenantId:b.tenant.id,approverId:b.checker.id,requestId:request.id,decision:'approved'}),(error:any)=>error?.status===404);
  const approved=await decideApprovalRequest({tenantId:a.tenant.id,approverId:a.checker.id,requestId:request.id,decision:'approved',reasonCode:'REVIEWED'});
  assert.equal(approved.status,'approved');
  await prisma.$transaction(async(tx)=>{
    await assert.rejects(()=>guardApprovalTx(tx,{tenantId:a.tenant.id,approvalRequestId:request.id,capability:'banking.payment',payload:{...payload,amount:'101.00'},amount:'101.00',currency:'VES'}),(error:any)=>error?.status===409&&error?.details?.code==='APPROVAL_PAYLOAD_CHANGED');
  });
  const revised=await reviseApprovalRequest({tenantId:a.tenant.id,requesterId:a.maker.id,requestId:request.id,payload:{...payload,amount:'125.00'},amount:'125.00',currency:'VES',comment:'Monto corregido'});
  assert.equal(revised.status,'pending');assert.equal(revised.revision,2);assert.notEqual(revised.payloadHash,approvalPayloadHash(payload));
});

test('v236: concurrent approvals converge and approved payload can be consumed once',async(t)=>{
  const f=await fixture('CONCURRENT');t.after(async()=>{await prisma.tenant.deleteMany({where:{id:f.tenant.id}});await prisma.$disconnect();});
  await createApprovalPolicy({tenantId:f.tenant.id,capability:'inventory.adjust',requiredApprovals:2,approverPermissions:['qa236.approve'],createdBy:f.maker.id});
  const payload={productId:'product-x',targetStock:'12.000',reasonCode:'COUNT',note:'Conteo físico'};
  const request=await createApprovalRequest({tenantId:f.tenant.id,requesterId:f.maker.id,capability:'inventory.adjust',payload});
  const results=await Promise.all([
    decideApprovalRequest({tenantId:f.tenant.id,approverId:f.checker.id,requestId:request.id,decision:'approved'}),
    decideApprovalRequest({tenantId:f.tenant.id,approverId:f.checker2.id,requestId:request.id,decision:'approved'})
  ]);
  assert.ok(results.some((row)=>row.status==='approved'));
  await prisma.$transaction(async(tx)=>{const guarded=await guardApprovalTx(tx,{tenantId:f.tenant.id,approvalRequestId:request.id,capability:'inventory.adjust',payload});assert.ok(guarded);await consumeApprovalTx(tx,guarded,'InventoryMovement','movement-qa');});
  await prisma.$transaction(async(tx)=>{await assert.rejects(()=>guardApprovalTx(tx,{tenantId:f.tenant.id,approvalRequestId:request.id,capability:'inventory.adjust',payload}),(error:any)=>error?.status===409);});
});

test('v236: delegation is time-bounded and report inbox respects current qualification',async(t)=>{
  const f=await fixture('DELEGATION');t.after(async()=>{await prisma.tenant.deleteMany({where:{id:f.tenant.id}});await prisma.$disconnect();});
  const delegate=await prisma.userProfile.create({data:{tenantId:f.tenant.id,email:'delegate@qa.local',fullName:'Delegate',status:'active'}});
  await createApprovalPolicy({tenantId:f.tenant.id,capability:'fiscal.reopen',approverPermissions:['qa236.approve'],createdBy:f.maker.id});
  const request=await createApprovalRequest({tenantId:f.tenant.id,requesterId:f.maker.id,capability:'fiscal.reopen',payload:{period:'2026-08',module:'fiscal',reason:'Corrección auditada'}});
  assert.equal((await listApprovalInbox(f.tenant.id,delegate.id)).length,0);
  await createDelegation({tenantId:f.tenant.id,delegatorId:f.checker.id,delegateId:delegate.id,capability:'fiscal.reopen',startsAt:new Date(Date.now()-60_000),endsAt:new Date(Date.now()+3_600_000),reason:'Cobertura temporal QA'});
  assert.equal((await listApprovalInbox(f.tenant.id,delegate.id)).some((row)=>row.id===request.id),true);
  const approved=await decideApprovalRequest({tenantId:f.tenant.id,approverId:delegate.id,requestId:request.id,decision:'approved'});assert.equal(approved.status,'approved');
});


test('v236: expired requests are materialized, visible as expired and cannot be revived',async(t)=>{
  const f=await fixture('EXPIRED');t.after(async()=>{await prisma.tenant.deleteMany({where:{id:f.tenant.id}});await prisma.$disconnect();});
  await createApprovalPolicy({tenantId:f.tenant.id,capability:'fiscal.reopen',approverPermissions:['qa236.approve'],createdBy:f.maker.id});
  const payload={period:'2026-08',module:'fiscal',reason:'Corrección fuera de ventana'};
  const request=await createApprovalRequest({tenantId:f.tenant.id,requesterId:f.maker.id,capability:'fiscal.reopen',payload});
  await prisma.$executeRaw`UPDATE "ApprovalRequest" SET "expiresAt" = now() - interval '1 minute' WHERE "id" = ${request.id} AND "tenantId" = ${f.tenant.id}`;

  const mine=await listMyApprovalRequests(f.tenant.id,f.maker.id);
  const expired=mine.find((row)=>row.id===request.id);
  assert.equal(expired?.status,'expired');
  assert.equal((await listApprovalInbox(f.tenant.id,f.checker.id)).some((row)=>row.id===request.id),false);

  await assert.rejects(
    ()=>reviseApprovalRequest({tenantId:f.tenant.id,requesterId:f.maker.id,requestId:request.id,payload:{...payload,reason:'Intento de revivir'}}),
    (error:any)=>error?.status===409&&error?.details?.code==='APPROVAL_EXPIRED'
  );
  await assert.rejects(
    ()=>decideApprovalRequest({tenantId:f.tenant.id,approverId:f.checker.id,requestId:request.id,decision:'approved'}),
    (error:any)=>error?.status===409&&error?.details?.code==='APPROVAL_EXPIRED'
  );

  const report=await approvalReport(f.tenant.id);
  const row=report.find((item)=>item.capability==='fiscal.reopen'&&item.status==='expired');
  assert.equal(row?.count,1);
});
