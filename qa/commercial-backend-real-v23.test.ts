import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../backend/src/app.ts';
import { prisma } from '../backend/src/database/prisma.ts';
import { signAccessToken } from '../backend/src/shared/auth/jwt.ts';

const QA_TENANT_RIF='00000000';
const ADMIN_EMAIL='admin@erp.local';
const RUN=`CG23-${Date.now().toString(36).toUpperCase()}`;
const STARTED_AT=new Date();

function unwrap(payload:any){return payload?.data ?? payload;}
async function request(base:string,token:string,path:string,options:RequestInit={}){
  const headers=new Headers(options.headers||{});
  headers.set('authorization',`Bearer ${token}`);
  headers.set('x-forwarded-for','10.23.23.23');
  if(options.body&&!headers.has('content-type'))headers.set('content-type','application/json');
  const response=await fetch(`${base}/api/v1${path}`,{...options,headers});
  const text=await response.text();
  let payload:any={};
  try{payload=text?JSON.parse(text):{};}catch{payload={message:text};}
  return{response,payload,data:unwrap(payload)};
}
async function expectOk(base:string,token:string,path:string,options:RequestInit={}){
  const result=await request(base,token,path,options);
  assert.equal(result.response.ok,true,`${options.method||'GET'} ${path} -> ${result.response.status}: ${JSON.stringify(result.payload)}`);
  assert.notEqual(result.payload?.ok,false,`${path} returned ok=false`);
  return result.data;
}
async function expectStatus(base:string,token:string,path:string,status:number,options:RequestInit={}){
  const result=await request(base,token,path,options);
  assert.equal(result.response.status,status,`${options.method||'GET'} ${path} expected ${status}, got ${result.response.status}: ${JSON.stringify(result.payload)}`);
  return result;
}

