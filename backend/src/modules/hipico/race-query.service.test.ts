import assert from 'node:assert/strict';
import test from 'node:test';
import { RaceQueryService, formatRaceQueryResponse } from './race-query.service.js';

function fakeStore(races:any[], meetings:any[]=[]){
  return {
    async listRaces(_ownerId:string,_groupKey:string,meetingId?:string|null){
      return meetingId ? races.filter((race)=>race.meetingId===meetingId) : races;
    },
    async listMeetings(){ return meetings; },
    async getMeeting(_ownerId:string,_groupKey:string,id:string){ return meetings.find((meeting)=>meeting.id===id)||null; }
  };
}

const scope={ownerId:'11111111-1111-4111-8111-111111111111',groupKey:'official-group'};

test('canonical query service selects the next race deterministically and formats only persisted data',async()=>{
  const service=new RaceQueryService(fakeStore([
    {id:'r2',meetingId:'m1',number:2,name:'Segunda',scheduledAt:'2026-09-24T20:00:00.000Z',state:'ANNOUNCED',resultStage:'none'},
    {id:'r1',meetingId:'m1',number:1,name:'Primera',scheduledAt:'2026-09-24T19:00:00.000Z',state:'ANNOUNCED',resultStage:'none'}
  ]) as any);
  const result=await service.execute({...scope,text:'¿Cuál es la próxima carrera?'});
  assert.equal(result.intent,'NEXT_RACE');
  assert.equal((result.answer as any).id,'r1');
  const text=formatRaceQueryResponse(result);
  assert.match(text,/1ª carrera/);
  assert.match(text,/Primera/);
  assert.match(text,/2026-09-24T19:00:00Z/);
});

test('ambiguous active race context fails closed instead of guessing',async()=>{
  const service=new RaceQueryService(fakeStore([
    {id:'r1',meetingId:'m1',number:1,name:'Primera',state:'OPEN',resultStage:'none'},
    {id:'r2',meetingId:'m1',number:2,name:'Segunda',state:'RUNNING',resultStage:'none'}
  ]) as any);
  await assert.rejects(
    ()=>service.execute({...scope,text:'¿Cuál es la carrera activa?'}),
    (error:any)=>error?.code==='RACE_QUERY_AMBIGUOUS'
  );
});

test('result response is explicit about verification stage and never promotes provisional data to official',async()=>{
  const service=new RaceQueryService(fakeStore([
    {id:'r1',meetingId:'m1',number:1,name:'Primera',state:'PROVISIONAL_RESULT',resultStage:'provisional',resultData:{arrival:['5','3','1']}}
  ]) as any);
  const result=await service.execute({...scope,text:'último resultado'});
  const text=formatRaceQueryResponse(result);
  assert.match(text,/provisional/);
  assert.match(text,/5-3-1/);
  assert.doesNotMatch(text,/marcado como oficial/i);
});

test('missing scratches evidence produces a bounded factual fallback instead of invented runners',async()=>{
  const service=new RaceQueryService(fakeStore([
    {id:'r1',meetingId:'m1',number:1,name:'Primera',state:'OPEN',resultStage:'none',resultData:{}}
  ]) as any);
  const result=await service.execute({...scope,text:'retirados'});
  assert.deepEqual(result.answer,{
    raceId:'r1',
    known:false,
    reason:'SCRATCHES_REQUIRE_CANONICAL_PROVIDER_OR_DOCUMENT_EVIDENCE'
  });
  assert.match(formatRaceQueryResponse(result),/No tengo retiros verificados/);
});
