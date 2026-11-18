import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRealBackendHarness} from './support/real-backend-harness.ts';

test('#816 real PG: concurrent admissions exclude a second animal from the same cage',async t=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production');
  assert.ok(!process.env.VERCEL&&!process.env.VERCEL_ENV,'Run only in a disposable QA database');
  const h=await createRealBackendHarness();
  const ids:string[]=[];
  const hospitalIds:string[]=[];
  t.after(async()=>{
    try {
      for(const id of hospitalIds)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CareHospitalization" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,id);
      for(const id of ids)await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,id);
    }finally{await h.close();}
  });
  const pet=async(name:string)=>{
    const item=await h.ok('/verticals/health/patients',{method:'POST',body:JSON.stringify({
      kind:'animal',displayName:'QA 816 '+name+' '+randomUUID(),species:'canine',
      active:true,emergencyContact:{}
    })});
    ids.push(item.id);return item;
  };
  const [a,b,c]=await Promise.all([pet('A'),pet('B'),pet('C')]);
  const request=(patientId:string,ward='Ward 1',cage='Cage 7')=>
    h.request('/verticals/veterinary/hospitalizations',{
      method:'POST',body:JSON.stringify({patientId,ward,cage,
        status:'admitted',reason:'QA inpatient observation',carePlan:{}})
    });
  const concurrent=await Promise.all([request(a.id),request(b.id)]);
  assert.deepEqual(concurrent.map(x=>x.response.status).sort((x,y)=>x-y),[201,409],
    JSON.stringify(concurrent.map(x=>x.payload)));
  const success=concurrent.find(x=>x.response.status===201)!;
  const denied=concurrent.find(x=>x.response.status===409)!;
  assert.ok(denied);
  const admitted=success.data;
  hospitalIds.push(admitted.id);
  const samePatient=await request(admitted.patientId,'Another Ward','Cage 1');
  assert.equal(samePatient.response.status,409,'same patient cannot have two active admissions');
  const otherPatient=admitted.patientId===a.id?b.id:a.id;
  const blocked=await request(otherPatient,' ward 1 ',' CAGE 7 ');
  assert.equal(blocked.response.status,409,'normalization cannot bypass occupied cage');
  await h.status('/verticals/veterinary/hospitalizations',422,{
    method:'POST',body:JSON.stringify({patientId:c.id,ward:'Ward 1',
      reason:'No cage assigned',carePlan:{}})
  });
  await h.status('/verticals/veterinary/hospitalizations',422,{
    method:'POST',body:JSON.stringify({patientId:c.id,ward:'Ward 1',cage:'Cage 3',
      status:'discharged',reason:'Invalid initial status',carePlan:{}})
  });

  const endpoint='/verticals/veterinary/hospitalizations/'+admitted.id+'/status';
  const change=(status:string,other:Record<string,unknown>={})=>
    h.request(endpoint,{method:'PATCH',body:JSON.stringify({status,...other})});
  const observed=await change('observed');
  assert.equal(observed.response.status,200);
  assert.equal(observed.data.status,'observed');
  assert.equal((await change('admitted')).response.status,409,'observed cannot reopen admission');
  const discharged=await change('discharged');
  assert.equal(discharged.response.status,200);
  assert.equal(discharged.data.status,'discharged');
  const retry=await change('discharged',{diagnosis:'should not rewrite discharge'});
  assert.equal(retry.response.status,200,'same-state retry must be idempotent');
  assert.equal(retry.data.diagnosis,discharged.data.diagnosis);
  assert.equal((await change('observed')).response.status,409,'discharged cannot reactivate');
  const freed=await request(otherPatient,'Ward 1','Cage 7');
  assert.equal(freed.response.status,201,'terminal discharge frees the bed');
  hospitalIds.push(freed.data.id);
  const cancel=await h.request('/verticals/veterinary/hospitalizations/'+freed.data.id+'/status',{
    method:'PATCH',body:JSON.stringify({status:'cancelled'})
  });
  assert.equal(cancel.response.status,200);
  const reopened=await request(otherPatient,'Ward 1','Cage 7');
  assert.equal(reopened.response.status,201,
    'a cancelled admission no longer occupies a cage');
  hospitalIds.push(reopened.data.id);
  const latest=await h.ok('/verticals/veterinary/hospitalizations?patientId='+otherPatient);
  assert.ok(latest.some((record:any)=>record.id===reopened.data.id&&record.status==='admitted'));
});
