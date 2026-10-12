import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseExplicitLabMeeting} from './hipico-lab-meeting-selection.js';
import {readScopedLabSchedule} from './hipico-lab-schedule-read.js';

const ownerId='11111111-1111-4111-8111-111111111111';
const groupKey='club-hipico-triple-crown-official';
const selected={id:'22222222-2222-4222-8222-222222222222'};
const other={id:'33333333-3333-4333-8333-333333333333'};
const clock=Date.parse('2026-10-12T12:00:00Z');
function fixture(matches:Array<{id:string}>,ordinary:Array<{id:string}>=[selected,other]){
  const calls:Array<{method:string;ownerId:string;groupKey:string;meetingDate?:string;venue?:string|null;meetingId?:string|null}>=[];
  const store={
    async listMeetings(owner:string,group:string){
      calls.push({method:'listMeetings',ownerId:owner,groupKey:group});
      return ordinary.slice(0,2);
    },
    async findMeetingsForLabQuery(owner:string,group:string,meetingDate:string,venue:string|null){
      calls.push({method:'findMeetingsForLabQuery',ownerId:owner,groupKey:group,meetingDate,venue});
      return matches.slice(0,2);
    },
    async listRaces(owner:string,group:string,meetingId?:string|null){
      calls.push({method:'listRaces',ownerId:owner,groupKey:group,meetingId});
      if(meetingId!==selected.id)return [];
      return [{id:'r-1',meetingId:selected.id,number:1,state:'ANNOUNCED',
        stateVersion:2,updatedAt:new Date('2026-10-12T12:00:00Z'),
        scheduledAt:new Date('2026-10-12T17:00:00Z'),
        resultData:{bet:{amount:1000},counterparty:'SECRET'}}];
    },
    async getMeeting(){return null;}
  };
  return{store:store as any,calls};
}

test('parser recognizes meeting date alone and exact venue with or without hipódromo prefix',()=>{
  assert.deepEqual(parseExplicitLabMeeting('¿Qué carrera sigue en la reunión del 2026-10-12?'),
    {kind:'explicit',meetingDate:'2026-10-12',venue:null});
  assert.deepEqual(parseExplicitLabMeeting('¿Cuál es la próxima carrera en la reunión del 2026-10-12 en La Rinconada?'),
    {kind:'explicit',meetingDate:'2026-10-12',venue:'La Rinconada'});
  assert.deepEqual(parseExplicitLabMeeting('¿Cartelera de la reunión del 2026-10-12 en el hipódromo La Rinconada?'),
    {kind:'explicit',meetingDate:'2026-10-12',venue:'La Rinconada'});
  assert.deepEqual(parseExplicitLabMeeting('¿Carrera activa de la reunión del 2026-10-12 en Otro Hipódromo?'),
    {kind:'explicit',meetingDate:'2026-10-12',venue:'Otro Hipódromo'});
  assert.deepEqual(parseExplicitLabMeeting('¿Qué carrera sigue?'),{kind:'absent'});
});

test('explicit malformed date, unsafe suffix and ambiguous venue never fall back to latest',()=>{
  for(const text of [
    '¿Próxima carrera de la reunión del 2026-02-30?',
    '¿Cartelera de la reunión del 2026-13-01?',
    '¿Cartelera de la reunión del 2026-10-12 de otra reunión?',
    '¿Cartelera de la reunión del 2026-10-12 en La Rinconada y otra sede?',
    '¿Cartelera de la reunión del 2026-10-12 en x?',
    '¿Cartelera de la reunión del NO-EXISTE?',
    '¿Qué carrera sigue en la reunión de hoy?'
  ])assert.equal(parseExplicitLabMeeting(text).kind,'invalid',text);
});

