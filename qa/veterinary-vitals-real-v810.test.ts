import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

test('#810 PostgreSQL: veterinary vitals replay respects original patient, timestamp and measured values',async(t)=>{
  const h=await createRealBackendHarness();
  let patientId='';
  t.after(async()=>{
    if(patientId){
      await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CareMeasurement" WHERE "tenantId"=$1 AND "patientId"=$2',
        h.tenant.id,patientId
      ).catch(()=>undefined);
      await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,patientId
      ).catch(()=>undefined);
    }
    await h.close();
  });

  const patient=await h.ok('/verticals/health/patients',{
    method:'POST',body:JSON.stringify({kind:'animal',displayName:'QA Vital '+randomUUID(),active:true,emergencyContact:{}})
  });
  patientId=patient.id;
  const batchId=randomUUID(),measuredAt='2026-11-16T12:00:00.000Z';
  const payload={
    patientId,batchId,measuredAt,
    measurements:[{kind:'weight',value:5.4,unit:'kg'},{kind:'heart_rate',value:82,unit:'lpm'}]
  };
  const url='/verticals/health/measurements/veterinary-vitals';
  const invoke=(data:unknown)=>h.request(url,{method:'POST',body:JSON.stringify(data)});
  const first=await invoke(payload);
  assert.equal(first.response.status,201,JSON.stringify(first.payload));
  assert.equal(first.response.headers.get('Idempotency-Replayed'),'false');
  const replay=await invoke(payload);
  assert.equal(replay.response.status,200,JSON.stringify(replay.payload));
  assert.equal(replay.response.headers.get('Idempotency-Replayed'),'true');
  assert.deepEqual(replay.data.measurements.map((row:any)=>row.id),first.data.measurements.map((row:any)=>row.id));
  const differentTimestamp=await invoke({...payload,measuredAt:'2026-11-16T12:01:00.000Z'});
  assert.equal(differentTimestamp.response.status,409,'same batch ID cannot change event time');
  const differentValue=await invoke({...payload,measurements:[{kind:'weight',value:6,unit:'kg'},{kind:'heart_rate',value:82,unit:'lpm'}]});
  assert.equal(differentValue.response.status,409,'same batch ID cannot change measured value');
  const invalidPatient=await invoke({...payload,patientId:randomUUID(),batchId:randomUUID()});
  assert.equal(invalidPatient.response.status,422,'unknown animal cannot receive clinical measurements');
  const rows=await h.prisma.$queryRawUnsafe<Array<{id:string;metadata:any}>>(
    'SELECT "id","metadata" FROM public."CareMeasurement" WHERE "tenantId"=$1 AND "patientId"=$2',
    h.tenant.id,patientId
  );
  assert.equal(rows.length,2,'replay must not duplicate durable vital records');
  assert.ok(rows.every(row=>row.metadata?.requestMeasuredAt===measuredAt));
});
