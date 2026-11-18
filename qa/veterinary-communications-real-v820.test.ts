import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

test('#820 vet communication log binds animal and appointment to the same tenant and patient',async(t)=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production');
  assert.ok(!process.env.VERCEL&&!process.env.VERCEL_ENV,'No deployment database for veterinary QA');
  const h=await createRealBackendHarness();
  const patients:string[]=[];
  const appointmentIds:string[]=[];
  let foreignTenantId='',foreignPatientId='';
  t.after(async()=>{
    for(const patientId of patients){
      await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CareCommunicationLog" WHERE "tenantId"=$1 AND "patientId"=$2',
        h.tenant.id,patientId
      ).catch(()=>undefined);
    }
    for(const appointmentId of appointmentIds){
      await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CareAppointment" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,appointmentId
      ).catch(()=>undefined);
    }
    for(const patientId of patients){
      await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,patientId
      ).catch(()=>undefined);
    }
    if(foreignPatientId)await h.prisma.$executeRawUnsafe(
      'DELETE FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',
      foreignTenantId,foreignPatientId
    ).catch(()=>undefined);
    if(foreignTenantId)await h.prisma.tenant.deleteMany({where:{id:foreignTenantId}}).catch(()=>undefined);
    await h.close();
  });
  const createAnimal=async()=>h.ok('/verticals/health/patients',{
    method:'POST',body:JSON.stringify({
      kind:'animal',displayName:'QA vet communication '+randomUUID(),
      active:true,emergencyContact:{}
    })
  });
  const pet=await createAnimal(),otherPet=await createAnimal();
  patients.push(pet.id,otherPet.id);
  const appointment=await h.ok('/verticals/health/appointments',{
    method:'POST',body:JSON.stringify({
      patientId:pet.id,startsAt:'2026-12-01T15:00:00.000Z',
      endsAt:'2026-12-01T15:30:00.000Z',
      type:'consultation',status:'scheduled',reason:'QA reminder',
      channel:'onsite'
    })
  });
  appointmentIds.push(appointment.id);
  const body={
    patientId:pet.id,appointmentId:appointment.id,channel:'whatsapp',
    event:'appointment_reminder',recipient:'+580000000000',
    status:'queued',payload:{deliveryMode:'manual_launch',deliveryConfirmed:false}
  };
  const post=(data:unknown)=>h.request('/verticals/veterinary/communications',{
    method:'POST',body:JSON.stringify(data)
  });
  const accepted=await post(body);
  assert.equal(accepted.response.status,201,JSON.stringify(accepted.payload));
  assert.equal(accepted.data.patientId,pet.id);
  assert.equal(accepted.data.appointmentId,appointment.id);
  assert.equal(accepted.data.status,'queued');
  assert.equal(accepted.data.sentAt,null);
  const mismatch=await post({...body,patientId:otherPet.id});
  assert.equal(mismatch.response.status,409);
  const unknownPet=await post({...body,patientId:randomUUID()});
  assert.equal(unknownPet.response.status,422);
  const unknownAppointment=await post({...body,appointmentId:randomUUID()});
  assert.equal(unknownAppointment.response.status,422);
  // When a caller supplies only the appointment, the server resolves its
  // patient from the tenant-scoped CareAppointment authority.
  const byAppointment=await post({...body,patientId:null});
  assert.equal(byAppointment.response.status,201);
  assert.equal(byAppointment.data.patientId,pet.id);

  const foreign=await h.prisma.tenant.create({
    data:{rif:'QA820-'+randomUUID().slice(0,8),name:'QA 820 Foreign Tenant'}
  });
  foreignTenantId=foreign.id;
  foreignPatientId=randomUUID();
  await h.prisma.$executeRawUnsafe(`
    INSERT INTO public."CarePatient"
      ("id","tenantId","kind","displayName","active","emergencyContact","createdAt","updatedAt")
    VALUES ($1,$2,'animal',$3,true,'{}'::jsonb,now(),now())
  `,foreignPatientId,foreignTenantId,'QA tenant B animal');
  const crossTenant=await post({...body,patientId:foreignPatientId,appointmentId:null});
  assert.equal(crossTenant.response.status,422);

  const rows=await h.ok('/verticals/veterinary/communications?patientId='+encodeURIComponent(pet.id));
  assert.equal(rows.length,2,'rejected references must not persist communications');
  assert.ok(rows.every((item:any)=>item.tenantId===h.tenant.id&&item.patientId===pet.id));
});
