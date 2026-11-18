import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRealBackendHarness} from './support/real-backend-harness.ts';

test('#810 real PostgreSQL: microchip is unique per tenant across create and edit',async t=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production');
  assert.ok(!process.env.VERCEL&&!process.env.VERCEL_ENV,'No production provider database');
  const h=await createRealBackendHarness();
  const ownPatients:string[]=[];
  let foreignTenantId='',foreignPetId='';
  t.after(async()=>{
    try{
      for(const id of ownPatients)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,id);
      if(foreignPetId)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',
        foreignTenantId,foreignPetId);
      if(foreignTenantId)await h.prisma.tenant.deleteMany({where:{id:foreignTenantId}});
    }finally{await h.close();}
  });
  const id=randomUUID();
  const post=(microchip:string|null)=>h.request('/verticals/health/patients',{
    method:'POST',body:JSON.stringify({kind:'animal',displayName:'QA microchip '+randomUUID(),
      species:'canine',microchip,active:true,emergencyContact:{}})
  });
  const duplicate='qa-'+id;
  const concurrent=await Promise.all([post(duplicate.toUpperCase()),post(' '+duplicate+' ')]);
  assert.deepEqual(concurrent.map(x=>x.response.status).sort((a,b)=>a-b),[201,409],
    JSON.stringify(concurrent.map(x=>x.payload)));
  const winner=concurrent.find(x=>x.response.status===201)!.data;
  ownPatients.push(winner.id);
  const untagged=await post(null);
  assert.equal(untagged.response.status,201);
  ownPatients.push(untagged.data.id);

  const edit=(patientId:string,microchip:string|null)=>h.request(
    '/verticals/health/patients/'+patientId,{
      method:'PATCH',body:JSON.stringify({microchip})
    });
  const blocked=await edit(untagged.data.id,'  '+duplicate.toLowerCase()+'  ');
  assert.equal(blocked.response.status,409,'edit cannot claim another animal microchip');
  assert.equal((await edit(winner.id,duplicate.toLowerCase())).response.status,200,
    'owner may correct capitalization of its own microchip');
  const persisted=await h.prisma.$queryRawUnsafe<Array<{total:number}>>(`
    SELECT count(*)::int AS total FROM public."CarePatient"
    WHERE "tenantId"=$1 AND "kind"='animal'
      AND lower(btrim("microchip"))=lower(btrim($2))
  `,h.tenant.id,duplicate);
  assert.equal(persisted[0]?.total,1,'no duplicate persists after requests');

  const external=await h.prisma.tenant.create({data:{
    rif:'QA810-'+id.slice(0,15),name:'QA cross tenant veterinarian',
    legalName:'QA cross tenant veterinarian',plan:'commercial',status:'active',settings:{}
  }});
  foreignTenantId=external.id;
  foreignPetId=randomUUID();
  const crossChip='FOREIGN-'+id;
  await h.prisma.$executeRawUnsafe(`
    INSERT INTO public."CarePatient"
      ("id","tenantId","kind","displayName","microchip","active","emergencyContact","createdAt","updatedAt")
    VALUES ($1,$2,'animal',$3,$4,true,'{}'::jsonb,now(),now())
  `,foreignPetId,foreignTenantId,'QA foreign veterinarian',crossChip);
  const sameChipOtherTenant=await post(crossChip.toLowerCase());
  assert.equal(sameChipOtherTenant.response.status,201,
    'tenant B microchip must not block tenant A valid animal');
  ownPatients.push(sameChipOtherTenant.data.id);
  assert.equal((await edit(untagged.data.id,crossChip)).response.status,409,
    'the same chip cannot belong to two animals of tenant A');
});
