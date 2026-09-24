import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../backend/src/app.ts';
import { prisma } from '../backend/src/database/prisma.ts';
import { signAccessToken } from '../backend/src/shared/auth/jwt.ts';

const QA_TENANT_RIF='00000000';
const ADMIN_EMAIL='admin@erp.local';
const QA_USER_EMAIL='qa58x5.20260825@demo.local';
const OTHER_TENANT_SENTINEL_SKU='QA-XTENANT-20260825';
const RUN=`QA58X5-${Date.now().toString(36).toUpperCase()}`;

function unwrap(payload:any){return payload?.data ?? payload;}

async function request(base:string,token:string,path:string,options:RequestInit={}){
  const headers=new Headers(options.headers||{});
  headers.set('authorization',`Bearer ${token}`);
  headers.set('x-forwarded-for',`10.58.${Math.floor(Math.random()*200)+1}.${Math.floor(Math.random()*200)+1}`);
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

async function assertCrud({base,token,path,create,update,identity}:{base:string;token:string;path:string;create:Record<string,unknown>;update:Record<string,unknown>;identity:(row:any)=>boolean}){
  let id='';
  try{
    const created=await expectOk(base,token,path,{method:'POST',body:JSON.stringify({...create,tenantId:'demo-tenant'})});
    id=String(created.id||'');
    assert.ok(id,`${path}: create did not return id`);
    assert.notEqual(created.tenantId,'demo-tenant',`${path}: accepted attacker-supplied tenantId`);

    const byId=await expectOk(base,token,`${path}/${encodeURIComponent(id)}`);
    assert.equal(String(byId.id),id,`${path}: read-after-create mismatch`);
    assert.ok(identity(byId),`${path}: persisted identity fields do not match create`);

    const updated=await expectOk(base,token,`${path}/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(update)});
    assert.equal(String(updated.id),id,`${path}: update changed identity`);
    for(const [key,value] of Object.entries(update))assert.deepEqual(updated[key],value,`${path}: update field ${key} not persisted in response`);

    const refreshed=await expectOk(base,token,`${path}/${encodeURIComponent(id)}`);
    for(const [key,value] of Object.entries(update))assert.deepEqual(refreshed[key],value,`${path}: refresh lost field ${key}`);

    const list=await expectOk(base,token,`${path}?take=100`);
    assert.ok(Array.isArray(list),`${path}: list is not array`);
    assert.ok(list.some((row:any)=>String(row.id)===id),`${path}: created row missing after refresh/list`);

    const audit=await prisma.auditLog.findMany({where:{entityId:id},orderBy:{createdAt:'asc'}});
    assert.ok(audit.some((row)=>row.action==='create'),`${path}: create audit missing`);
    assert.ok(audit.some((row)=>row.action==='update'),`${path}: update audit missing`);

    await expectOk(base,token,`${path}/${encodeURIComponent(id)}`,{method:'DELETE'});
    await expectStatus(base,token,`${path}/${encodeURIComponent(id)}`,404);
    const deletedAudit=await prisma.auditLog.findMany({where:{entityId:id}});
    assert.ok(deletedAudit.some((row)=>row.action==='delete'),`${path}: delete audit missing`);
    return{id,auditCount:deletedAudit.length};
  } finally {
    if(id){
      const delegateByPath:Record<string,any>={
        '/clients':prisma.client,
        '/suppliers':prisma.supplier,
        '/products':prisma.product,
        '/bank-accounts':prisma.bankAccount,
        '/tax-periods':prisma.taxPeriod
      };
      await delegateByPath[path]?.deleteMany({where:{id}}).catch(()=>undefined);
      await prisma.auditLog.deleteMany({where:{entityId:id}}).catch(()=>undefined);
    }
  }
}

test('post-merge real persistence: CRUD, audit, licensing and tenant isolation',async(t)=>{
  const tenant=await prisma.tenant.findUnique({where:{rif:QA_TENANT_RIF}});
  assert.ok(tenant,`QA tenant ${QA_TENANT_RIF} not found`);
  const admin=await prisma.userProfile.findFirst({where:{tenantId:tenant.id,email:ADMIN_EMAIL,status:'active'}});
  assert.ok(admin,`QA admin ${ADMIN_EMAIL} not found`);
  const platformPermission=await prisma.userRole.count({where:{userId:admin.id,role:{tenantId:tenant.id,permissions:{some:{permission:{key:'platform.manage'}}}}}});
  assert.ok(platformPermission>0,'Admin used by persistence E2E does not have platform.manage');
  const token=signAccessToken({id:admin.id,email:admin.email},tenant.id);

  const qaUser=await prisma.userProfile.upsert({
    where:{tenantId_email:{tenantId:tenant.id,email:QA_USER_EMAIL}},
    update:{fullName:'QA Restricted User',status:'active'},
    create:{tenantId:tenant.id,email:QA_USER_EMAIL,fullName:'QA Restricted User',passwordHash:'qa-fixture-not-used-for-login',status:'active'}
  });
  t.after(async()=>{
    await prisma.userRole.deleteMany({where:{userId:qaUser.id}}).catch(()=>undefined);
    await prisma.userProfile.deleteMany({where:{id:qaUser.id,email:QA_USER_EMAIL}}).catch(()=>undefined);
  });
  const restrictedToken=signAccessToken({id:qaUser.id,email:qaUser.email},tenant.id);

  const app=createApp();
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>((resolve,reject)=>{server.once('listening',()=>resolve());server.once('error',reject);});
  t.after(async()=>{await new Promise<void>((resolve)=>server.close(()=>resolve()));});
  const address=server.address() as AddressInfo;
  const base=`http://127.0.0.1:${address.port}`;

  await t.test('real DB health and auth middleware',async()=>{
    const health=await expectOk(base,token,'/health/db');
    assert.ok(Array.isArray(health.database),'DB health did not return database evidence');
    const restricted=await request(base,restrictedToken,'/clients');
    assert.equal(restricted.response.status,403,'Unlicensed QA role unexpectedly bypassed license guard');
  });

  await t.test('clientes CRUD persists across read/update/refresh/delete',async()=>{
    await assertCrud({base,token,path:'/clients',create:{rif:`J-${RUN}-C`,name:`${RUN} Cliente`,contact:'QA'},update:{name:`${RUN} Cliente Editado`,phone:'+580000000000'},identity:(row)=>row.rif===`J-${RUN}-C`});
  });

  await t.test('proveedores CRUD persists across read/update/refresh/delete',async()=>{
    await assertCrud({base,token,path:'/suppliers',create:{rif:`J-${RUN}-S`,name:`${RUN} Proveedor`,retentionProfile:'ordinary'},update:{name:`${RUN} Proveedor Editado`,contact:'QA Persistencia'},identity:(row)=>row.rif===`J-${RUN}-S`});
  });

  await t.test('productos CRUD persists and foreign tenant sentinel is invisible',async()=>{
    await assertCrud({base,token,path:'/products',create:{sku:`${RUN}-SKU`,name:`${RUN} Producto`,cost:7.25,price:11.5,stock:3,minStock:1,taxRate:16},update:{name:`${RUN} Producto Editado`,stock:9,price:12.75},identity:(row)=>row.sku===`${RUN}-SKU`});
    const sentinel=await prisma.product.findFirst({where:{sku:OTHER_TENANT_SENTINEL_SKU}});
    assert.ok(sentinel,'Cross-tenant sentinel product is missing');
    assert.notEqual(sentinel.tenantId,tenant.id,'Cross-tenant sentinel accidentally belongs to QA tenant');
    await expectStatus(base,token,`/products/${sentinel.id}`,404);
    await expectStatus(base,token,`/products/${sentinel.id}`,404,{method:'PUT',body:JSON.stringify({name:'ATTEMPTED CROSS TENANT UPDATE'})});
    await expectStatus(base,token,`/products/${sentinel.id}`,404,{method:'DELETE'});
    const unchanged=await prisma.product.findUnique({where:{id:sentinel.id}});
    assert.equal(unchanged?.name,'QA Cross Tenant Sentinel','Cross-tenant sentinel was modified');
  });

  await t.test('cuentas bancarias CRUD persists across refresh',async()=>{
    await assertCrud({base,token,path:'/bank-accounts',create:{bankName:'Banco QA',accountNo:`${RUN}-0001`,currency:'USD',balance:100},update:{bankName:'Banco QA Editado',balance:125.5},identity:(row)=>row.accountNo===`${RUN}-0001`});
  });

  await t.test('periodos fiscales CRUD persists across refresh',async()=>{
    const period=`2099-${String((Date.now()%9)+1).padStart(2,'0')}`;
    await assertCrud({base,token,path:'/tax-periods',create:{period,status:'open',ivaDebit:10,ivaCredit:4,igtfPaid:1},update:{status:'review',ivaDebit:12},identity:(row)=>row.period===period});
  });
});
