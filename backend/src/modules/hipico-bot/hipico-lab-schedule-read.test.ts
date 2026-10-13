import assert from 'node:assert/strict';
import test from 'node:test';
import {readScopedLabSchedule} from './hipico-lab-schedule-read.js';

const ownerId='11111111-1111-4111-8111-111111111111';
const groupKey='club-hipico-triple-crown-official';
const at=Date.parse('2026-10-12T14:00:00Z');
const meeting={id:'22222222-2222-4222-8222-222222222222'};
const scoped=(races:any[],meetings:any[]=[meeting])=>{
  const calls:Array<{ownerId:string;groupKey:string;meetingId?:string|null}>=[];
  const store={
    async listMeetings(owner:string,group:string){
      calls.push({ownerId:owner,groupKey:group});
      return meetings;
    },
    async listRacesForLabSnapshot(owner:string,group:string,meetingId?:string|null){
      calls.push({ownerId:owner,groupKey:group,meetingId});
      return races.filter(race=>!meetingId||race.meetingId===meetingId).map((race)=>({
        stateVersion:race.stateVersion??2,updatedAt:race.updatedAt??new Date('2026-10-12T12:00:00Z'),...race
      }));
    },
    async getMeeting(_owner:string,_group:string,id:string){
      return meetings.find(x=>x.id===id)||null;
    }
  };
  return{store:store as any,calls};
};

test('next race is projected from scoped lifecycle store with no raw resultData or participants',async()=>{
  const fixture=scoped([
    {id:'r-1',meetingId:meeting.id,number:1,name:'private string',state:'ANNOUNCED',
      scheduledAt:new Date('2026-10-12T18:00:00Z'),resultData:{participant:'SECRET',amount:1000}},
    {id:'r-2',meetingId:meeting.id,number:2,state:'ANNOUNCED',
      scheduledAt:new Date('2026-10-12T20:00:00Z')}
  ]);
  const result=await readScopedLabSchedule({ownerId,groupKey,purpose:'next'},fixture.store,at);
  assert.equal(result.available,true);
  assert.equal(result.reason,'CANONICAL_NEXT_RACE');
  assert.match(result.text,/número 1/);
  assert.match(result.text,/2026-10-12T18:00:00/);
  assert.doesNotMatch(JSON.stringify(result),/SECRET|private string|1000|resultData|participant/);
  assert.equal(result.authority.sourceWriteAllowed,false);
  assert.equal(result.authority.officiality,'NOT_EXTERNALLY_VERIFIED');
  assert.deepEqual(fixture.calls.map(x=>x.groupKey),[groupKey,groupKey]);
  assert.equal(fixture.calls[1].meetingId,meeting.id);
});

test('multiple meetings fail closed BEFORE querying races, no newest-meeting guess',async()=>{
  const f=scoped([],[meeting,{id:'33333333-3333-4333-8333-333333333333'}]);
  const output=await readScopedLabSchedule({ownerId,groupKey,purpose:'next'},f.store,at);
  assert.equal(output.available,false);
  assert.equal(output.reason,'CANONICAL_MEETING_AMBIGUOUS');
  assert.equal(f.calls.length,1);
});

test('stale or unverified schedule never claims next active race',async()=>{
  for(const scheduledAt of [new Date('2026-10-11T19:00:00Z'),null,'not-a-date']){
    const f=scoped([{id:'r-1',meetingId:meeting.id,number:1,state:'ANNOUNCED',scheduledAt}]);
    const result=await readScopedLabSchedule({ownerId,groupKey,purpose:'next'},f.store,at);
    assert.equal(result.available,false);
    assert.equal(result.reason,scheduledAt==='not-a-date'
      ?'CANONICAL_SCHEDULE_REVISION_UNAVAILABLE':'CANONICAL_SCHEDULE_STALE');
  }
});

test('active result uses only internal state and no real-time officiality claims',async()=>{
  const f=scoped([{id:'r-1',meetingId:meeting.id,number:5,state:'RUNNING',
    resultStage:'provisional',scheduledAt:new Date('2026-10-12T15:00:00Z'),
    resultData:{board:['SECRET'],odds:30,bet:{amount:999}}
  }]);
  const result=await readScopedLabSchedule({ownerId,groupKey,purpose:'active'},f.store,at);
  assert.equal(result.available,true);
  assert.equal(result.reason,'CANONICAL_ACTIVE_RACE');
  assert.match(result.text,/estado interno RUNNING/);
  assert.match(result.text,/no certifica/i);
  assert.doesNotMatch(JSON.stringify(result),/SECRET|999|30|board|odds/);
});

