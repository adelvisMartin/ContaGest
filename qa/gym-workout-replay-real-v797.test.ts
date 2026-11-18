import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

test('Gym #797 PostgreSQL: replay of a recorded set has one durable effect',async(t)=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production');
  const h=await createRealBackendHarness();
  const tag=randomUUID();
  let memberId='',routineId='',exerciseId='',sessionId='';
  t.after(async()=>{
    await h.close().catch(()=>undefined);
    if(sessionId){
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymWorkoutSet" WHERE "tenantId"=$1 AND "sessionId"=$2',h.tenant.id,sessionId).catch(()=>undefined);
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymWorkoutSession" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,sessionId).catch(()=>undefined);
    }
    if(routineId)await h.prisma.$executeRawUnsafe('DELETE FROM public."GymRoutineExercise" WHERE "tenantId"=$1 AND "routineId"=$2',h.tenant.id,routineId).catch(()=>undefined);
    if(routineId)await h.prisma.$executeRawUnsafe('DELETE FROM public."GymRoutine" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,routineId).catch(()=>undefined);
    if(exerciseId)await h.prisma.$executeRawUnsafe('DELETE FROM public."GymExercise" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,exerciseId).catch(()=>undefined);
    if(memberId)await h.prisma.$executeRawUnsafe('DELETE FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,memberId).catch(()=>undefined);
  });
  const member=await h.ok('/verticals/gym/members',{method:'POST',body:JSON.stringify({
    memberCode:tag,fullName:'QA 797 Offline Set',goals:[],status:'active',emergencyContact:{}
  })});
  memberId=member.id;
  const exercise=await h.ok('/verticals/gym/exercises',{method:'POST',body:JSON.stringify({
    name:'QA 797 Exercise '+tag,active:true
  })});
  exerciseId=exercise.id;
  const routine=await h.ok('/verticals/gym/routines',{method:'POST',body:JSON.stringify({
    memberId,name:'QA 797 Routine '+tag,trainingMode:'strength',daysPerWeek:1,
    exercises:[{exerciseId,exerciseName:exercise.name,dayOfWeek:1,sortOrder:1,sets:1,reps:'8'}]
  })});
  routineId=routine.id;
  const session=await h.ok('/verticals/gym/workout-sessions',{
    method:'POST',body:JSON.stringify({routineId})
  });
  sessionId=session.id;
  const routineExerciseId=session.routineSnapshot[0].id;
  const eventKey=randomUUID();
  const post=(setNumber:number,loadKg:number,key=eventKey)=>h.request(
    '/verticals/gym/workout-sessions/'+sessionId+'/sets',
    {method:'POST',body:JSON.stringify({
      routineExerciseId,setNumber,status:'completed',reps:8,loadKg,eventKey:key
    })}
  );
  const competing=await Promise.all([post(1,45),post(1,45)]);
  assert.deepEqual(competing.map(r=>r.response.status).sort(),[200,201]);
  assert.equal(competing[0].data.id,competing[1].data.id);
  assert.deepEqual(competing.map(r=>r.data.replayed).sort(),[false,true]);
  const mismatch=await post(2,45);
  assert.equal(mismatch.response.status,409,'same key different payload is forbidden');
  const saved=await h.prisma.$queryRawUnsafe<Array<{id:string;requestFingerprint:string}>>(
    'SELECT "id","requestFingerprint" FROM public."GymWorkoutSet" WHERE "tenantId"=$1 AND "sessionId"=$2',
    h.tenant.id,sessionId
  );
  assert.equal(saved.length,1);
  assert.match(saved[0].requestFingerprint,/^[0-9a-f]{64}$/);
  await h.ok('/verticals/gym/workout-sessions/'+sessionId+'/complete',{method:'POST',body:'{}'});
  const late=await post(1,45);
  assert.equal(late.response.status,200,'ack lost after session completion may be replayed');
  assert.equal(late.data.id,saved[0].id);
  const newEvent=await post(2,45,randomUUID());
  assert.equal(newEvent.response.status,409,'completed sessions reject new work');
  await h.status('/verticals/gym/workout-sessions/'+randomUUID()+'/sets',404,{
    method:'POST',body:JSON.stringify({routineExerciseId,setNumber:1,status:'completed',reps:8,eventKey:randomUUID()})
  });
});
