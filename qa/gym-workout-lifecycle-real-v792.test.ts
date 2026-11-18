import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

test('Gym #792: pause/resume/abandon are atomic, replay-safe and audited',async(t)=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production');
  const h=await createRealBackendHarness();
  const run=randomUUID();
  let memberId='',routineId='',exerciseId='',alternativeExerciseId='';
  const sessions:string[]=[];
  t.after(async()=>{
    await h.close().catch(()=>undefined);
    for(const sessionId of sessions){
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymWorkoutSessionTransition" WHERE "tenantId"=$1 AND "sessionId"=$2',h.tenant.id,sessionId).catch(()=>undefined);
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymWorkoutSet" WHERE "tenantId"=$1 AND "sessionId"=$2',h.tenant.id,sessionId).catch(()=>undefined);
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymWorkoutSession" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,sessionId).catch(()=>undefined);
    }
    if(routineId)await h.prisma.$executeRawUnsafe('DELETE FROM public."GymRoutine" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,routineId).catch(()=>undefined);
    for(const id of [exerciseId,alternativeExerciseId].filter(Boolean))
      await h.prisma.$executeRawUnsafe('DELETE FROM public."GymExercise" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,id).catch(()=>undefined);
    if(memberId)await h.prisma.$executeRawUnsafe('DELETE FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2',h.tenant.id,memberId).catch(()=>undefined);
  });
  const member=await h.ok('/verticals/gym/members',{method:'POST',body:JSON.stringify({
    memberCode:run,fullName:'QA 792 Member',status:'active',goals:[],emergencyContact:{}
  })});
  memberId=member.id;
  const exercise=await h.ok('/verticals/gym/exercises',{method:'POST',body:JSON.stringify({
    name:'QA 792 Exercise '+run,active:true
  })});
  exerciseId=exercise.id;
  const routine=await h.ok('/verticals/gym/routines',{method:'POST',body:JSON.stringify({
    memberId,name:'QA 792 Routine '+run,trainingMode:'strength',daysPerWeek:1,
    exercises:[{exerciseId,exerciseName:exercise.name,dayOfWeek:1,sortOrder:1,sets:1,reps:'8'}]
  })});
  routineId=routine.id;
  const start=()=>h.ok('/verticals/gym/workout-sessions',{
    method:'POST',body:JSON.stringify({routineId})
  });
  const first=await start();
  sessions.push(first.id);
  assert.equal(first.routineSnapshot[0].exerciseId,exerciseId);
  assert.equal(Object.hasOwn(first.routineSnapshot[0],'muscleGroup'),true);
  const alternative=await h.ok('/verticals/gym/exercises',{method:'POST',body:JSON.stringify({
    name:'QA 792 Edited Exercise '+run,active:true
  })});
  alternativeExerciseId=alternative.id;
  const prescribedId=first.routineSnapshot[0].id;
  try{
    const changed=await h.prisma.$executeRawUnsafe(
      'UPDATE public."GymRoutineExercise" SET "exerciseId"=$3 WHERE "tenantId"=$1 AND "id"=$2',
      h.tenant.id,prescribedId,alternativeExerciseId
    );
    assert.equal(changed,1);
    await h.status('/verticals/gym/workout-sessions/'+first.id+'/sets',409,{
      method:'POST',body:JSON.stringify({
        routineExerciseId:prescribedId,setNumber:1,status:'completed',reps:8
      })
    });
  }finally{
    await h.prisma.$executeRawUnsafe(
      'UPDATE public."GymRoutineExercise" SET "exerciseId"=$3 WHERE "tenantId"=$1 AND "id"=$2',
      h.tenant.id,prescribedId,exerciseId
    );
  }
  const validSet=await h.ok('/verticals/gym/workout-sessions/'+first.id+'/sets',{
    method:'POST',body:JSON.stringify({
      routineExerciseId:prescribedId,setNumber:1,status:'completed',reps:8
    })
  });
  assert.equal(validSet.replayed,false);
  const path='/verticals/gym/workout-sessions/'+first.id;
  const change=(action:string,eventKey=randomUUID(),reason:string|null=null)=>h.request(path+'/transition',{
    method:'POST',body:JSON.stringify({action,eventKey,reason})
  });
  const key=randomUUID();
  const paused=await change('pause',key);
  assert.equal(paused.response.status,201);
  assert.equal(paused.data.session.status,'paused');
  assert.equal(paused.data.transition.actorId,h.admin.id);
  const replay=await change('pause',key);
  assert.equal(replay.response.status,200);
  assert.equal(replay.data.replayed,true);
  assert.equal(replay.data.transition.actorId,h.admin.id);
  assert.equal(replay.data.transition.toStatus,'paused');
  const conflict=await change('resume',key);
  assert.equal(conflict.response.status,409);
  await h.status('/verticals/gym/workout-sessions',409,{
    method:'POST',body:JSON.stringify({routineId})
  });
  await h.status(path+'/sets',409,{method:'POST',body:JSON.stringify({
    routineExerciseId:first.routineSnapshot[0].id,setNumber:1,status:'completed',reps:8
  })});
  const resumed=await change('resume');
  assert.equal(resumed.data.session.status,'in_progress');
  const pauseAgain=await change('pause');
  assert.equal(pauseAgain.data.session.status,'paused');
  const abandoned=await change('abandon',randomUUID(),'Cambio de programa autorizado');
  assert.equal(abandoned.data.session.status,'abandoned');
  const transitions=await h.ok(path+'/transitions');
  assert.deepEqual(transitions.map((e:any)=>e.action),['pause','resume','pause','abandon']);
  assert.equal(transitions[3].reason,'Cambio de programa autorizado');
  const denied=await change('resume');
  assert.equal(denied.response.status,409);
  const next=await start();
  sessions.push(next.id);
  assert.equal(next.status,'in_progress','abandoned does not block a new workout');
  await h.status('/verticals/gym/workout-sessions/'+randomUUID()+'/transitions',404);
});
