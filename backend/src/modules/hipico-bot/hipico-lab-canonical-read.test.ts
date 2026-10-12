import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readCanonicalLabRace} from './hipico-lab-canonical-read.js';

const race={raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'};
const input={ownerId:'11111111-1111-4111-8111-111111111111',groupKey:'club-hipico-triple-crown-official',race};

test('LAB read needs full explicit race context and validated calendar date',async()=>{
  let attempts=0;
  const reader=(async()=>{attempts++;return null;}) as any;
  assert.equal((await readCanonicalLabRace({...input,race:null},reader)).reason,'EXPLICIT_RACE_CONTEXT_REQUIRED');
  assert.equal((await readCanonicalLabRace({...input,race:{...race,raceDate:'2026-02-30'}},reader)).reason,'INVALID_RACE_CONTEXT');
  assert.equal(attempts,0);
});

test('canonical absence never invents entries or other operational facts',async()=>{
  const calls:any[]=[];
  const output=await readCanonicalLabRace(input,(async(args:any)=>{calls.push(args);return null;}) as any);
  assert.equal(output.available,false);
  assert.equal(output.reason,'CANONICAL_RACE_NOT_FOUND');
  assert.equal(output.authority.sourceWriteAllowed,false);
  assert.equal(output.authority.officiality,'NOT_EXTERNALLY_VERIFIED');
  assert.equal(calls.length,1);
  assert.equal(calls[0].ownerId,input.ownerId);
  assert.equal(calls[0].groupKey,input.groupKey);
  assert.equal(calls[0].aggregateKind,'race');
  assert.match(calls[0].aggregateKey,/^racectx_[a-f0-9]{24}$/);
  assert.equal(calls[0].limit,1);
});

test('canonical known state reveals no raw event data and is not officiality attestation',async()=>{
  const got=await readCanonicalLabRace(input,(async()=>({
    aggregate:{status:'OPEN',stateVersion:3,updatedAt:new Date('2026-10-12T12:34:00Z')},
    events:[{normalizedPayload:{amount:88888}}]
  })) as any);
  assert.equal(got.available,true);
  assert.equal(got.state,'OPEN');
  assert.equal(got.updatedAt,'2026-10-12T12:34:00.000Z');
  assert.doesNotMatch(JSON.stringify(got),/88888/);
  assert.equal(got.authority.officiality,'NOT_EXTERNALLY_VERIFIED');
});

test('unknown or version-zero status cannot be reported as validated',async()=>{
  for(const status of ['CUSTOM','OPEN']){
    const got=await readCanonicalLabRace(input,(async()=>({
      aggregate:{status,stateVersion:0,updatedAt:new Date()},events:[]
    })) as any);
    assert.equal(got.available,false);
    assert.equal(got.reason,'CANONICAL_RACE_UNVERIFIED');
  }
});

test('LAB endpoint checks token/group then policy then read without mutation',()=>{
  const s=readFileSync(new URL('./hipico-bridge.routes.ts',import.meta.url),'utf8');
  const start=s.indexOf("router.post('/bridge/lab/query'");
  const end=s.indexOf("router.post('/bridge/events'",start);
  assert.ok(start>=0&&end>start);
  const route=s.slice(start,end);
  assert.ok(route.indexOf('validateBridgeGroupIdentity(input)')<route.indexOf('readCanonicalLabRace({'));
  assert.match(route,/decideConversation\(/);
  assert.match(route,/result\.risk!=='safe'/);
  assert.match(route,/groupKey:OFFICIAL_SOURCE_CHANNEL_KEY/);
  assert.doesNotMatch(route,/persistBridgeTransportEvent|persistCanonicalShadow|ensureSourceReplyOutbox/);
});
