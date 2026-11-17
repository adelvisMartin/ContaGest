import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

test('Gym #793: metrics disclose formula and tenant-scoped measurement sources',async(t)=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production');
  const h=await createRealBackendHarness();
  const run=randomUUID();
  let memberId='';
  const assessmentIds:string[]=[];
  t.after(async()=>{
    await h.close().catch(()=>undefined);
    for(const assessmentId of assessmentIds){
      await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."GymAssessment" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,assessmentId
      ).catch(()=>undefined);
    }
    if(memberId)await h.prisma.$executeRawUnsafe(
      'DELETE FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2',
      h.tenant.id,memberId
    ).catch(()=>undefined);
  });
  const member=await h.ok('/verticals/gym/members',{method:'POST',body:JSON.stringify({
    memberCode:run,fullName:'QA 793 Body Progress',goals:['strength'],status:'active',
    emergencyContact:{}
  })});
  memberId=member.id;
  for(const weightKg of [80,79.5]){
    const assessment=await h.ok('/verticals/gym/assessments',{
      method:'POST',body:JSON.stringify({memberId,weightKg,heightCm:175,
        notes:'QA private clinical text must not appear in performance'})
    });
    assessmentIds.push(assessment.id);
  }
  const now=new Date(),day=(d:Date)=>d.toISOString().slice(0,10);
  const from=day(new Date(now.getTime()-86400000)),to=day(new Date(now.getTime()+86400000));
  const performance=await h.ok('/verticals/gym/performance?memberId='+encodeURIComponent(memberId)
    +'&from='+from+'&to='+to);
  assert.equal(performance.provenance.estimated1Rm.formula,'Epley');
  assert.equal(performance.provenance.timeZone,'UTC');
  assert.deepEqual(performance.goals.current,['strength']);
  assert.equal(performance.goals.historical,false);
  assert.equal(performance.measurements.items.length,2);
  assert.equal(performance.measurements.items[0].weightKg,80);
  assert.equal(performance.measurements.items[1].weightKg,79.5);
  assert.equal(performance.measurements.truncated,false);
  assert.ok(!JSON.stringify(performance).includes('QA private clinical text'));
  const unknown=await h.status('/verticals/gym/performance?memberId='+randomUUID(),404);
  assert.equal(unknown.response.status,404);
});