test('issue #23 real DB: customer → subscription → tenants → status → payment → commission → audit',async(t)=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production','Real commercial QA must never run with NODE_ENV=production');
  const tenant=await prisma.tenant.findUnique({where:{rif:QA_TENANT_RIF}});
  assert.ok(tenant,`QA tenant ${QA_TENANT_RIF} not found; run the normal QA database seed first`);
  const admin=await prisma.userProfile.findFirst({where:{tenantId:tenant.id,email:ADMIN_EMAIL,status:'active'}});
  assert.ok(admin,`QA admin ${ADMIN_EMAIL} not found`);
  const platformPermission=await prisma.userRole.count({where:{userId:admin.id,role:{tenantId:tenant.id,permissions:{some:{permission:{key:'platform.manage'}}}}}});
  assert.ok(platformPermission>0,'QA admin must already have platform.manage; this test does not escalate its own privileges');
  const token=signAccessToken({id:admin.id,email:admin.email},tenant.id);

  let customerId='';
  let agentId='';
  let subscriptionId='';
  let paymentId='';
  let commissionId='';
  let tempTenantId='';
  let restrictedUserId='';

  const app=createApp();
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const address=server.address() as AddressInfo;
  const base=`http://127.0.0.1:${address.port}`;

  t.after(async()=>{
    await new Promise<void>((resolve)=>server.close(()=>resolve()));
    const entityIds=[customerId,agentId,subscriptionId,paymentId,commissionId].filter(Boolean);
    if(entityIds.length)await prisma.auditLog.deleteMany({where:{entityId:{in:entityIds},createdAt:{gte:STARTED_AT}}}).catch(()=>undefined);
    if(subscriptionId){
      await prisma.$executeRaw`DELETE FROM public."Commission" WHERE "subscriptionId"=${subscriptionId}`.catch(()=>undefined);
      await prisma.$executeRaw`DELETE FROM public."SubscriptionPayment" WHERE "subscriptionId"=${subscriptionId}`.catch(()=>undefined);
      await prisma.$executeRaw`DELETE FROM public."ModuleEntitlement" WHERE "subscriptionId"=${subscriptionId}`.catch(()=>undefined);
      await prisma.$executeRaw`DELETE FROM public."SubscriptionTenant" WHERE "subscriptionId"=${subscriptionId}`.catch(()=>undefined);
      await prisma.$executeRaw`DELETE FROM public."Subscription" WHERE "id"=${subscriptionId}`.catch(()=>undefined);
    }
    if(agentId)await prisma.$executeRaw`DELETE FROM public."SalesAgent" WHERE "id"=${agentId}`.catch(()=>undefined);
    if(customerId)await prisma.$executeRaw`DELETE FROM public."CustomerAccount" WHERE "id"=${customerId}`.catch(()=>undefined);
    if(restrictedUserId)await prisma.userProfile.deleteMany({where:{id:restrictedUserId}}).catch(()=>undefined);
    if(tempTenantId)await prisma.tenant.deleteMany({where:{id:tempTenantId}}).catch(()=>undefined);
  });

  await t.test('authorization rejects an authenticated user without platform.manage',async()=>{
    const restricted=await prisma.userProfile.create({data:{tenantId:tenant.id,email:`${RUN.toLowerCase()}@qa.local`,fullName:'QA Commercial Restricted',passwordHash:'qa-only-not-a-login-secret',status:'active'}});
    restrictedUserId=restricted.id;
    const restrictedToken=signAccessToken({id:restricted.id,email:restricted.email},tenant.id);
    await expectStatus(base,restrictedToken,'/commercial/summary',403);
  });

  await t.test('creates customer, seller and contador subscription using server-side plan defaults',async()=>{
    const customer=await expectOk(base,token,'/commercial/customers',{method:'POST',body:JSON.stringify({legalName:`${RUN} Cliente`,rif:`J-${RUN}`,contactName:'QA Issue 23',email:`customer.${RUN.toLowerCase()}@qa.local`})});
    customerId=String(customer.id||'');assert.ok(customerId);
    const agent=await expectOk(base,token,'/commercial/agents',{method:'POST',body:JSON.stringify({name:`${RUN} Vendedor`,email:`agent.${RUN.toLowerCase()}@qa.local`,commissionRate:10})});
    agentId=String(agent.id||'');assert.ok(agentId);
    const subscription=await expectOk(base,token,'/commercial/subscriptions',{method:'POST',body:JSON.stringify({customerAccountId:customerId,salesAgentId:agentId,planCode:'contador',billingCycle:'monthly',currency:'USD',amount:45,status:'trial'})});
    subscriptionId=String(subscription.id||'');assert.ok(subscriptionId);
    assert.equal(Number(subscription.maxTenants),3,'contador must inherit maxTenants=3 from the plan template');
    assert.equal(Number(subscription.maxUsers),3,'contador must inherit maxUsers=3 from the plan template');
    assert.equal(String(subscription.customerSegment),'accounting');
    assert.ok(Array.isArray(subscription.modules)&&subscription.modules.some((item:any)=>item.moduleCode==='contabilidad'&&item.status==='active'));
  });

  await t.test('links multiple companies and blocks a limit reduction below active coverage',async()=>{
    const tempTenant=await prisma.tenant.create({data:{rif:`QA-${RUN}`,name:`${RUN} Empresa 2`,legalName:`${RUN} Empresa 2 C.A.`,plan:'commercial',status:'active',settings:{}}});
    tempTenantId=tempTenant.id;
    let subscription=await expectOk(base,token,`/commercial/subscriptions/${subscriptionId}/tenants`,{method:'POST',body:JSON.stringify({tenantId:tenant.id})});
    assert.equal(subscription.tenants.filter((item:any)=>item.status==='active').length,1);
    subscription=await expectOk(base,token,`/commercial/subscriptions/${subscriptionId}/tenants`,{method:'POST',body:JSON.stringify({tenantId:tempTenant.id})});
    assert.equal(subscription.tenants.filter((item:any)=>item.status==='active').length,2);
    await expectStatus(base,token,`/commercial/subscriptions/${subscriptionId}`,409,{method:'PATCH',body:JSON.stringify({maxTenants:1})});
    const updated=await expectOk(base,token,`/commercial/subscriptions/${subscriptionId}`,{method:'PATCH',body:JSON.stringify({maxTenants:2,maxUsers:4})});
    assert.equal(Number(updated.maxTenants),2);assert.equal(Number(updated.maxUsers),4);
  });

  await t.test('updates modules and executes audited active/suspended/active transitions without deleting data',async()=>{
    const updated=await expectOk(base,token,`/commercial/subscriptions/${subscriptionId}/modules`,{method:'PUT',body:JSON.stringify({replace:true,modules:[{moduleCode:'dashboard',kind:'core',quantity:1},{moduleCode:'gimnasio',kind:'vertical',quantity:1}]})});
    assert.ok(updated.modules.some((item:any)=>item.moduleCode==='gimnasio'&&item.status==='active'));
    let status=await expectOk(base,token,`/commercial/subscriptions/${subscriptionId}/status`,{method:'POST',body:JSON.stringify({status:'active',reason:'QA activate issue 23'})});
    assert.equal(status.status,'active');
    status=await expectOk(base,token,`/commercial/subscriptions/${subscriptionId}/status`,{method:'POST',body:JSON.stringify({status:'suspended',reason:'QA suspension without data deletion'})});
    assert.equal(status.status,'suspended');assert.equal(status.tenants.filter((item:any)=>item.status==='active').length,2);
    status=await expectOk(base,token,`/commercial/subscriptions/${subscriptionId}/status`,{method:'POST',body:JSON.stringify({status:'active',reason:'QA reactivation'})});
    assert.equal(status.status,'active');
  });

  await t.test('registers a paid period, exposes 7-day renewal, earns and pays seller commission',async()=>{
    const periodStart=new Date();
    const periodEnd=new Date(Date.now()+5*24*60*60*1000);
    const result=await expectOk(base,token,'/commercial/payments',{method:'POST',body:JSON.stringify({subscriptionId,amount:45,currency:'USD',method:'qa-transfer',reference:RUN,status:'paid',periodStart:periodStart.toISOString(),periodEnd:periodEnd.toISOString()})});
    paymentId=String(result.payment?.id||'');assert.ok(paymentId);assert.equal(result.subscription.status,'active');
    const payments=await expectOk(base,token,'/commercial/payments?limit=250');
    assert.ok(payments.some((row:any)=>String(row.id)===paymentId&&row.reference===RUN));
    const renewals=await expectOk(base,token,'/commercial/renewals?days=7');
    assert.ok(renewals.some((row:any)=>String(row.id)===subscriptionId),'paid subscription must appear in 7-day renewal window');
    const summary=await expectOk(base,token,'/commercial/summary');
    assert.ok(Number(summary.renew7)>=1);assert.ok(Number(summary.mrr)>=45);
    const commissions=await expectOk(base,token,`/commercial/commissions?salesAgentId=${encodeURIComponent(agentId)}&status=earned`);
    const commission=commissions.find((row:any)=>String(row.subscriptionId)===subscriptionId&&String(row.paymentId)===paymentId);
    assert.ok(commission,'paid subscription must earn a seller commission');
    commissionId=String(commission.id);assert.equal(Number(commission.amount),4.5);
    const paid=await expectOk(base,token,`/commercial/commissions/${commissionId}/status`,{method:'POST',body:JSON.stringify({status:'paid',reason:`${RUN} QA settlement`})});
    assert.equal(paid.status,'paid');assert.ok(paid.paidAt);
  });

  await t.test('filters and commercial audit expose the created lifecycle without audit payload leakage',async()=>{
    const filtered=await expectOk(base,token,`/commercial/subscriptions?planCode=contador&salesAgentId=${encodeURIComponent(agentId)}&status=active`);
    assert.ok(filtered.some((row:any)=>String(row.id)===subscriptionId));
    const activity=await expectOk(base,token,'/commercial/activity?limit=250');
    const relevant=activity.filter((row:any)=>[customerId,agentId,subscriptionId,paymentId,commissionId].includes(String(row.entityId)));
    assert.ok(relevant.some((row:any)=>row.action==='commercial.subscription.status'));
    assert.ok(relevant.some((row:any)=>row.action==='commercial.payment.create'));
    assert.ok(relevant.some((row:any)=>row.action==='commercial.commission.status'));
    assert.ok(relevant.every((row:any)=>!Object.hasOwn(row,'before')&&!Object.hasOwn(row,'after')),'activity endpoint must not expose raw audit payloads');
  });
});
