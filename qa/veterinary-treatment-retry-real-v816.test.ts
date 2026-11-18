import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRealBackendHarness} from './support/real-backend-harness.ts';

test('#816 PG17: treatment retry does not duplicate care events or derived vitals',async t=>{
  const h=await createRealBackendHarness();
  let patientId='',hospitalizationId='';
  t.after(async()=>{
    try{
      if(hospitalizationId){
        await h.prisma.$executeRawUnsafe(`
          DELETE FROM public."CareMeasurement"
          WHERE "tenantId"=$1
            AND "metadata"->>'sourceObservationId' IN (
              SELECT "id" FROM public."CareHospitalObservation"
              WHERE "tenantId"=$1 AND "hospitalizationId"=$2
            )
        `,h.tenant.id,hospitalizationId);
        await h.prisma.$executeRawUnsafe(
          'DELETE FROM public."CareHospitalObservation" WHERE "tenantId"=$1 AND "hospitalizationId"=$2',
          h.tenant.id,hospitalizationId);
        await h.prisma.$executeRawUnsafe(
          'DELETE FROM public."CareHospitalization" WHERE "tenantId"=$1 AND "id"=$2',
          h.tenant.id,hospitalizationId);
      }
      if(patientId)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,patientId);
    }finally{await h.close();}
  });
  const patient=await h.ok('/verticals/health/patients',{method:'POST',body:JSON.stringify({
    kind:'animal',displayName:'QA treatment retry '+randomUUID(),
    species:'canine',active:true,emergencyContact:{}
  })});
  patientId=patient.id;
  const admission=await h.ok('/verticals/veterinary/hospitalizations',{
    method:'POST',body:JSON.stringify({
      patientId,status:'admitted',reason:'QA treatment retry',carePlan:{}
    })
  });
  hospitalizationId=admission.id;
  const post=(data:unknown)=>h.request(
    '/verticals/veterinary/hospitalizations/'+hospitalizationId+'/treatment-sheet',{
      method:'POST',body:JSON.stringify(data)
    });
  const requestKey=randomUUID();
  const entry={requestKey,category:'vitals',status:'completed',title:'QA vitals',
    details:{temperature:'38.5'}};
  const responses=await Promise.all([post(entry),post(entry)]);
  assert.deepEqual(responses.map(x=>x.response.status).sort((a,b)=>a-b),[200,201],
    JSON.stringify(responses.map(x=>x.payload)));
  assert.equal(responses[0].data.id,responses[1].data.id);
  assert.deepEqual(responses.map(x=>x.response.headers.get('Idempotency-Replayed')).sort(),
    ['false','true']);
  assert.equal((await post({...entry,title:'Different vitals'})).response.status,409);
  const samples=await h.prisma.$queryRawUnsafe<Array<{total:number}>>(`
    SELECT count(*)::int AS total FROM public."CareMeasurement"
    WHERE "tenantId"=$1 AND "metadata"->>'sourceObservationId'=$2
  `,h.tenant.id,responses[0].data.id);
  assert.equal(samples[0]?.total,1,'concurrent retries must produce one temperature sample');
  const observations=await h.prisma.$queryRawUnsafe<Array<{total:number}>>(`
    SELECT count(*)::int AS total FROM public."CareHospitalObservation"
    WHERE "tenantId"=$1 AND "hospitalizationId"=$2
  `,h.tenant.id,hospitalizationId);
  assert.equal(observations[0]?.total,1);

  const medication={requestKey:randomUUID(),category:'medication',status:'completed',
    title:'QA manual administration',details:{medication:'QA saline',dose:'QA 1 ml'}};
  const first=await post(medication);
  assert.equal(first.response.status,201);
  assert.equal((await post(medication)).data.id,first.data.id);
  const discharge=await h.request(
    '/verticals/veterinary/hospitalizations/'+hospitalizationId+'/status',{
      method:'PATCH',body:JSON.stringify({status:'discharged'})
    });
  assert.equal(discharge.response.status,200);
  const retryAfterDischarge=await post(medication);
  assert.equal(retryAfterDischarge.response.status,200);
  assert.equal(retryAfterDischarge.data.id,first.data.id);
  assert.equal((await post({...medication,requestKey:randomUUID()})).response.status,409,
    'no new administration can be recorded after discharge');
});
