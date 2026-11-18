import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRealBackendHarness} from './support/real-backend-harness.ts';

// All patient/hospitalization/observation records are created for this run
// and deleted in FK-safe order on the harness' isolated PostgreSQL database.
test('#816 observation must not outlive an active hospitalization or cross tenant',async t=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production');
  assert.ok(!process.env.VERCEL&&!process.env.VERCEL_ENV,'Shared production database forbidden');
  const h=await createRealBackendHarness();
  let patientId='',admissionId='';
  t.after(async()=>{
    try{
      if(admissionId){
        await h.prisma.$executeRawUnsafe(
          'DELETE FROM public."CareHospitalObservation" WHERE "tenantId"=$1 AND "hospitalizationId"=$2',
          h.tenant.id,admissionId);
        await h.prisma.$executeRawUnsafe(
          'DELETE FROM public."CareHospitalization" WHERE "tenantId"=$1 AND "id"=$2',
          h.tenant.id,admissionId);
      }
      if(patientId)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,patientId);
    }finally{await h.close();}
  });
  const pet=await h.ok('/verticals/health/patients',{
    method:'POST',body:JSON.stringify({kind:'animal',
      displayName:'QA 816 Inpatient '+randomUUID(),species:'canine',
      active:true,emergencyContact:{}})
  });
  patientId=pet.id;
  const admitted=await h.ok('/verticals/veterinary/hospitalizations',{
    method:'POST',body:JSON.stringify({
      patientId,status:'admitted',reason:'QA inpatient observation',carePlan:{}
    })
  });
  admissionId=admitted.id;
  const observe=(professionalId?:string)=>h.request('/verticals/veterinary/observations',{
    method:'POST',body:JSON.stringify({
      hospitalizationId:admissionId,professionalId:professionalId||undefined,
      type:'vitals',values:{temperature:38.5},note:'QA protected observation'
    })
  });
  const unknownProfessional=await observe(randomUUID());
  assert.equal(unknownProfessional.response.status,422,
    'unknown or foreign professional must not be linked to an observation');
  const accepted=await observe();
  assert.equal(accepted.response.status,201,JSON.stringify(accepted.payload));
  const observations=await h.ok('/verticals/veterinary/observations?hospitalizationId='+admissionId);
  assert.ok(observations.some((row:any)=>row.id===accepted.data.id));

  const closed=await h.request('/verticals/veterinary/hospitalizations/'+admissionId+'/status',{
    method:'PATCH',body:JSON.stringify({status:'discharged'})
  });
  assert.equal(closed.response.status,200,JSON.stringify(closed.payload));
  const rejected=await observe();
  assert.equal(rejected.response.status,404,'discharged patients reject new observations');
  const rows=await h.prisma.$queryRawUnsafe<Array<{total:number}>>(
    'SELECT count(*)::int AS total FROM public."CareHospitalObservation" WHERE "tenantId"=$1 AND "hospitalizationId"=$2',
    h.tenant.id,admissionId);
  assert.equal(rows[0]?.total,1,'terminal admission must not accept additional clinical entries');
});
