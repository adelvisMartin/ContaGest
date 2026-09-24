import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV='test';
process.env.ALLOW_PUBLIC_REGISTER='local';

const { createRealBackendHarness }=await import('./support/real-backend-harness.ts');

function solveCaptcha(question:string){
  const match=String(question||'').match(/(\d+)\s*([+\-×])\s*(\d+)/);
  assert.ok(match,`captcha question not understood: ${question}`);
  const left=Number(match[1]),right=Number(match[3]);
  if(match[2]==='+')return String(left+right);
  if(match[2]==='-')return String(left-right);
  return String(left*right);
}

test('55/75 real PostgreSQL: create-only tenant registration and atomic licensed-user provisioning',async(t)=>{
  const harness=await createRealBackendHarness();
  const run=randomUUID().slice(0,8);
  const tenantRif=`QA55-${run}`.toUpperCase();
  const tenantName=`QA55 Tenant ${run}`;
  const adminEmail=`qa55-admin-${run}@example.test`;
  const duplicateEmail=`qa55-duplicate-${run}@example.test`;
  const clientEmail=`qa55-client-${run}@example.test`;
  let registeredTenantId='';
  let registeredAdminId='';
  let licensedUserId='';
  let licenseId='';
  let licensedAccountUserId='';
  let registeredAccountUserId='';

  async function captcha(){
    const result=await harness.request('/auth/captcha',{},'');
    assert.equal(result.response.status,200);
    return{captchaToken:String(result.data.token),captchaAnswer:solveCaptcha(String(result.data.question))};
  }

  t.after(async()=>{
    try{
      if(licenseId){
        await harness.prisma.$executeRawUnsafe('DELETE FROM public."LicenseActivation" WHERE "licenseId"=$1',licenseId).catch(()=>undefined);
        await harness.prisma.auditLog.deleteMany({where:{entity:'LicenseKey',entityId:licenseId}}).catch(()=>undefined);
        await harness.prisma.licenseKey.deleteMany({where:{id:licenseId}}).catch(()=>undefined);
      }
      if(licensedUserId){
        await harness.prisma.userRole.deleteMany({where:{userId:licensedUserId}}).catch(()=>undefined);
        await harness.prisma.role.deleteMany({where:{tenantId:harness.tenant.id,name:`Cliente licencia ${licensedUserId.slice(0,8)}`}}).catch(()=>undefined);
        await harness.prisma.$executeRawUnsafe('DELETE FROM public."TenantMembership" WHERE "userProfileId"=$1',licensedUserId).catch(()=>undefined);
        await harness.prisma.userProfile.deleteMany({where:{id:licensedUserId}}).catch(()=>undefined);
      }
      if(licensedAccountUserId)await harness.prisma.$executeRawUnsafe('DELETE FROM public."AccountUser" WHERE "id"=$1 AND NOT EXISTS (SELECT 1 FROM public."TenantMembership" tm WHERE tm."accountUserId"=$1)',licensedAccountUserId).catch(()=>undefined);

      if(registeredTenantId){
        const membershipRows=await harness.prisma.$queryRawUnsafe<Array<{accountUserId:string}>>('SELECT "accountUserId" FROM public."TenantMembership" WHERE "tenantId"=$1',registeredTenantId).catch(()=>[]);
        registeredAccountUserId=registeredAccountUserId||String(membershipRows[0]?.accountUserId||'');
        await harness.prisma.$executeRawUnsafe('DELETE FROM public."UserSession" WHERE "tenantId"=$1',registeredTenantId).catch(()=>undefined);
        await harness.prisma.$executeRawUnsafe('DELETE FROM public."TenantMembership" WHERE "tenantId"=$1',registeredTenantId).catch(()=>undefined);
        await harness.prisma.tenant.deleteMany({where:{id:registeredTenantId}}).catch(()=>undefined);
      }
      if(registeredAccountUserId)await harness.prisma.$executeRawUnsafe('DELETE FROM public."AccountUser" WHERE "id"=$1 AND NOT EXISTS (SELECT 1 FROM public."TenantMembership" tm WHERE tm."accountUserId"=$1)',registeredAccountUserId).catch(()=>undefined);
    }finally{
      await harness.close();
    }
  });

  await t.test('register creates tenant admin role and membership as one usable identity',async()=>{
    const challenge=await captcha();
    const result=await harness.request('/auth/register',{
      method:'POST',
      body:JSON.stringify({
        tenantRif,tenantName,legalName:`${tenantName} Legal`,fullName:'QA55 Admin',email:adminEmail,
        password:'Qa54!AtomicProvisioning2026',plan:'enterprise',...challenge
      })
    },'');
    assert.equal(result.response.status,201,JSON.stringify(result.payload));
    registeredTenantId=String(result.data.tenant?.id||'');
    registeredAdminId=String(result.data.user?.id||'');
    assert.ok(registeredTenantId&&registeredAdminId);
    assert.equal(String(result.data.tenant?.rif),tenantRif);

    const membershipRows=await harness.prisma.$queryRawUnsafe<Array<{id:string;accountUserId:string;roleLabel:string}>>(
      'SELECT "id","accountUserId","roleLabel" FROM public."TenantMembership" WHERE "tenantId"=$1 AND "userProfileId"=$2',
      registeredTenantId,registeredAdminId
    );
    assert.equal(membershipRows.length,1);
    assert.equal(membershipRows[0].roleLabel,'Administrador');
    registeredAccountUserId=membershipRows[0].accountUserId;

    const adminPermission=await harness.prisma.userRole.count({
      where:{userId:registeredAdminId,role:{tenantId:registeredTenantId,system:true,permissions:{some:{permission:{key:'admin.manage'}}}}}
    });
    assert.equal(adminPermission,1);
  });

  await t.test('same RIF conflicts without mutating tenant or creating a second user',async()=>{
    const challenge=await captcha();
    const result=await harness.request('/auth/register',{
      method:'POST',
      body:JSON.stringify({
        tenantRif,tenantName:'MUTATION MUST NOT HAPPEN',legalName:'MUTATION MUST NOT HAPPEN',
        fullName:'Duplicate Admin',email:duplicateEmail,password:'Qa54!DuplicateAttempt2026',plan:'trial',...challenge
      })
    },'');
    assert.equal(result.response.status,409,JSON.stringify(result.payload));
    const tenant=await harness.prisma.tenant.findUnique({where:{id:registeredTenantId},select:{name:true,legalName:true,plan:true,status:true}});
    assert.equal(tenant?.name,tenantName);
    assert.equal(tenant?.legalName,`${tenantName} Legal`);
    assert.equal(tenant?.plan,'enterprise');
    assert.equal(tenant?.status,'active');
    const duplicate=await harness.prisma.userProfile.findFirst({where:{tenantId:registeredTenantId,email:duplicateEmail}});
    assert.equal(duplicate,null);
  });

  await t.test('license endpoint atomically materializes user membership RBAC and license linkage',async()=>{
    const data=await harness.ok('/licenses',{
      method:'POST',
      body:JSON.stringify({
        userEmail:clientEmail,fullName:'QA55 Dentistry User',plan:'trial',days:7,
        modules:['dashboard','clientes','odontologia'],businessSector:'odontologia',
        commercialUse:'evaluacion',maxUsers:1,maxDevices:1
      })
    });
    licenseId=String(data.id||'');
    licensedUserId=String(data.userId||'');
    assert.ok(licenseId&&licensedUserId);
    assert.equal(data.businessSector,'odontologia');
    assert.deepEqual(data.modules,['dashboard','clientes','odontologia']);

    const rows=await harness.prisma.$queryRawUnsafe<Array<{
      userId:string;businessCategory:string;issuedForMembershipId:string;membershipUserId:string;accountUserId:string;licenseStatus:string;
    }>>(`
      SELECT lk."userId",lk."businessCategory",lk."issuedForMembershipId",
             tm."userProfileId" AS "membershipUserId",tm."accountUserId",
             lk."status" AS "licenseStatus"
      FROM public."LicenseKey" lk
      JOIN public."TenantMembership" tm ON tm."id"=lk."issuedForMembershipId"
      WHERE lk."id"=$1 AND lk."tenantId"=$2
    `,licenseId,harness.tenant.id);
    assert.equal(rows.length,1);
    assert.equal(rows[0].userId,licensedUserId);
    assert.equal(rows[0].membershipUserId,licensedUserId);
    assert.equal(rows[0].businessCategory,'odontologia');
    assert.equal(rows[0].licenseStatus,'active');
    licensedAccountUserId=rows[0].accountUserId;

    const permissions=await harness.prisma.$queryRawUnsafe<Array<{key:string}>>(`
      SELECT DISTINCT p."key"
      FROM public."UserRole" ur
      JOIN public."Role" r ON r."id"=ur."roleId" AND r."tenantId"=$2
      JOIN public."RolePermission" rp ON rp."roleId"=r."id"
      JOIN public."Permission" p ON p."id"=rp."permissionId"
      WHERE ur."userId"=$1
      ORDER BY p."key"
    `,licensedUserId,harness.tenant.id);
    const keys=new Set(permissions.map((row)=>row.key));
    for(const expected of ['reports.view','dashboard.view','clients.manage','health.manage'])assert.ok(keys.has(expected),expected);
    assert.ok(!keys.has('gym.manage'),'dentistry provisioning must not widen to gym.manage');

    const audit=await harness.prisma.auditLog.findFirst({where:{tenantId:harness.tenant.id,entity:'LicenseKey',entityId:licenseId,action:'license.create'}});
    assert.ok(audit);
  });
});
