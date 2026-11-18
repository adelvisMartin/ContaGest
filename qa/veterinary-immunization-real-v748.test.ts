import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

test('#748 PostgreSQL vaccine replay creates one record and rejects changed payload',async(t)=>{
 const h=await createRealBackendHarness();
 let patientId='';
 t.after(async()=>{
   if(patientId){
     await h.prisma.$executeRawUnsafe('DELETE FROM public."CareImmunization" WHERE "tenantId"=$1 AND "patientId"=$2',h.tenant.id,patientId).catch(()=>undefined);
     await h.prisma.$executeRawUnsafe('DELETE FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,patientId).catch(()=>undefined);
   }
   await h.close();
 });
 const patient=await h.ok('/verticals/health/patients',{
   method:'POST',body:JSON.stringify({kind:'animal',displayName:'QA vaccine '+randomUUID(),active:true,emergencyContact:{}})
 });
 patientId=patient.id;
 const requestKey=randomUUID();
 const data={patientId,requestKey,vaccine:'QA vacuna',dose:'1ml',
   administeredAt:'2026-11-17T15:00:00.000Z',nextDueAt:'2027-11-17T15:00:00.000Z'};
 const post=(payload:unknown)=>h.request('/verticals/health/immunizations',{
   method:'POST',body:JSON.stringify(payload)
 });
 const both=await Promise.all([post(data),post(data)]);
 assert.deepEqual(both.map(x=>x.response.status).sort(),[200,201]);
 assert.equal(both[0].data.id,both[1].data.id);
 assert.deepEqual(both.map(x=>x.response.headers.get('Idempotency-Replayed')).sort(),['false','true']);
 const changed=await post({...data,dose:'2ml'});
 assert.equal(changed.response.status,409);
 const invalidPatient=await post({...data,patientId:randomUUID(),requestKey:randomUUID()});
 assert.equal(invalidPatient.response.status,422);
 const rows=await h.prisma.$queryRawUnsafe<Array<{id:string}>>(
   'SELECT "id" FROM public."CareImmunization" WHERE "tenantId"=$1 AND "patientId"=$2',
   h.tenant.id,patientId
 );
 assert.equal(rows.length,1);
});
