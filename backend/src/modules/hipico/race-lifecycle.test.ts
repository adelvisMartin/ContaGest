import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRaceQueryIntent, evaluateRaceCommand, type RaceCommandInput, type RaceLifecycleState } from './race-lifecycle.js';

const command=(state:RaceLifecycleState,patch:Partial<RaceCommandInput>={}):RaceCommandInput=>({
  command:'ANNOUNCE',expectedState:state,requestId:'request-0001',actorId:'operator-1',actorType:'operator',correlationId:'trace-000001',evidence:[],payload:{},...patch
});

void test('canonical happy path separates close, running, provisional and official result',()=>{
  let state:RaceLifecycleState='DISCOVERED';
  const apply=(input:RaceCommandInput)=>{const result=evaluateRaceCommand(state,input);assert.equal(result.allowed,true,result.reason);state=result.to;return result;};
  apply(command(state,{command:'ANNOUNCE'}));
  apply(command(state,{command:'OPEN',expectedState:state}));
  apply(command(state,{command:'BEGIN_CLOSING',expectedState:state}));
  apply(command(state,{command:'CLOSE',expectedState:state}));
  assert.equal(state,'CLOSED');
  apply(command(state,{command:'START',expectedState:state}));
  const provisional=apply(command(state,{command:'RECORD_PROVISIONAL_RESULT',expectedState:state,payload:{arrival:['5','3','1']}}));
  assert.equal(provisional.resultStage,'provisional');
  const official=apply(command(state,{command:'MARK_OFFICIAL_RESULT',expectedState:state,evidence:[{source:'official-feed',authority:'official',confidence:.99}]}));
  assert.equal(state,'OFFICIAL_RESULT');assert.equal(official.resultStage,'official');
  apply(command(state,{command:'ARCHIVE',expectedState:state}));
  assert.equal(state,'ARCHIVED');
});

void test('CLOSED never implies settlement or official result',()=>{
  const result=evaluateRaceCommand('OPEN',command('OPEN',{command:'CLOSE'}));
  assert.equal(result.allowed,true);assert.equal(result.to,'CLOSED');assert.equal(result.resultStage,'none');
});

void test('one ambiguous/trusted signal cannot auto-open a race',()=>{
  const result=evaluateRaceCommand('ANNOUNCED',command('ANNOUNCED',{command:'OPEN',actorType:'agent',evidence:[{source:'message-1',authority:'trusted',confidence:.91}]}));
  assert.equal(result.allowed,false);assert.equal(result.reason,'OPEN_REQUIRES_CORROBORATED_EVIDENCE');
  const corroborated=evaluateRaceCommand('ANNOUNCED',command('ANNOUNCED',{command:'OPEN',actorType:'agent',evidence:[{source:'message-1',authority:'trusted',confidence:.91},{source:'provider-1',authority:'official',confidence:.95}]}));
  assert.equal(corroborated.allowed,true);
});

void test('arrival/provisional result cannot become official without official evidence',()=>{
  const denied=evaluateRaceCommand('PROVISIONAL_RESULT',command('PROVISIONAL_RESULT',{command:'MARK_OFFICIAL_RESULT',evidence:[{source:'provider',authority:'trusted',confidence:.99}]}));
  assert.equal(denied.allowed,false);assert.equal(denied.reason,'OFFICIAL_RESULT_REQUIRES_OFFICIAL_EVIDENCE');
});

void test('expected-state mismatch fails closed',()=>{
  const result=evaluateRaceCommand('OPEN',command('ANNOUNCED',{command:'CLOSE'}));
  assert.equal(result.allowed,false);assert.equal(result.reason,'EXPECTED_STATE_MISMATCH');
});

void test('postponed, suspended and cancelled alternate paths are explicit',()=>{
  assert.equal(evaluateRaceCommand('ANNOUNCED',command('ANNOUNCED',{command:'POSTPONE'})).to,'POSTPONED');
  assert.equal(evaluateRaceCommand('POSTPONED',command('POSTPONED',{command:'RESUME'})).to,'ANNOUNCED');
  assert.equal(evaluateRaceCommand('OPEN',command('OPEN',{command:'SUSPEND'})).to,'SUSPENDED');
  assert.equal(evaluateRaceCommand('SUSPENDED',command('SUSPENDED',{command:'CANCEL'})).to,'CANCELLED');
});

void test('natural query intents are deterministic and unknown context is not guessed',()=>{
  assert.equal(classifyRaceQueryIntent('¿Cuál es la próxima carrera?'),'NEXT_RACE');
  assert.equal(classifyRaceQueryIntent('carrera activa'),'ACTIVE_RACE');
  assert.equal(classifyRaceQueryIntent('última pizarra'),'LAST_RESULT');
  assert.equal(classifyRaceQueryIntent('programación de hoy'),'SCHEDULE');
  assert.equal(classifyRaceQueryIntent('retirados'),'SCRATCHES');
  assert.equal(classifyRaceQueryIntent('dime cualquier cosa'),'UNKNOWN');
});
