import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRealBackendHarness} from './support/real-backend-harness.ts';

test('#810/#814 real PostgreSQL: animal procedure links cannot cross patient or tenant',async t=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production');
  assert.ok(!process.env.VERCEL&&!process.env.VERCEL_ENV,'Shared production DB forbidden');
  const h=await createRealBackendHarness();
  const patients:string[]=[],encounters:string[]=[],professionals:string[]=[],procedures:string[]=[];
  let foreignTenantId='',foreignPetId='',foreignProfessionalId='';
  t.after(async()=>{
    try{
      for(const id of procedures)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CareProcedure" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,id);
      for(const id of encounters)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CareEncounter" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,id);
      for(const id of professionals)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CareProfessional" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,id);
      for(const id of patients)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,id);
      if(foreignProfessionalId)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CareProfessional" WHERE "tenantId"=$1 AND "id"=$2',
        foreignTenantId,foreignProfessionalId);
      if(foreignPetId)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',
        foreignTenantId,foreignPetId);
      if(foreignTenantId)await h.prisma.tenant.deleteMany({where:{id:foreignTenantId}});
    }finally{await h.close();}
  });

  const run=randomUUID();
  const pet=async(name:string)=>{
    const item=await h.ok('/verticals/health/patients',{method:'POST',body:JSON.stringify({
      kind:'animal',displayName:'QA veterinary procedure '+name+' '+run,
      species:'canine',active:true,emergencyContact:{}
    })});
    patients.push(item.id);return item;
  };
  const [animalA,animalB]=await Promise.all([pet('A'),pet('B')]);
  const professional=await h.ok('/verticals/health/professionals',{
    method:'POST',body:JSON.stringify({fullName:'QA veterinary clinician '+run,
      specialty:'veterinary',status:'active',schedule:{}})
  });
  professionals.push(professional.id);
  const encounter=await h.ok('/verticals/health/encounters',{
    method:'POST',body:JSON.stringify({patientId:animalB.id,professionalId:professional.id,
      type:'consultation',specialty:'veterinary',clinicalData:{},status:'draft'})
  });
  encounters.push(encounter.id);
  const foreign=await h.prisma.tenant.create({data:{
    rif:'QA814-'+run.slice(0,15),name:'QA veterinarian foreign tenant',
    legalName:'QA veterinarian foreign tenant',status:'active',plan:'commercial',settings:{}
  }});
  foreignTenantId=foreign.id;
  foreignPetId=randomUUID();foreignProfessionalId=randomUUID();
  await h.prisma.$executeRawUnsafe(`
    INSERT INTO public."CarePatient"
      ("id","tenantId","kind","displayName","active","emergencyContact","createdAt","updatedAt")
    VALUES ($1,$2,'animal',$3,true,'{}'::jsonb,now(),now())
  `,foreignPetId,foreignTenantId,'QA foreign animal '+run);
  await h.prisma.$executeRawUnsafe(`
    INSERT INTO public."CareProfessional"
      ("id","tenantId","fullName","specialty","status","schedule","createdAt","updatedAt")
    VALUES ($1,$2,$3,'veterinary','active','{}'::jsonb,now(),now())
  `,foreignProfessionalId,foreignTenantId,'QA foreign professional '+run);

  const post=(input:Record<string,unknown>)=>h.request('/verticals/veterinary/procedures',{
    method:'POST',body:JSON.stringify({
      patientId:animalA.id,name:'QA surgery '+run,kind:'procedure',status:'planned',...input
    })
  });
  assert.equal((await post({patientId:foreignPetId})).response.status,404,
    'known patient from tenant B must not be accepted');
  assert.equal((await post({encounterId:encounter.id})).response.status,422,
    'encounter of another animal within same tenant must not be linked');
  assert.equal((await post({professionalId:foreignProfessionalId})).response.status,422,
    'professional of tenant B must not be linked');
  assert.equal((await post({encounterId:randomUUID()})).response.status,422);

  const valid=await post({professionalId:professional.id});
  assert.equal(valid.response.status,201,JSON.stringify(valid.payload));
  procedures.push(valid.data.id);
  assert.equal(valid.data.tenantId,h.tenant.id);
  assert.equal(valid.data.patientId,animalA.id);
  assert.equal(valid.data.professionalId,professional.id);
  const list=await h.ok('/verticals/veterinary/procedures?patientId='+animalA.id);
  assert.ok(list.some((row:any)=>row.id===valid.data.id&&
    row.patientName===animalA.displayName&&row.professionalName===professional.fullName));

  const persisted=await h.prisma.$queryRawUnsafe<Array<{total:number}>>(`
    SELECT count(*)::int AS total FROM public."CareProcedure"
    WHERE "tenantId"=$1 AND "name"=$2
  `,h.tenant.id,'QA surgery '+run);
  assert.equal(persisted[0]?.total,1,'rejected references must not leave a row');
});
