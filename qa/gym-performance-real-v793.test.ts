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


// Historical adherence must not be rewritten when a coach edits the live routine.
test('Gym #793: adherence uses session snapshots and discloses legacy gaps',async(t)=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production');
  const h=await createRealBackendHarness();
  const run=randomUUID();
  let memberId='',exerciseId='',routineId='',sessionId='';
  t.after(async()=>{
    if(sessionId){
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymWorkoutSet" WHERE "tenantId"=$1 AND "sessionId"=$2',h.tenant.id,sessionId).catch(()=>undefined);
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymWorkoutSession" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,sessionId).catch(()=>undefined);
    }
    if(routineId){
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymRoutineExercise" WHERE "tenantId"=$1 AND "routineId"=$2',h.tenant.id,routineId).catch(()=>undefined);
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymRoutine" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,routineId).catch(()=>undefined);
    }
    if(exerciseId)await h.prisma.$executeRawUnsafe('DELETE FROM public."GymExercise" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,exerciseId).catch(()=>undefined);
    if(memberId)await h.prisma.$executeRawUnsafe('DELETE FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,memberId).catch(()=>undefined);
    await h.close().catch(()=>undefined);
  });
  memberId=(await h.ok('/verticals/gym/members',{method:'POST',body:JSON.stringify({
    memberCode:run,fullName:'QA 793 Historical Adherence',status:'active',goals:[],emergencyContact:{}
  })})).id;
  const exercise=await h.ok('/verticals/gym/exercises',{method:'POST',body:JSON.stringify({
    name:'QA 793 Adherence '+run,active:true
  })});
  exerciseId=exercise.id;
  const routine=await h.ok('/verticals/gym/routines',{method:'POST',body:JSON.stringify({
    memberId,name:'QA 793 Routine '+run,trainingMode:'strength',daysPerWeek:1,
    exercises:[{exerciseId,exerciseName:exercise.name,dayOfWeek:1,sortOrder:1,sets:3,reps:'8'}]
  })});
  routineId=routine.id;
  const session=await h.ok('/verticals/gym/workout-sessions',{
    method:'POST',body:JSON.stringify({routineId})
  });
  sessionId=session.id;
  assert.equal(session.routineSnapshot[0].sets,3);
  await h.ok('/verticals/gym/workout-sessions/'+sessionId+'/sets',{
    method:'POST',body:JSON.stringify({
      routineExerciseId:session.routineSnapshot[0].id,setNumber:1,
      status:'completed',reps:8,loadKg:40,eventKey:randomUUID()
    })
  });
  await h.ok('/verticals/gym/workout-sessions/'+sessionId+'/complete',{method:'POST',body:'{}'});
  const day=new Date().toISOString().slice(0,10);
  const uri='/verticals/gym/performance?memberId='+encodeURIComponent(memberId)+'&from='+day+'&to='+day;
  const before=await h.ok(uri);
  assert.equal(before.summary.plannedSets,3);
  assert.equal(before.summary.completedSets,1);
  assert.equal(before.summary.setAdherencePct,33.3);
  assert.equal(before.summary.unknownPlanSessions,0);
  await h.prisma.$executeRawUnsafe('UPDATE public."GymRoutineExercise" SET "sets"=8 WHERE "tenantId"=$1 AND "routineId"=$2',h.tenant.id,routineId);
  const after=await h.ok(uri);
  assert.equal(after.summary.plannedSets,3);
  assert.equal(after.summary.setAdherencePct,33.3);
  await h.prisma.$executeRawUnsafe('UPDATE public."GymWorkoutSession" SET "routineSnapshot"=\'[]\'::jsonb WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,sessionId);
  const legacy=await h.ok(uri);
  assert.equal(legacy.summary.plannedSets,0);
  assert.equal(legacy.summary.unknownPlanSessions,1);
  assert.equal(legacy.summary.setAdherencePct,null);
});
