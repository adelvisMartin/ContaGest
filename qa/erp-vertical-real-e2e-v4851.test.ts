import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';
import { signAccessToken } from '../backend/src/shared/auth/jwt.ts';

const RUN=`V48-${Date.now().toString(36).toUpperCase()}`;
const FOREIGN_RIF=`48${Date.now().toString().slice(-8)}`;
const ids={patients:[] as string[],members:[] as string[]};
let foreignTenantId='';
let restrictedUserId='';
let restrictedRoleId='';

const body=(value:unknown)=>JSON.stringify(value);
const dataRows=(value:any)=>Array.isArray(value)?value:value?.data||[];

test('48/51 real vertical E2E: dental, veterinary and gym persist with auth/tenant/error/cleanup',async(t)=>{
  const h=await createRealBackendHarness();

  t.after(async()=>{
    for(const id of ids.patients){
      await h.prisma.$executeRawUnsafe('DELETE FROM public."CarePatient" WHERE "id"=$1',id).catch(()=>undefined);
    }
    for(const id of ids.members){
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymMember" WHERE "id"=$1',id).catch(()=>undefined);
    }
    if(restrictedUserId){
      await h.prisma.userRole.deleteMany({where:{userId:restrictedUserId}}).catch(()=>undefined);
      await h.prisma.userProfile.deleteMany({where:{id:restrictedUserId}}).catch(()=>undefined);
    }
    if(restrictedRoleId)await h.prisma.role.deleteMany({where:{id:restrictedRoleId}}).catch(()=>undefined);
    if(foreignTenantId)await h.prisma.tenant.deleteMany({where:{id:foreignTenantId}}).catch(()=>undefined);
    await h.close();
  });

  const restrictedRole=await h.prisma.role.create({
    data:{tenantId:h.tenant.id,name:`${RUN} restricted`,system:false,description:'48/51 no vertical permissions'}
  });
  restrictedRoleId=restrictedRole.id;
  const restrictedUser=await h.prisma.userProfile.create({
    data:{tenantId:h.tenant.id,email:`${RUN.toLowerCase()}@qa.local`,fullName:`${RUN} Restricted`,passwordHash:'48-not-used',status:'active'}
  });
  restrictedUserId=restrictedUser.id;
  await h.prisma.userRole.create({data:{userId:restrictedUser.id,roleId:restrictedRole.id}});
  const restrictedToken=signAccessToken({id:restrictedUser.id,email:restrictedUser.email},h.tenant.id);

  const foreignTenant=await h.prisma.tenant.create({
    data:{rif:FOREIGN_RIF,name:`${RUN} Foreign`,legalName:`${RUN} Foreign C.A.`,plan:'enterprise',status:'active',settings:{}}
  });
  foreignTenantId=foreignTenant.id;
  const foreignPatientId=randomUUID();
  const foreignMemberId=randomUUID();
  ids.patients.push(foreignPatientId);
  ids.members.push(foreignMemberId);
  await h.prisma.$executeRawUnsafe(`
    INSERT INTO public."CarePatient" ("id","tenantId","kind","displayName","active","emergencyContact","createdAt","updatedAt")
    VALUES ($1,$2,'human',$3,true,'{}'::jsonb,now(),now())
  `,foreignPatientId,foreignTenant.id,`${RUN} Foreign Dental`);
  await h.prisma.$executeRawUnsafe(`
    INSERT INTO public."GymMember" ("id","tenantId","memberCode","fullName","emergencyContact","goals","status","joinedAt","createdAt","updatedAt")
    VALUES ($1,$2,$3,$4,'{}'::jsonb,'[]'::jsonb,'active',now(),now(),now())
  `,foreignMemberId,foreignTenant.id,`${RUN}-FOREIGN`,`${RUN} Foreign Gym`);

  async function createPatient(kind:'human'|'animal',suffix:string){
    const payload=kind==='human'
      ? {kind,displayName:`${RUN} Dental ${suffix}`,idNumber:`${RUN}-D-${suffix}`,phone:'+580000000001',emergencyContact:{},notes:'created 48',active:true}
      : {kind,displayName:`${RUN} Mascota ${suffix}`,species:'Canino',breed:'Mestizo',guardianName:`${RUN} Tutor`,guardianPhone:'+580000000002',emergencyContact:{},notes:'created 48',active:true};
    const created=await h.ok('/verticals/health/patients',{method:'POST',body:body({...payload,tenantId:foreignTenant.id})});
    ids.patients.push(created.id);
    assert.equal(created.tenantId,h.tenant.id,'patient accepted attacker-supplied tenantId');
    return created;
  }

  await t.test('odontología: create → read → update → refresh → DB persistence → archive',async()=>{
    const created=await createPatient('human','A');
    const listed=dataRows(await h.ok(`/verticals/health/patients?kind=human&q=${encodeURIComponent(RUN)}`));
    assert.ok(listed.some((row:any)=>row.id===created.id),'dental patient missing after create/read');

    const updated=await h.ok(`/verticals/health/patients/${created.id}`,{
      method:'PATCH',body:body({displayName:`${RUN} Dental Editado`,phone:'+580000000099',notes:'updated 48'})
    });
    assert.equal(updated.displayName,`${RUN} Dental Editado`);
    const refreshed=dataRows(await h.ok(`/verticals/health/patients?kind=human&q=${encodeURIComponent('Dental Editado')}`));
    assert.ok(refreshed.some((row:any)=>row.id===created.id&&row.phone==='+580000000099'),'dental refresh lost update');
    const stored=await h.prisma.$queryRawUnsafe<any[]>('SELECT * FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,created.id);
    assert.equal(stored[0]?.notes,'updated 48','dental DB persistence mismatch');

    const archived=await h.ok(`/verticals/health/patients/${created.id}`,{method:'DELETE'});
    assert.equal(archived.active,false,'dental archive did not persist active=false');
  });

  await t.test('veterinaria: create → read → update → refresh → DB persistence → archive',async()=>{
    const created=await createPatient('animal','B');
    const listed=dataRows(await h.ok(`/verticals/health/patients?kind=animal&q=${encodeURIComponent(RUN)}`));
    assert.ok(listed.some((row:any)=>row.id===created.id),'pet missing after create/read');

    const updated=await h.ok(`/verticals/health/patients/${created.id}`,{
      method:'PATCH',body:body({breed:'Mestizo QA 48',guardianPhone:'+580000000088',notes:'vet updated 48'})
    });
    assert.equal(updated.breed,'Mestizo QA 48');
    const refreshed=dataRows(await h.ok(`/verticals/health/patients?kind=animal&q=${encodeURIComponent(RUN)}`));
    assert.ok(refreshed.some((row:any)=>row.id===created.id&&row.guardianPhone==='+580000000088'),'pet refresh lost update');
    const stored=await h.prisma.$queryRawUnsafe<any[]>('SELECT * FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,created.id);
    assert.equal(stored[0]?.notes,'vet updated 48','pet DB persistence mismatch');

    const archived=await h.ok(`/verticals/health/patients/${created.id}`,{method:'DELETE'});
    assert.equal(archived.active,false,'pet archive did not persist active=false');
  });

  await t.test('gimnasio: create → read → update → refresh → DB persistence → archive',async()=>{
    const created=await h.ok('/verticals/gym/members',{method:'POST',body:body({
      memberCode:`${RUN}-GYM`,fullName:`${RUN} Integrante`,email:`${RUN.toLowerCase()}-gym@qa.local`,
      phone:'+580000000003',emergencyContact:{},goals:['QA 48'],medicalNotes:'created 48',status:'active',tenantId:foreignTenant.id
    })});
    ids.members.push(created.id);
    assert.equal(created.tenantId,h.tenant.id,'gym member accepted attacker-supplied tenantId');

    const listed=dataRows(await h.ok(`/verticals/gym/members?q=${encodeURIComponent(RUN)}`));
    assert.ok(listed.some((row:any)=>row.id===created.id),'gym member missing after create/read');

    const updated=await h.ok(`/verticals/gym/members/${created.id}`,{
      method:'PATCH',body:body({fullName:`${RUN} Integrante Editado`,phone:'+580000000077',goals:['QA 48','Persistencia']})
    });
    assert.equal(updated.fullName,`${RUN} Integrante Editado`);
    const refreshed=dataRows(await h.ok(`/verticals/gym/members?q=${encodeURIComponent('Integrante Editado')}`));
    assert.ok(refreshed.some((row:any)=>row.id===created.id&&row.phone==='+580000000077'),'gym refresh lost update');
    const stored=await h.prisma.$queryRawUnsafe<any[]>('SELECT * FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,created.id);
    assert.equal(stored[0]?.medicalNotes,'created 48','gym DB persistence mismatch');

    const archived=await h.ok(`/verticals/gym/members/${created.id}`,{method:'DELETE'});
    assert.equal(archived.status,'inactive','gym archive did not persist inactive status');
  });

  await t.test('permission boundary rejects a user without health.manage/gym.manage',async()=>{
    await h.status('/verticals/health/patients?kind=human',403,{},restrictedToken);
    await h.status('/verticals/gym/members',403,{},restrictedToken);
    await h.status('/verticals/health/patients',403,{method:'POST',body:body({kind:'human',displayName:`${RUN} Forbidden`,emergencyContact:{}})},restrictedToken);
    await h.status('/verticals/gym/members',403,{method:'POST',body:body({memberCode:`${RUN}-NO`,fullName:`${RUN} Forbidden`,emergencyContact:{},goals:[]})},restrictedToken);
  });

  await t.test('tenant isolation hides and protects foreign vertical records',async()=>{
    const healthList=dataRows(await h.ok(`/verticals/health/patients?q=${encodeURIComponent('Foreign Dental')}`));
    assert.equal(healthList.some((row:any)=>row.id===foreignPatientId),false,'foreign patient leaked into active tenant');
    const gymList=dataRows(await h.ok(`/verticals/gym/members?q=${encodeURIComponent('Foreign Gym')}`));
    assert.equal(gymList.some((row:any)=>row.id===foreignMemberId),false,'foreign gym member leaked into active tenant');
    await h.status(`/verticals/health/patients/${foreignPatientId}`,404,{method:'PATCH',body:body({notes:'cross tenant'})});
    await h.status(`/verticals/health/patients/${foreignPatientId}`,404,{method:'DELETE'});
    await h.status(`/verticals/gym/members/${foreignMemberId}`,404,{method:'PATCH',body:body({phone:'+580000000000'})});
    await h.status(`/verticals/gym/members/${foreignMemberId}`,404,{method:'DELETE'});
  });

  await t.test('validation/error states fail closed without partial rows',async()=>{
    const healthBefore=Number((await h.prisma.$queryRawUnsafe<any[]>('SELECT count(*)::int AS n FROM public."CarePatient" WHERE "tenantId"=$1 AND "displayName" LIKE $2',h.tenant.id,`${RUN}%`))[0]?.n||0);
    await h.status('/verticals/health/patients',422,{method:'POST',body:body({kind:'human',displayName:'X',emergencyContact:{}})});
    const healthAfter=Number((await h.prisma.$queryRawUnsafe<any[]>('SELECT count(*)::int AS n FROM public."CarePatient" WHERE "tenantId"=$1 AND "displayName" LIKE $2',h.tenant.id,`${RUN}%`))[0]?.n||0);
    assert.equal(healthAfter,healthBefore,'invalid patient request left a partial row');

    const gymBefore=Number((await h.prisma.$queryRawUnsafe<any[]>('SELECT count(*)::int AS n FROM public."GymMember" WHERE "tenantId"=$1 AND "memberCode"=$2',h.tenant.id,`${RUN}-INVALID`))[0]?.n||0);
    await h.status('/verticals/gym/members',422,{method:'POST',body:body({memberCode:'',fullName:`${RUN} Invalid`,emergencyContact:{},goals:[]})});
    const gymAfter=Number((await h.prisma.$queryRawUnsafe<any[]>('SELECT count(*)::int AS n FROM public."GymMember" WHERE "tenantId"=$1 AND "memberCode"=$2',h.tenant.id,`${RUN}-INVALID`))[0]?.n||0);
    assert.equal(gymAfter,gymBefore,'invalid gym request left a partial row');
  });
});
