import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

test('Gym #789: session binds effective immutable program version + routine prescription',async(t)=>{
  assert.notEqual(String(process.env.NODE_ENV||'').toLowerCase(),'production');
  const h=await createRealBackendHarness();
  const id=randomUUID();
  let memberId='',routineId='',exerciseId='',secondExerciseId='',sessionId='',v1='',v2='';
  t.after(async()=>{
    await h.close().catch(()=>undefined);
    if(sessionId)await h.prisma.$executeRawUnsafe(
      'DELETE FROM public."GymWorkoutSession" WHERE "tenantId"=$1 AND "id"=$2',
      h.tenant.id,sessionId
    ).catch(()=>undefined);
    for(const programId of [v2,v1].filter(Boolean)){
      await h.prisma.$executeRawUnsafe(
        'DELETE FROM public."GymPeriodizationProgram" WHERE "tenantId"=$1 AND "id"=$2',
        h.tenant.id,programId
      ).catch(()=>undefined);
    }
    if(routineId)await h.prisma.$executeRawUnsafe(
      'DELETE FROM public."GymRoutine" WHERE "tenantId"=$1 AND "id"=$2',
      h.tenant.id,routineId
    ).catch(()=>undefined);
    for(const id of [exerciseId,secondExerciseId].filter(Boolean))await h.prisma.$executeRawUnsafe(
      'DELETE FROM public."GymExercise" WHERE "tenantId"=$1 AND "id"=$2',
      h.tenant.id,id
    ).catch(()=>undefined);
    if(memberId)await h.prisma.$executeRawUnsafe(
      'DELETE FROM public."GymMember" WHERE "tenantId"=$1 AND "id"=$2',
      h.tenant.id,memberId
    ).catch(()=>undefined);
  });
  const member=await h.ok('/verticals/gym/members',{method:'POST',body:JSON.stringify({
    memberCode:id,fullName:'QA 789 Program Member',status:'active',goals:[],emergencyContact:{}
  })});
  memberId=member.id;
  const exercise=await h.ok('/verticals/gym/exercises',{method:'POST',body:JSON.stringify({
    name:'QA 789 Exercise '+id,category:'strength',muscleGroup:'legs',active:true
  })});
  exerciseId=exercise.id;
  const secondary=await h.ok('/verticals/gym/exercises',{method:'POST',body:JSON.stringify({
    name:'QA 789 Exercise '+id+' secondary',category:'strength',muscleGroup:'legs',active:true
  })});
  secondExerciseId=secondary.id;
  const search=encodeURIComponent('QA 789 Exercise '+id);
  const firstPage=await h.request('/verticals/gym/exercises?q='+search+'&take=1');
  assert.equal(firstPage.response.status,200);
  assert.equal(firstPage.response.headers.get('X-Pagination-Has-More'),'true');
  assert.equal(firstPage.response.headers.get('X-Pagination-Next-Skip'),'1');
  const secondPage=await h.request('/verticals/gym/exercises?q='+search+'&take=1&skip=1');
  assert.equal(secondPage.response.status,200);
  assert.equal(secondPage.response.headers.get('X-Pagination-Has-More'),'false');
  assert.equal(secondPage.response.headers.get('X-Pagination-Next-Skip'),null);
  assert.deepEqual(new Set([firstPage.data[0].id,secondPage.data[0].id]),
    new Set([exerciseId,secondExerciseId]));
  await h.status('/verticals/gym/exercises?take=0',422);
  await h.status('/verticals/gym/exercises?skip=-1',422);
  const routine=await h.ok('/verticals/gym/routines',{method:'POST',body:JSON.stringify({
    memberId,name:'QA 789 Routine '+id,trainingMode:'strength',daysPerWeek:1,
    exercises:[{exerciseId,exerciseName:exercise.name,dayOfWeek:1,sortOrder:1,sets:3,reps:'8'}]
  })});
  routineId=routine.id;
  const structure1={phases:[{name:'Preparación',kind:'accumulation',weeks:[{
    weekType:'load',volumePct:100,intensityPct:100
  }]}]};
  const structure2={phases:[{name:'Adaptación',kind:'deload',weeks:[{
    weekType:'deload',volumePct:65,intensityPct:70
  }]}]};
  const create=(name:string,structure:unknown)=>({routineId,name,startsAt:'2020-01-01',structure});
  const first=await h.ok('/verticals/gym/periodization/programs',{
    method:'POST',body:JSON.stringify(create('QA v1 '+id,structure1))
  });
  v1=first.id;
  const started=await h.ok('/verticals/gym/workout-sessions',{
    method:'POST',body:JSON.stringify({routineId,notes:'QA snapshot'})
  });
  sessionId=started.id;
  assert.equal(started.programVersionId,v1);
  assert.equal(started.programSnapshot.version,1);
  assert.deepEqual(started.programSnapshot.structure,structure1);
  assert.equal(started.routineSnapshot.length,1);
  assert.equal(started.routineSnapshot[0].exerciseId,exerciseId);
  const second=await h.ok('/verticals/gym/periodization/programs/'+v1+'/version',{
    method:'POST',body:JSON.stringify(create('QA v2 '+id,structure2))
  });
  v2=second.id;
  assert.equal(second.version,2);
  const sessions=await h.ok('/verticals/gym/workout-sessions?memberId='+encodeURIComponent(memberId));
  const historical=sessions.find((row:any)=>row.id===sessionId);
  assert.equal(historical.programVersionId,v1);
  assert.equal(historical.programSnapshot.version,1);
  assert.deepEqual(historical.programSnapshot.structure,structure1);
  const foreign=await h.status('/verticals/gym/workout-sessions?memberId='+randomUUID(),404);
  assert.equal(foreign.response.status,404);
});
