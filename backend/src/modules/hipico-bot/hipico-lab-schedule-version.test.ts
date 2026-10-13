import test from 'node:test';
import assert from 'node:assert/strict';
import {versionLabScheduleSnapshot} from './hipico-lab-schedule-version.js';

const meeting='22222222-2222-4222-8222-222222222222';
const row=(id:string,number:number,other:Record<string,unknown>={})=>({
  id,meetingId:meeting,number,state:'ANNOUNCED',stateVersion:1,
  scheduledAt:new Date('2026-10-13T18:00:00Z'),
  updatedAt:new Date('2026-10-12T14:00:00Z'),
  name:'PRIVATE HORSE',resultData:{bet:'SECRET',amount:5000},
  ...other
});

test('whole meeting fingerprint is stable under reordering and excludes personal/financial fields',()=>{
  const a=versionLabScheduleSnapshot(meeting,[row('r2',2),row('r1',1)]);
  const b=versionLabScheduleSnapshot(meeting,[row('r1',1,{name:'Other private name',resultData:{amount:999}}),row('r2',2)]);
  assert.deepEqual(a,b);
  assert.match(a!.revisionToken,/^[a-f0-9]{64}$/);
  assert.equal(a!.version,2);
  assert.equal(a!.updatedAt,'2026-10-12T14:00:00.000Z');
  assert.doesNotMatch(JSON.stringify(a),/SECRET|PRIVATE HORSE|999/);
});

test('even a non-displayed race change invalidates next/active/program schedule revision',()=>{
  const baseline=[row('r1',1),row('r2',2)];
  const digest=versionLabScheduleSnapshot(meeting,baseline)!.revisionToken;
  for(const changed of [
    [row('r1',1),row('r2',2,{stateVersion:2})],
    [row('r1',1),row('r2',2,{state:'OPEN'})],
    [row('r1',1),row('r2',2,{scheduledAt:new Date('2026-10-13T19:00:00Z')})],
    [row('r1',1),row('r2',2),row('r3',3)],
    [row('r1',1)],
    [row('r1',1),row('r2',2,{updatedAt:new Date('2026-10-12T14:01:00Z')})]
  ])assert.notEqual(versionLabScheduleSnapshot(meeting,changed)!.revisionToken,digest);
});

test('invalid or truncated race snapshots cannot authorize a durable schedule receipt',()=>{
  const invalid=[
    [],Array.from({length:201},(_,i)=>row('r'+i,(i%99)+1)),
    [row('r1',1),row('r1',1)],
    [row('r1',1,{meetingId:'wrong'})],
    [row('r1',1,{stateVersion:-1})],
    [row('r1',1,{stateVersion:null})],
    [row('r1',1,{updatedAt:null})],
    [row('r1',1,{updatedAt:'not-a-date'})],
    [row('r1',1,{scheduledAt:'invalid'})]
  ];
  for(const rows of invalid)assert.equal(versionLabScheduleSnapshot(meeting,rows),null);
});

test('maximum state version never overflows the receipt version integer',()=>{
  assert.equal(versionLabScheduleSnapshot(meeting,[row('r1',1,{stateVersion:Number.MAX_SAFE_INTEGER})]),null);
});

test('schedule projector and RaceQueryService must reuse one DB list for data and revision',()=>{
  const fs=requireSafeRead();
  assert.match(fs,/store\.listRacesForLabSnapshot\(input\.ownerId,input\.groupKey,String\(meetings\[0\]\.id\)\)/);
  assert.match(fs,/versionLabScheduleSnapshot\(String\(meetings\[0\]\.id\),rows\)/);
  assert.match(fs,/query\.execute\(\{\.\.\.input,meetingId:String\(meetings\[0\]\.id\),text:QUERY_TEXT\[input\.purpose\]\},rows\)/);
});
function requireSafeRead(){
  // Use node:fs to verify the production wiring without loading Prisma.
  return requireSource();
}
import {readFileSync} from 'node:fs';
function requireSource(){return readFileSync(new URL('./hipico-lab-schedule-read.ts',import.meta.url),'utf8');}