test('future schedule is sorted, bounded and omits invalid, past or private entries',async()=>{
  const races=[
    {id:'r-3',meetingId:meeting.id,number:3,state:'ANNOUNCED',scheduledAt:new Date('2026-10-12T21:00:00Z'),resultData:{payout:123}},
    {id:'r-2',meetingId:meeting.id,number:2,state:'ANNOUNCED',scheduledAt:new Date('2026-10-12T20:00:00Z')},
    {id:'r-old',meetingId:meeting.id,number:1,state:'ANNOUNCED',scheduledAt:new Date('2026-10-11T20:00:00Z')},
    {id:'r-unknown',meetingId:meeting.id,number:9,state:'UNKNOWN',scheduledAt:new Date('2026-10-12T22:00:00Z')},
  ];
  const f=scoped(races);
  const output=await readScopedLabSchedule({ownerId,groupKey,purpose:'schedule'},f.store,at);
  assert.equal(output.available,true);
  assert.equal(output.reason,'CANONICAL_SCHEDULE_FOUND');
  assert.ok(output.text.indexOf('Carrera 2')<output.text.indexOf('Carrera 3'));
  assert.doesNotMatch(output.text,/Carrera 1|Carrera 9|payout|123/);
});

test('missing meeting, invalid purpose and absent future program fail closed',async()=>{
  const f=scoped([],[]);
  assert.equal((await readScopedLabSchedule({ownerId,groupKey,purpose:'schedule'},f.store,at)).reason,'CANONICAL_MEETING_NOT_FOUND');
  assert.equal((await readScopedLabSchedule({ownerId,groupKey,purpose:'result' as any},f.store,at)).reason,'LAB_SCHEDULE_PURPOSE_INVALID');
  const p=scoped([]);
  assert.equal((await readScopedLabSchedule({ownerId,groupKey,purpose:'schedule'},p.store,at)).reason,'CANONICAL_SCHEDULE_NOT_FOUND');
});


test('verified schedule returns a stable fingerprint even for a race not shown in next answer',async()=>{
  const races=[
    {id:'r1',meetingId:meeting.id,number:1,state:'ANNOUNCED',stateVersion:1,
      scheduledAt:new Date('2026-10-12T18:00:00Z'),updatedAt:new Date('2026-10-12T12:00:00Z')},
    {id:'r2',meetingId:meeting.id,number:2,state:'ANNOUNCED',stateVersion:1,
      scheduledAt:new Date('2026-10-12T20:00:00Z'),updatedAt:new Date('2026-10-12T12:00:00Z')}
  ];
  const before=await readScopedLabSchedule({ownerId,groupKey,purpose:'next'},scoped(races).store,at);
  assert.equal(before.available,true);
  if(!('revisionToken' in before))throw new Error('LAB_SCHEDULE_REVISION_REQUIRED');
  assert.match(before.revisionToken,/^[a-f0-9]{64}$/);
  assert.equal(before.state,'NEXT_SNAPSHOT');
  assert.equal(before.version,2);
  races[1].stateVersion=2;
  const after=await readScopedLabSchedule({ownerId,groupKey,purpose:'next'},scoped(races).store,at);
  assert.equal(after.available,true);
  if(!('revisionToken' in after))throw new Error('LAB_SCHEDULE_REVISION_REQUIRED');
  assert.equal(after.text,before.text);
  assert.notEqual(after.revisionToken,before.revisionToken);
});

test('201-row truncation disables recovery and returns no partial program',async()=>{
  const races=Array.from({length:201},(_,i)=>({
    id:'r'+i,meetingId:meeting.id,number:i%99+1,state:'ANNOUNCED',stateVersion:1,
    scheduledAt:new Date('2026-10-12T18:00:00Z'),
    updatedAt:new Date('2026-10-12T12:00:00Z')
  }));
  const got=await readScopedLabSchedule({ownerId,groupKey,purpose:'schedule'},scoped(races).store,at);
  assert.equal(got.available,false);
  assert.equal(got.reason,'CANONICAL_SCHEDULE_REVISION_UNAVAILABLE');
  assert.doesNotMatch(got.text,/Carrera\s+1:/);
});
