import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/database/prisma.js';
import { RaceLifecycleStore } from '../src/modules/hipico/race.store.js';

const phase=String(process.argv[2]||'').trim();
const OWNER_ID=String(process.env.HIPICO_E2E_OWNER_ID||'11111111-1111-4111-8111-111111111111');
const DATABASE_URL=String(process.env.HIPICO_E2E_DATABASE_URL||process.env.DATABASE_URL||'').trim();
const artifact=path.resolve(process.env.HIPICO_RESTART_STATE_FILE||'artifacts/qa/hipico-v290/restart-state.json');
const store=new RaceLifecycleStore();

function requireIsolatedDatabase(){
  assert.ok(DATABASE_URL,'HIPICO_E2E_DATABASE_URL is required');
  const url=new URL(DATABASE_URL);
  assert.ok(['127.0.0.1','localhost','::1'].includes(url.hostname.toLowerCase()),'restart recovery refuses non-local PostgreSQL');
  assert.match(url.pathname.replace(/^\//,''),/^hipico_e2e_[a-z0-9_]{8,63}$/,'restart recovery requires hipico_e2e_ database');
}

requireIsolatedDatabase();
try{
  if(phase==='prepare'){
    const suffix=`${Date.now()}-${Math.random().toString(16).slice(2,10)}`;
    const groupKey=`restart-${suffix}`;
    const meeting=await store.createMeeting({ownerId:OWNER_ID,groupKey,name:'Restart E2E',meetingDate:new Date().toISOString()});
    const race=await store.createRace({ownerId:OWNER_ID,groupKey,meetingId:meeting.id,number:1,name:'Restart Race'});
    const requestId=`restart-open-${suffix}`;
    const correlationId=`restart-trace-${suffix}`;
    const opened=await store.command(OWNER_ID,groupKey,race.id,{command:'OPEN',expectedState:'DISCOVERED',requestId,actorId:'e2e:operator',actorType:'operator',correlationId,payload:{restartRecovery:true}});
    assert.equal(opened.duplicate,false);
    assert.equal(opened.transition.to,'OPEN');
    const persisted=await store.getRace(OWNER_ID,groupKey,race.id);
    assert.equal(persisted.state,'OPEN');
    await fs.mkdir(path.dirname(artifact),{recursive:true});
    await fs.writeFile(artifact,`${JSON.stringify({schema:'hipico-restart.v290',ownerId:OWNER_ID,groupKey,meetingId:meeting.id,raceId:race.id,requestId,correlationId,status:'PREPARED',preparedAt:new Date().toISOString()},null,2)}\n`,'utf8');
    console.log(`[hipico-v290] restart prepare persisted ${groupKey}/${race.id}`);
  }else if(phase==='verify'){
    const state=JSON.parse(await fs.readFile(artifact,'utf8'));
    assert.equal(state.ownerId,OWNER_ID);
    const before=await store.getRace(OWNER_ID,state.groupKey,state.raceId);
    assert.equal(before.state,'OPEN');
    assert.equal(Number(before.stateVersion),1);
    const replay=await store.command(OWNER_ID,state.groupKey,state.raceId,{command:'OPEN',expectedState:'DISCOVERED',requestId:state.requestId,actorId:'e2e:operator',actorType:'operator',correlationId:state.correlationId,payload:{restartRecovery:true}});
    assert.equal(replay.duplicate,true);
    assert.equal(replay.transition.to,'OPEN');
    assert.equal(replay.transition.resultStage,'none');
    const historyBefore=await store.history(OWNER_ID,state.groupKey,state.raceId);
    assert.equal(historyBefore.length,1);
    const close=await store.command(OWNER_ID,state.groupKey,state.raceId,{command:'CLOSE',expectedState:'OPEN',requestId:`${state.requestId}:close`,actorId:'e2e:operator',actorType:'operator',correlationId:`${state.correlationId}:close`,payload:{restartRecovery:true}});
    assert.equal(close.transition.to,'CLOSED');
    const after=await store.getRace(OWNER_ID,state.groupKey,state.raceId);
    assert.equal(after.state,'CLOSED');
    assert.equal(Number(after.stateVersion),2);
    const historyAfter=await store.history(OWNER_ID,state.groupKey,state.raceId);
    assert.equal(historyAfter.length,2);
    await fs.writeFile(artifact,`${JSON.stringify({...state,status:'PASS',finalState:'CLOSED',verifiedAt:new Date().toISOString()},null,2)}\n`,'utf8');
    console.log(`[hipico-v290] restart verify PASS ${state.groupKey}/${state.raceId}`);
  }else throw new Error('Usage: tsx backend/scripts/hipico-restart-recovery-v290.ts prepare|verify');
}finally{
  await prisma.$disconnect();
}