test('explicit meeting with unique match unlocks schedule without trusting client meeting IDs',async()=>{
  const f=fixture([selected]);
  const result=await readScopedLabSchedule({
    ownerId,groupKey,purpose:'next',
    text:'¿Próxima carrera de la reunión del 2026-10-12 en La Rinconada?'
  },f.store,clock);
  assert.equal(result.available,true);
  assert.equal(result.reason,'CANONICAL_NEXT_RACE');
  assert.deepEqual(f.calls.map(x=>x.method),['findMeetingsForLabQuery','listRaces']);
  assert.deepEqual(f.calls[0],{
    method:'findMeetingsForLabQuery',ownerId,groupKey,
    meetingDate:'2026-10-12',venue:'La Rinconada'
  });
  assert.equal(f.calls[1].meetingId,selected.id);
  assert.doesNotMatch(JSON.stringify(result),/SECRET|1000|counterparty/);
});

test('two matching meetings remain ambiguous and do not reach race data, including date-only selection',async()=>{
  const f=fixture([selected,other]);
  const result=await readScopedLabSchedule({
    ownerId,groupKey,purpose:'schedule',
    text:'¿Cartelera de la reunión del 2026-10-12?'
  },f.store,clock);
  assert.equal(result.available,false);
  assert.equal(result.reason,'CANONICAL_MEETING_AMBIGUOUS');
  assert.deepEqual(f.calls.map(x=>x.method),['findMeetingsForLabQuery']);
});

test('explicit missing meeting cannot silently fall back to the sole/default meeting',async()=>{
  const f=fixture([],[selected]);
  const result=await readScopedLabSchedule({
    ownerId,groupKey,purpose:'active',
    text:'¿Carrera activa de la reunión del 2026-10-12 en Otro Hipódromo?'
  },f.store,clock);
  assert.equal(result.available,false);
  assert.equal(result.reason,'CANONICAL_MEETING_NOT_FOUND');
  assert.equal(f.calls.length,1);
});

test('invalid explicit meeting is rejected before any read regardless of cached default',async()=>{
  const f=fixture([selected],[selected]);
  const result=await readScopedLabSchedule({
    ownerId,groupKey,purpose:'schedule',
    text:'¿Cartelera de la reunión del 2026-02-30?'
  },f.store,clock);
  assert.equal(result.available,false);
  assert.equal(result.reason,'CANONICAL_MEETING_SELECTOR_INVALID');
  assert.equal(f.calls.length,0);
});

test('tenant-scoped store query uses bound parameters and bounded LIMIT 2 without writes',()=>{
  const store=readFileSync(new URL('../hipico/race.store.ts',import.meta.url),'utf8');
  const start=store.indexOf('async findMeetingsForLabQuery(');
  const end=store.indexOf('async getMeeting(',start);
  const read=store.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.match(read,/scope\(ownerId,groupKey\)/);
  assert.match(read,/owner_id=\$\{ownerId\}::uuid AND group_key=\$\{groupKey\}/);
  assert.match(read,/meeting_date::date=\$\{meetingDate\}::date/);
  assert.match(read,/LOWER\(TRIM\(venue\)\)/);
  assert.match(read,/LIMIT 2/);
  assert.doesNotMatch(read,/INSERT INTO|UPDATE\s+public|DELETE FROM|executeRaw/);
});

test('route derives meeting exclusively from sanitized user text and backend owner/group',()=>{
  const route=readFileSync(new URL('./hipico-bridge.routes.ts',import.meta.url),'utf8');
  const start=route.indexOf("router.post('/bridge/lab/query'");
  const end=route.indexOf("router.post('/bridge/events'",start);
  const code=route.slice(start,end);
  assert.match(code,/text:assessment\.sanitizedText/);
  assert.match(code,/ownerId,groupKey:OFFICIAL_SOURCE_CHANNEL_KEY/);
  assert.match(code,/validateBridgeGroupIdentity\(input\)/);
  assert.doesNotMatch(code,/input\.meetingId|input\.ownerId|input\.groupKey/);
  assert.match(code,/isLabInformationRequest/);
});
