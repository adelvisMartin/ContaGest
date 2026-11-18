import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRealBackendHarness} from './support/real-backend-harness.ts';

test('#824 PG17 ambulatory appointment retries are idempotent within one tenant',async t=>{
  const h=await createRealBackendHarness();
  const tag=randomUUID();
  let patientId='';
  const appointmentIds=new Set<string>();
  t.after(async()=>{
    try{
      for(const id of appointmentIds)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CareAppointment" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,id);
      if(patientId)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,patientId);
    }finally{await h.close();}
  });
  const patient=await h.ok('/verticals/health/patients',{
    method:'POST',body:JSON.stringify({
      kind:'human',displayName:'QA ambulatory replay '+tag,active:true,
      emergencyContact:{}
    })
  });
  patientId=patient.id;
  const startsAt=new Date(Date.now()+7*86400000).toISOString();
  const endsAt=new Date(new Date(startsAt).getTime()+3600000).toISOString();
  const requestKey=randomUUID();
  const appointment={
    patientId,startsAt,endsAt,type:'consultation',status:'scheduled',
    reason:'QA retry '+tag,channel:'onsite',room:'QA room '+tag,requestKey
  };
  const post=(body:unknown)=>h.request('/verticals/health/appointments',{
    method:'POST',body:JSON.stringify(body)
  });
  const replies=await Promise.all([post(appointment),post(appointment)]);
  for(const reply of replies)if(reply.response.status===201&&reply.data?.id)
    appointmentIds.add(reply.data.id);
  assert.deepEqual(replies.map(r=>r.response.status).sort((a,b)=>a-b),[200,201],
    JSON.stringify(replies.map(r=>r.payload)));
  assert.equal(replies[0].data.id,replies[1].data.id);
  assert.deepEqual(replies.map(r=>r.data.replayed).sort(),[false,true]);
  const altered=await post({...appointment,reason:'Different clinical request'});
  assert.equal(altered.response.status,409,'same key may not assert different content');
  const changedType=await post({...appointment,type:'veterinary-consultation'});
  assert.equal(changedType.response.status,409,'same key may not be reused for another appointment type');
  const rows=await h.prisma.$queryRawUnsafe<Array<{id:string}>>(`
    SELECT "id" FROM public."CareAppointment"
    WHERE "tenantId"=$1 AND "patientId"=$2
  `,h.tenant.id,patientId);
  assert.deepEqual(rows.map(r=>r.id),[replies[0].data.id],
    'two concurrent retries must create exactly one appointment');
});
