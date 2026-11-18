import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRealBackendHarness} from './support/real-backend-harness.ts';

test('#801 PostgreSQL: concurrent dental replay inserts one appointment',async(t)=>{
  const h=await createRealBackendHarness();
  const tag=randomUUID();
  let patientId='';
  const appointmentIds=new Set<string>();
  t.after(async()=>{
    try{
      for(const id of appointmentIds)
        await h.prisma.$executeRawUnsafe(
          'DELETE FROM public."CareAppointment" WHERE "tenantId"=$1 AND "id"=$2',
          h.tenant.id,id).catch(()=>undefined);
      if(patientId)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,patientId).catch(()=>undefined);
    }finally{await h.close();}
  });
  const patients=await h.prisma.$queryRawUnsafe<Array<{id:string}>>(
    "INSERT INTO public.\"CarePatient\" (\"tenantId\",\"kind\",\"displayName\") VALUES ($1,'human',$2) RETURNING \"id\"",
    h.tenant.id,'QA dental replay '+tag
  );
  patientId=patients[0].id;
  const start=new Date(Date.now()+4*86400000);
  const appointment={
    patientId,startsAt:start.toISOString(),endsAt:new Date(start.getTime()+3600000).toISOString(),
    type:'dentistry',room:'Sillón '+tag,status:'scheduled',
    channel:'onsite',requestKey:randomUUID()
  };
  const post=(body:any)=>h.request('/verticals/health/appointments',{
    method:'POST',body:JSON.stringify(body)
  });
  const replay=await Promise.all([post(appointment),post(appointment)]);
  assert.deepEqual(replay.map(x=>x.response.status).sort(),[200,201]);
  assert.equal(replay[0].data.id,replay[1].data.id);
  assert.deepEqual(replay.map(x=>x.data.replayed).sort(),[false,true]);
  appointmentIds.add(replay[0].data.id);
  assert.equal((await post({...appointment,room:'Otro sillón'})).response.status,409);
  assert.equal((await post({...appointment,requestKey:randomUUID()})).response.status,409);
  const counts=await h.prisma.$queryRawUnsafe<Array<{count:number}>>(
    'SELECT count(*)::int AS count FROM public."CareAppointment" WHERE "tenantId"=$1 AND "patientId"=$2',
    h.tenant.id,patientId
  );
  assert.equal(counts[0].count,1);
});
