import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkLabHandoff } from './hipico-lab-handoff-gate.js';
import { initialHandoffState, applyOperatorCommand, type HandoffState } from './hipico-response-safety.js';
import { operationalRaceContextKey } from './hipico-race-context-key.js';

const now=new Date('2026-10-12T17:00:00Z');
const input={sender:'123456789012',sourceGroupKey:'official-source',labGroupKey:'control-hipico-lab',at:now};
const race={raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'};
const human=(group:string,sender:string,scope:string|null,ttlMs=30*60*1000)=>{
  const fresh=initialHandoffState(group,sender,scope,now);
  return applyOperatorCommand(fresh,'pause',{
    authenticatedOperator:true,operatorId:'operator-internal-1',ttlMs,at:now
  });
};
const loader=(predicate:(group:string,context:string|null)=>boolean)=>
  async(group:string,sender:string,context:string|null)=>{
    return predicate(group,context)
      ? human(group,sender,context)
      : initialHandoffState(group,sender,context,now);
  };

test('no takeover permits read-only LAB, checking global source and LAB scope',async()=>{
  const seen:string[]=[];
  const gate=await checkLabHandoff({...input,race},async(group,sender,ctx)=>{
    seen.push(group+'|'+(ctx??'global'));
    assert.equal(sender,input.sender);
    return initialHandoffState(group,sender,ctx,now);
  });
  assert.deepEqual(gate,{allowed:true,reason:'LAB_HANDOFF_CLEAR'});
  assert.equal(seen.length,4);
  assert.ok(seen.includes('official-source|global'));
  assert.ok(seen.includes('control-hipico-lab|global'));
});

test('either global operator takeover blocks all LAB sends, no financial or owner data returned',async()=>{
  for(const group of ['official-source','control-hipico-lab']){
    const result=await checkLabHandoff({...input,race},
      loader((g,ctx)=>g===group&&ctx===null));
    assert.deepEqual(result,{allowed:false,reason:'LAB_HANDOFF_HELD'});
    assert.doesNotMatch(JSON.stringify(result),/operator-internal/);
  }
});

test('race-scoped handoff blocks only matching validated race; a different race is distinct',async()=>{
  const scoped=operationalRaceContextKey(race);
  assert.ok(scoped);
  const read=loader((g,ctx)=>g==='official-source'&&ctx===scoped);
  assert.equal((await checkLabHandoff({...input,race},read)).allowed,false);
  assert.equal((await checkLabHandoff({...input,
    race:{...race,raceNumber:6}},read)).allowed,true);
  assert.equal((await checkLabHandoff({...input,race:null},read)).allowed,true);
});

test('expired takeover releases without DB writes; permanent operator takeover stays held',async()=>{
  const expired=human(input.sourceGroupKey,input.sender,null,1000);
  const later=new Date(now.getTime()+2000);
  assert.deepEqual(await checkLabHandoff({...input,at:later},
    async(group,sender,context)=>group===input.sourceGroupKey
      ? expired : initialHandoffState(group,sender,context,now)),
    {allowed:true,reason:'LAB_HANDOFF_CLEAR'});
  const permanent=applyOperatorCommand(initialHandoffState('official-source',input.sender,null,now),
    'pause',{authenticatedOperator:true,operatorId:'operator-internal-1',ttlMs:0,at:now});
  assert.equal((await checkLabHandoff({...input,at:later},
    async(group,sender,context)=>group===input.sourceGroupKey
      ? permanent : initialHandoffState(group,sender,context,now))).allowed,false);
});

test('invalid scope and unknown ownership never silently allow a LAB send',async()=>{
  let reads=0;
  const record=async()=>{reads++;return initialHandoffState('official-source',input.sender,null,now);};
  assert.deepEqual(await checkLabHandoff({...input,race:{...race,raceDate:'2026-02-30'}},record),
    {allowed:false,reason:'LAB_HANDOFF_SCOPE_INVALID'});
  assert.equal(reads,0);
  assert.equal((await checkLabHandoff({...input,sender:''},record)).allowed,false);
  const unknown=async()=>({...initialHandoffState('official-source',input.sender,null,now),
    ownership:'unknown' as HandoffState['ownership']});
  assert.equal((await checkLabHandoff(input,unknown)).allowed,false);
});

test('missing or overlapping pinned channels never turn a partial handoff check into permission',async()=>{
  let calls=0;
  const read=async(group:string,sender:string,context:string|null)=>{
    calls++;
    return initialHandoffState(group,sender,context,now);
  };
  for(const config of [
    {...input,sourceGroupKey:''},
    {...input,labGroupKey:''},
    {...input,sourceGroupKey:'control-hipico-lab'},
    {...input,labGroupKey:'official-source'},
    {...input,sourceGroupKey:'CONTROL-HIPICO-LAB'},
    {...input,labGroupKey:'OFFICIAL-SOURCE'},
    {...input,sender:''}
  ]){
    assert.deepEqual(await checkLabHandoff(config,read),
      {allowed:false,reason:'LAB_HANDOFF_SCOPE_INVALID'});
  }
  assert.equal(calls,0,'no DB reads with incomplete or overlapping pinned identity');
});

test('handoff lookup must be bound to exact group, sender and race; mismatches deny autonomously',async()=>{
  const valid={...input,race};
  const key=operationalRaceContextKey(race);
  const initial=initialHandoffState(input.sourceGroupKey,input.sender,null,now);
  const corrupt=[
    {...initial,conversationKey:'hconv_'+ 'f'.repeat(24)},
    {...initial,groupKey:input.labGroupKey},
    {...initial,participantId:'another-sender'},
    {...initial,raceId:key},
    {...initial,ownership:'unknown' as HandoffState['ownership']},
    {...initial,clarificationCount:-1},
    {...initial,clarificationCount:Number.NaN}
  ];
  for(const record of corrupt){
    const gate=await checkLabHandoff(valid,async(group,sender,ctx)=>{
      if(group===input.sourceGroupKey && ctx===null)return record;
      return initialHandoffState(group,sender,ctx,now);
    });
    assert.deepEqual(gate,{allowed:false,reason:'LAB_HANDOFF_HELD'},
      'invalid persisted authority must never resolve to bot-owned');
  }
  const good=await checkLabHandoff(valid,
    async(group,sender,ctx)=>initialHandoffState(group,sender,ctx,now));
  assert.deepEqual(good,{allowed:true,reason:'LAB_HANDOFF_CLEAR'});
});

test('DB outage is propagated for route 503 fail closed, never mistaken for a bot-owned row',async()=>{
  await assert.rejects(checkLabHandoff(input,async()=>{throw new Error('DB_UNAVAILABLE');}),
    /DB_UNAVAILABLE/);
});

test('authenticated LAB eligibility route and canonical reads cannot bypass handoff authority',()=>{
  const route=readFileSync(new URL('./hipico-bridge.routes.ts',import.meta.url),'utf8');
  const gate=route.slice(route.indexOf("router.post('/bridge/lab/eligibility'"),
    route.indexOf("router.post('/bridge/lab/query'"));
  assert.ok(gate.length>300);
  assert.match(gate,/bridgeTokenValid/);
  assert.match(gate,/labHandoffCheckSchema\.safeParse/);
  assert.match(gate,/validateBridgeGroupIdentity\(input\)/);
  assert.match(gate,/normalizeBridgeSender\(input\.senderId\)/);
  assert.match(gate,/await checkLabHandoff/);
  assert.match(gate,/status\(503\).*LAB_HANDOFF_STATE_UNAVAILABLE/s);
  assert.doesNotMatch(gate,/persist|saveHandoff|INSERT|UPDATE|operatorToken/);
  const query=route.slice(route.indexOf("router.post('/bridge/lab/query'"),
    route.indexOf("router.post('/bridge/events'"));
  const begin=query.indexOf("const gate=await checkLabHandoff(");
  const read=query.indexOf('await readScopedLabSchedule(');
  const recheck=query.indexOf("const recheck=await checkLabHandoff(");
  assert.ok(begin>=0&&read>begin&&recheck>read);
  assert.match(query,/status:'LAB_HANDOFF_HELD'/);
});
