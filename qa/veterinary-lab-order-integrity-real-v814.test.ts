import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRealBackendHarness} from './support/real-backend-harness.ts';

test('#814 PG17 lab order: clinical references tenant/patient scoped and order+tests atomic',async t=>{
  const h=await createRealBackendHarness();
  const patients:string[]=[], professionals:string[]=[], encounters:string[]=[], orders:string[]=[];
  t.after(async()=>{
    try{
      for(const id of orders){
        await h.prisma.$executeRawUnsafe(
          'DELETE FROM public."CareLabResult" WHERE "tenantId"=$1 AND "labOrderId"=$2',
          h.tenant.id,id);
        await h.prisma.$executeRawUnsafe(
          'DELETE FROM public."CareLabOrder" WHERE "tenantId"=$1 AND "id"=$2',
          h.tenant.id,id);
      }
      for(const id of encounters)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CareEncounter" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,id);
      for(const id of professionals)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CareProfessional" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,id);
      for(const id of patients)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,id);
    }finally{await h.close();}
  });
  const run=randomUUID();
  const pet=async(label:string)=>{
    const item=await h.ok('/verticals/health/patients',{method:'POST',body:JSON.stringify({
      kind:'animal',displayName:'QA lab '+label+' '+run,species:'canine',
      active:true,emergencyContact:{}
    })});
    patients.push(item.id);return item;
  };
  const [a,b]=await Promise.all([pet('A'),pet('B')]);
  const pro=await h.ok('/verticals/health/professionals',{method:'POST',body:JSON.stringify({
    fullName:'QA lab professional '+run,specialty:'veterinary',status:'active',schedule:{}
  })});
  professionals.push(pro.id);
  const encounter=await h.ok('/verticals/health/encounters',{method:'POST',body:JSON.stringify({
    patientId:b.id,professionalId:pro.id,type:'consultation',specialty:'veterinary',
    status:'draft',clinicalData:{}
  })});
  encounters.push(encounter.id);

  const body={
    patientId:a.id,professionalId:pro.id,priority:'routine',fasting:false,
    notes:'QA order '+run,
    tests:[{testCode:'QA-GLU',testName:'QA glucose',unit:'mg/dL',referenceMin:60,referenceMax:150},
      {testCode:'QA-ALT',testName:'QA ALT',unit:'U/L'}]
  };
  const post=(patch:Record<string,unknown>={})=>h.request('/verticals/veterinary/lab-orders',{
    method:'POST',body:JSON.stringify({...body,...patch})
  });
  const wrongPatient=await post({encounterId:encounter.id});
  assert.equal(wrongPatient.response.status,422);
  const missingPro=await post({professionalId:randomUUID()});
  assert.equal(missingPro.response.status,422);
  const missingPatient=await post({patientId:randomUUID()});
  assert.equal(missingPatient.response.status,404);
  const invalidEncounter=await post({encounterId:randomUUID()});
  assert.equal(invalidEncounter.response.status,422);

  const result=await post();
  assert.equal(result.response.status,201,JSON.stringify(result.payload));
  orders.push(result.data.id);
  assert.equal(result.data.patientId,a.id);
  assert.equal(result.data.professionalId,pro.id);
  const linked=await h.prisma.$queryRawUnsafe<Array<{total:number}>>(`
    SELECT count(*)::int AS total FROM public."CareLabResult"
    WHERE "tenantId"=$1 AND "labOrderId"=$2
  `,h.tenant.id,result.data.id);
  assert.equal(linked[0]?.total,2,'both ordered tests must be persisted atomically');
  const phantom=await h.prisma.$queryRawUnsafe<Array<{total:number}>>(`
    SELECT count(*)::int AS total FROM public."CareLabOrder"
    WHERE "tenantId"=$1 AND "notes"=$2
  `,h.tenant.id,'QA order '+run);
  assert.equal(phantom[0]?.total,1,'invalid references must not leave phantom lab orders');
});
