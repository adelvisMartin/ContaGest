import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';
import { signAccessToken } from '../backend/src/shared/auth/jwt.ts';

const PERMISSIONS=['clients.manage','purchases.manage','inventory.manage','banking.manage','taxes.export','sales.view','sales.manage','admin.manage','reports.view','accounting.manage'];

function body(value:unknown){return{method:'POST',body:JSON.stringify(value)} satisfies RequestInit;}
function put(value:unknown){return{method:'PUT',body:JSON.stringify(value)} satisfies RequestInit;}

async function assertHidden(result:{response:Response;payload:any},foreignNeedles:string[]){
  assert.ok([403,404,409].includes(result.response.status),`unexpected status ${result.response.status}: ${JSON.stringify(result.payload)}`);
  const text=JSON.stringify(result.payload);
  for(const needle of foreignNeedles)assert.doesNotMatch(text,new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
}

test('641 real PostgreSQL/API: tenant A and B cannot observe or mutate each other',async(t)=>{
  const harness=await createRealBackendHarness();
  const run=randomUUID().slice(0,8);
  const tenantB=await harness.prisma.tenant.create({data:{rif:`QA641-${run}`,name:`QA641 tenant-b ${run}`,plan:'enterprise',status:'active'}});
  const userB=await harness.prisma.userProfile.create({data:{tenantId:tenantB.id,email:`qa641-b-${run}@example.test`,fullName:'QA641 Tenant B',status:'active'}});
  const roleB=await harness.prisma.role.create({data:{tenantId:tenantB.id,name:`QA641 admin ${run}`,system:false}});
  for(const key of PERMISSIONS){
    const permission=await harness.prisma.permission.upsert({where:{key},update:{},create:{key,description:`QA641 ${key}`}});
    await harness.prisma.rolePermission.create({data:{roleId:roleB.id,permissionId:permission.id}});
  }
  await harness.prisma.userRole.create({data:{userId:userB.id,roleId:roleB.id}});
  const tokenB=signAccessToken({id:userB.id,email:userB.email},tenantB.id);
  const tenantA=harness.tenant.id;
  const aClient=await harness.prisma.client.create({data:{tenantId:tenantA,rif:`A641-${run}`,name:`QA641 client-a ${run}`}});
  const bClient=await harness.prisma.client.create({data:{tenantId:tenantB.id,rif:`B641-${run}`,name:`QA641 client-b ${run}`}});
  const aSupplier=await harness.prisma.supplier.create({data:{tenantId:tenantA,rif:`AS641-${run}`,name:`QA641 supplier-a ${run}`}});
  const bSupplier=await harness.prisma.supplier.create({data:{tenantId:tenantB.id,rif:`BS641-${run}`,name:`QA641 supplier-b ${run}`}});
  const aProduct=await harness.prisma.product.create({data:{tenantId:tenantA,sku:`AP641-${run}`,name:`QA641 product-a ${run}`,cost:10,price:20}});
  const bProduct=await harness.prisma.product.create({data:{tenantId:tenantB.id,sku:`BP641-${run}`,name:`QA641 product-b ${run}`,cost:10,price:20}});
  const aPeriod=await harness.prisma.taxPeriod.create({data:{tenantId:tenantA,period:`641A-${run}`,status:'open'}});
  const bPeriod=await harness.prisma.taxPeriod.create({data:{tenantId:tenantB.id,period:`641B-${run}`,status:'open'}});
  let spoofCreatedId='';

  t.after(async()=>{
    try{
      if(spoofCreatedId)await harness.prisma.client.deleteMany({where:{id:spoofCreatedId,tenantId:tenantA}}).catch(()=>undefined);
      await harness.prisma.taxPeriod.deleteMany({where:{id:aPeriod.id}}).catch(()=>undefined);
      await harness.prisma.product.deleteMany({where:{id:aProduct.id}}).catch(()=>undefined);
      await harness.prisma.supplier.deleteMany({where:{id:aSupplier.id}}).catch(()=>undefined);
      await harness.prisma.client.deleteMany({where:{id:aClient.id}}).catch(()=>undefined);
      await harness.prisma.tenant.deleteMany({where:{id:tenantB.id}}).catch(()=>undefined);
    }finally{await harness.close();}
  });

  await t.test('CRUD IDOR/list/search/update/delete stay tenant scoped in both directions',async()=>{
    for(const [token,foreignClient,foreignTenant] of [[harness.token,bClient,tenantB.id],[tokenB,aClient,tenantA]] as const){
      const get=await harness.request(`/clients/${foreignClient.id}`,{},token);assert.equal(get.response.status,404);await assertHidden(get,[foreignClient.id,foreignTenant]);
      const update=await harness.request(`/clients/${foreignClient.id}`,put({name:'MUTATION MUST NOT HAPPEN'}),token);assert.equal(update.response.status,404);await assertHidden(update,[foreignClient.id,foreignTenant]);
      const remove=await harness.request(`/clients/${foreignClient.id}`,{method:'DELETE'},token);assert.equal(remove.response.status,404);await assertHidden(remove,[foreignClient.id,foreignTenant]);
      const list=await harness.request('/clients?q=QA641',{},token);assert.equal(list.response.status,200,JSON.stringify(list.payload));
      assert.ok(!JSON.stringify(list.data).includes(foreignClient.id));
    }
  });

  await t.test('client-supplied tenantId is never authority on create',async()=>{
    const result=await harness.request('/clients',body({tenantId:tenantB.id,rif:`SP641-${run}`,name:`QA641 spoof ${run}`}),harness.token);
    assert.equal(result.response.status,200,JSON.stringify(result.payload));
    spoofCreatedId=String(result.data.id||'');assert.ok(spoofCreatedId);
    const stored=await harness.prisma.client.findUnique({where:{id:spoofCreatedId},select:{tenantId:true}});
    assert.equal(stored?.tenantId,tenantA);
  });

  await t.test('nested sales/purchase references reject foreign ids generically in both directions',async()=>{
    const attacks=[
      {token:harness.token,path:'/sales',payload:{number:`S641-A-${run}`,fiscalPeriod:'2026-09',status:'draft',clientId:bClient.id,lines:[{productId:bProduct.id,description:'foreign',quantity:'1',unitPrice:'10',taxRate:'16'}]},needles:[bClient.id,bProduct.id,tenantB.id]},
      {token:tokenB,path:'/sales',payload:{number:`S641-B-${run}`,fiscalPeriod:'2026-09',status:'draft',clientId:aClient.id,lines:[{productId:aProduct.id,description:'foreign',quantity:'1',unitPrice:'10',taxRate:'16'}]},needles:[aClient.id,aProduct.id,tenantA]},
      {token:harness.token,path:'/purchases',payload:{number:`P641-A-${run}`,fiscalPeriod:'2026-09',status:'draft',supplierId:bSupplier.id,lines:[{productId:bProduct.id,description:'foreign',quantity:'1',unitCost:'10',taxRate:'16'}]},needles:[bSupplier.id,bProduct.id,tenantB.id]},
      {token:tokenB,path:'/purchases',payload:{number:`P641-B-${run}`,fiscalPeriod:'2026-09',status:'draft',supplierId:aSupplier.id,lines:[{productId:aProduct.id,description:'foreign',quantity:'1',unitCost:'10',taxRate:'16'}]},needles:[aSupplier.id,aProduct.id,tenantA]},
    ];
    for(const attack of attacks){
      const result=await harness.request(attack.path,body(attack.payload),attack.token);
      assert.equal(result.response.status,409,`${attack.path}: ${JSON.stringify(result.payload)}`);
      assert.equal(result.payload?.error?.details?.code||result.payload?.details?.code,'CROSS_TENANT_REFERENCE');
      await assertHidden(result,attack.needles);
    }
  });

  await t.test('fiscal period reference cannot cross tenant',async()=>{
    for(const [token,foreignPeriod,foreignTenant] of [[harness.token,bPeriod,tenantB.id],[tokenB,aPeriod,tenantA]] as const){
      const result=await harness.request('/fiscal/declarations',body({periodId:foreignPeriod.id}),token);
      assert.equal(result.response.status,409,JSON.stringify(result.payload));
      assert.equal(result.payload?.error?.details?.code||result.payload?.details?.code,'CROSS_TENANT_REFERENCE');
      await assertHidden(result,[foreignPeriod.id,foreignTenant]);
    }
  });

  await t.test('PostgreSQL composite FK rejects direct A→B parent reference',async()=>{
    const id=randomUUID();
    let rejected=false;
    try{
      await harness.prisma.$executeRawUnsafe(
        'INSERT INTO public."SalesInvoice" ("id","tenantId","clientId","number","fiscalPeriod","currency","exchangeRate","subtotal","iva","igtf","islrRetention","total","status","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,1,0,0,0,0,0,\'draft\',now(),now())',
        id,tenantA,bClient.id,`RAW641-${run}`,'2026-09','VES'
      );
    }catch(error:any){rejected=true;assert.ok(['23503','P2003'].includes(String(error?.code||error?.meta?.code||''))||/foreign key|constraint/i.test(String(error?.message||error)));}
    assert.equal(rejected,true,'cross-tenant SalesInvoice.clientId insert must be rejected by PostgreSQL');
    await harness.prisma.salesInvoice.deleteMany({where:{id}}).catch(()=>undefined);
  });

  await t.test('RBAC role lookup cannot target a role owned by the other tenant',async()=>{
    const result=await harness.request(`/rbac/roles/${encodeURIComponent(roleB.name)}/permissions`,put({permissionKeys:['reports.view']}),harness.token);
    assert.equal(result.response.status,404,JSON.stringify(result.payload));
    await assertHidden(result,[roleB.id,tenantB.id]);
  });
});
