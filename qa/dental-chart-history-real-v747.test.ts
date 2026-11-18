import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRealBackendHarness} from './support/real-backend-harness.ts';

test('#747 dental signed chart history comes from unchanged CareEncounter authority',async(t)=>{
  const h=await createRealBackendHarness();
  const patientName='QA dental history '+randomUUID();
  const patientRows=await h.prisma.$queryRawUnsafe<Array<{id:string}>>(`
    INSERT INTO public."CarePatient" ("tenantId","kind","displayName")
    VALUES ($1,'human',$2) RETURNING "id"
  `,h.tenant.id,patientName);
  const patientId=patientRows[0].id,ids:string[]=[];
  t.after(async()=>{
    try{
      if(ids.length)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CareEncounter" WHERE "tenantId"=$1 AND "id"=ANY($2::text[])',
        h.tenant.id,ids
      );
      await h.prisma.$executeRawUnsafe('DELETE FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,patientId);
    }finally{await h.close();}
  });
  const clinical=(surface:string)=>JSON.stringify({
    tooth:'11',odontogram:{dentition:'permanent',tooth:'11',surfaces:[surface],condition:'Hallazgo test'}
  });
  for(const [data,status,ageDays] of [
    [clinical('mesial'),'amended',2],[clinical('distal'),'signed',1]
  ] as const){
    const rows=await h.prisma.$queryRawUnsafe<Array<{id:string}>>(`
      INSERT INTO public."CareEncounter"
        ("tenantId","patientId","specialty","type","clinicalData","status","signedAt")
      VALUES ($1,$2,'dentistry','dental-treatment',$3::jsonb,$4,now()-($5::int*interval '1 day'))
      RETURNING "id"
    `,h.tenant.id,patientId,data,status,ageDays);
    ids.push(rows[0].id);
  }
  const response=await h.ok('/verticals/health/dental/chart-history?patientId='+patientId);
  assert.equal(response.sourceAuthority,'CareEncounter.signed');
  assert.equal(response.complete,true);
  assert.deepEqual(response.history.map((x:any)=>x.surface),['mesial','distal']);
  assert.deepEqual(response.current.map((x:any)=>x.surface),['distal']);
  await h.status('/verticals/health/dental/chart-history?patientId='+randomUUID(),404);
});
