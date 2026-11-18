import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

// Executed only by the PostgreSQL17 service with a guarded, disposable DB.
// A and B rows are deliberately distinct, so leaked CSV, JSON and error
// bodies can be checked without exposing a real person's data.
const RUN='QA1288-'+randomUUID().slice(0,12);

test('#1288 master exports enforce real tenant/role/session boundaries',async(t)=>{
  const h=await createRealBackendHarness({approvedDatabaseNames:['contagest_banking_v93_e2e']});
  const startedAt=new Date();
  const tenantB=await h.prisma.tenant.create({
    data:{rif:`${RUN}-B`,name:`${RUN} B`,legalName:`${RUN} B`}
  });
  const a=await h.prisma.client.create({data:{
    tenantId:h.tenant.id,rif:`${RUN}-A`,name:`${RUN} AUTHORIZED ROW`
  }});
  const b=await h.prisma.client.create({data:{
    tenantId:tenantB.id,rif:`${RUN}-B`,name:`${RUN} FORBIDDEN CROSS-TENANT ROW`
  }});
  const restricted=await h.prisma.userProfile.create({data:{
    tenantId:h.tenant.id,email:`${RUN.toLowerCase()}@example.invalid`,
    fullName:'QA unprivileged export actor',status:'active'
  }});
  t.after(async()=>{
    try{
      await h.prisma.$executeRaw`
        DELETE FROM public."UserSession" WHERE "tenantId"=${h.tenant.id} AND "userId"=${restricted.id}
      `;
      await h.prisma.auditLog.deleteMany({where:{
        tenantId:h.tenant.id,action:'data.export.master',createdAt:{gte:startedAt}
      }});
      await h.prisma.userProfile.deleteMany({where:{id:restricted.id,tenantId:h.tenant.id}});
      await h.prisma.client.deleteMany({where:{id:a.id,tenantId:h.tenant.id}});
      await h.prisma.client.deleteMany({where:{id:b.id,tenantId:tenantB.id}});
      await h.prisma.tenant.delete({where:{id:tenantB.id}});
    }finally{
      await h.close();
    }
  });

  await t.test('JSON and CSV contain A but never B, without private fields',async()=>{
    for(const format of ['json','csv']){
      const result=await h.request(`/exports/masters/clients?format=${format}&take=500`);
      assert.equal(result.response.status,200);
      assert.equal(result.response.headers.get('cache-control'),'no-store, max-age=0');
      const content=JSON.stringify(result.payload);
      assert.equal(content.includes(a.rif),true,'The allowed tenant row must remain readable');
      assert.equal(content.includes(b.rif),false,'Tenant B identifier leaked in A export');
      assert.equal(content.includes('FORBIDDEN CROSS-TENANT ROW'),false);
      assert.equal(content.includes('passwordHash'),false);
      assert.equal(content.includes('tenantId'),false);
    }
  });

  await t.test('injecting a tenant parameter fails closed without exposing B',async()=>{
    const result=await h.status(
      `/exports/masters/clients?format=json&tenantId=${tenantB.id}`,400
    );
    assert.equal(JSON.stringify(result.payload).includes(b.rif),false);
    assert.equal(JSON.stringify(result.payload).includes(b.name),false);
  });

  await t.test('unauthorized role and absent bearer cannot download tenant records',async()=>{
    const token=await h.issueSessionTokenFor({id:restricted.id,email:restricted.email});
    const denied=await h.status('/exports/masters/clients?format=csv',403,{},token);
    assert.equal(JSON.stringify(denied.payload).includes(a.rif),false);
    assert.equal(JSON.stringify(denied.payload).includes(b.rif),false);
    const anonymous=await h.status('/exports/masters/clients?format=csv',401,{},'');
    assert.equal(JSON.stringify(anonymous.payload).includes(a.rif),false);
  });

  await t.test('the authorized export creates an audit without the exported data',async()=>{
    const records=await h.prisma.auditLog.findMany({where:{
      tenantId:h.tenant.id,action:'data.export.master',createdAt:{gte:startedAt}
    }});
    assert.equal(records.length,2);
    assert.ok(records.every(row=>row.userId===h.admin.id));
    const projected=JSON.stringify(records.map(row=>row.after));
    assert.equal(projected.includes(a.rif),false);
    assert.equal(projected.includes(a.name),false);
    assert.equal(projected.includes(b.rif),false);
    assert.ok(records.every(row=>(row.after as {sha256?:string}|null)?.sha256?.length===64));
  });
});
