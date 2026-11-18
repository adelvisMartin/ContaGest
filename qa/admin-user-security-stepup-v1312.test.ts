import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

const RUN='QA1312-'+randomUUID();

test('#1312 privileged user mutations require the actor password on disposable PostgreSQL17',async(t)=>{
  const h=await createRealBackendHarness({approvedDatabaseNames:['contagest_banking_v93_e2e']});
  const target=await h.prisma.userProfile.create({data:{
    tenantId:h.tenant.id,
    email:`${RUN}@example.invalid`,
    fullName:'QA privilege step-up target',
    status:'active'
  }});
  const oldSessionToken=await h.issueSessionTokenFor({id:target.id,email:target.email});
  t.after(async()=>{
    try {
      await h.prisma.auditLog.deleteMany({where:{
        tenantId:h.tenant.id,entity:'UserProfile',entityId:target.id
      }});
      await h.prisma.$executeRaw`
        DELETE FROM public."UserSession"
        WHERE "tenantId"=${h.tenant.id} AND "userId"=${target.id}
      `;
      await h.prisma.userProfile.deleteMany({where:{id:target.id,tenantId:h.tenant.id}});
    } finally {
      await h.close();
    }
  });

  const url=`/user-security/users/${target.id}`;
  const before=await h.prisma.auditLog.count({where:{tenantId:h.tenant.id,entity:'UserProfile',entityId:target.id}});
  await t.test('missing, empty or wrong current password denies sensitive updates',async()=>{
    for(const currentPassword of [undefined,'','synthetic-wrong-password']){
      const patch={status:'disabled',...(currentPassword===undefined?{}:{currentPassword})};
      const denied=await h.status(url,currentPassword===''?422:403,{
        method:'PATCH',
        body:JSON.stringify(patch)
      });
      if(currentPassword!=='' ){
        assert.equal(denied.payload?.details?.code,'ADMIN_REAUTH_REQUIRED');
      }
      const stored=await h.prisma.userProfile.findUniqueOrThrow({where:{id:target.id}});
      assert.equal(stored.status,'active');
    }
    assert.equal(await h.prisma.auditLog.count({where:{tenantId:h.tenant.id,entity:'UserProfile',entityId:target.id}}),before);
    const active=await h.prisma.$queryRaw<Array<{count:bigint}>>`
      SELECT count(*)::bigint AS count FROM public."UserSession"
      WHERE "tenantId"=${h.tenant.id} AND "userId"=${target.id} AND "status"='active'
    `;
    assert.equal(Number(active[0].count),1,'Failed reauth must not revoke target sessions');
  });

  await t.test('correct actor password updates target, revokes session and creates redacted audit',async()=>{
    const currentPassword=process.env.SEED_ADMIN_PASSWORD;
    assert.ok(currentPassword&&currentPassword.length>=12,'Synthetic seed admin password required');
    const updated=await h.ok(url,{
      method:'PATCH',body:JSON.stringify({status:'disabled',currentPassword})
    });
    assert.equal(updated.updated,true);
    const stored=await h.prisma.userProfile.findUniqueOrThrow({where:{id:target.id}});
    assert.equal(stored.status,'disabled');
    const sessions=await h.prisma.$queryRaw<Array<{status:string}>>`
      SELECT "status" FROM public."UserSession"
      WHERE "tenantId"=${h.tenant.id} AND "userId"=${target.id}
    `;
    assert.ok(sessions.length>=1);
    assert.ok(sessions.every(row=>row.status==='revoked'));
    await h.status('/banking/summary',401,{},oldSessionToken);
    const audit=await h.prisma.auditLog.findMany({where:{
      tenantId:h.tenant.id,entity:'UserProfile',entityId:target.id,action:'security.user.updated'
    }});
    assert.equal(audit.length,1);
    assert.equal(audit[0].userId,h.admin.id);
    assert.equal(JSON.stringify(audit).includes(currentPassword),false,'Audit leaked step-up password');
    assert.equal((audit[0].after as {status?:string}|null)?.status,'disabled');
  });
});
