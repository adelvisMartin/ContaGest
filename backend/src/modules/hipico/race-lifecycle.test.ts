import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRaceQueryIntent, evaluateRaceCommand, type RaceCommandInput, type RaceLifecycleState, type RaceResultStage } from './race-lifecycle.js';

const command=(state:RaceLifecycleState,patch:Partial<RaceCommandInput>={}):RaceCommandInput=>({
  command:'ANNOUNCE',expectedState:state,requestId:'request-0001',actorId:'operator-1',actorType:'operator',correlationId:'trace-000001',evidence:[],payload:{},...patch
});

void test('canonical happy path keeps observed provisional verified and official result distinct',()=>{
  let state:RaceLifecycleState='DISCOVERED';let stage:RaceResultStage='none';
  const apply=(input:RaceCommandInput)=>{const result=evaluateRaceCommand(state,input,stage);assert.equal(result.allowed,true,result.reason);state=result.to;stage=result.resultStage;return result;};
  apply(command(state,{command:'ANNOUNCE'}));
  apply(command(state,{command:'OPEN',expectedState:state}));
  apply(command(state,{command:'BEGIN_CLOSING',expectedState:state}));
  apply(command(state,{command:'CLOSE',expectedState:state}));
  assert.equal(state,'CLOSED');assert.equal(stage,'none');
  const observed=apply(command(state,{command:'RECORD_OBSERVED_ARRIVAL',expectedState:state,payload:{arrival:['5','3','1']}}));
  assert.equal(observed.to,'CLOSED');assert.equal(stage,'observed');
  apply(command(state,{command:'START',expectedState:state}));
  assert.equal(stage,'observed');
  const provisional=apply(command(state,{command:'RECORD_PROVISIONAL_RESULT',expectedState:state,payload:{arrival:['5','3','1']}}));
  assert.equal(provisional.resultStage,'provisional');
  const verified=apply(command(state,{command:'MARK_VERIFIED_RESULT',expectedState:state,evidence:[{source:'trusted-1',authority:'trusted',confidence:.95},{source:'trusted-2',authority:'trusted',confidence:.93}]}));
  assert.equal(verified.to,'PROVISIONAL_RESULT');assert.equal(verified.resultStage,'verified');
  const official=apply(command(state,{command:'MARK_OFFICIAL_RESULT',expectedState:state,evidence:[{source:'official-feed',authority:'official',confidence:.99}]}));
  assert.equal(state,'OFFICIAL_RESULT');assert.equal(official.resultStage,'official');
  apply(command(state,{command:'ARCHIVE',expectedState:state}));
  assert.equal(state,'ARCHIVED');assert.equal(stage,'official');
});

void test('CLOSED never implies settlement or a result stage',()=>{
  const result=evaluateRaceCommand('OPEN',command('OPEN',{command:'CLOSE'}),'none');
  assert.equal(result.allowed,true);assert.equal(result.to,'CLOSED');assert.equal(result.resultStage,'none');
});

void test('one ambiguous/trusted signal cannot auto-open a race',()=>{
  const result=evaluateRaceCommand('ANNOUNCED',command('ANNOUNCED',{command:'OPEN',actorType:'agent',evidence:[{source:'message-1',authority:'trusted',confidence:.91}]}));
  assert.equal(result.allowed,false);assert.equal(result.reason,'OPEN_REQUIRES_CORROBORATED_EVIDENCE');
  const corroborated=evaluateRaceCommand('ANNOUNCED',command('ANNOUNCED',{command:'OPEN',actorType:'agent',evidence:[{source:'message-1',authority:'trusted',confidence:.91},{source:'provider-1',authority:'official',confidence:.95}]}));
  assert.equal(corroborated.allowed,true);
});

void test('verified result requires official or two independent strong sources',()=>{
  const denied=evaluateRaceCommand('PROVISIONAL_RESULT',command('PROVISIONAL_RESULT',{command:'MARK_VERIFIED_RESULT',evidence:[{source:'same-source',authority:'trusted',confidence:.99}]}),'provisional');
  assert.equal(denied.allowed,false);assert.equal(denied.reason,'VERIFIED_RESULT_REQUIRES_CORROBORATED_EVIDENCE');assert.equal(denied.resultStage,'provisional');
  const verified=evaluateRaceCommand('PROVISIONAL_RESULT',command('PROVISIONAL_RESULT',{command:'MARK_VERIFIED_RESULT',evidence:[{source:'a',authority:'trusted',confidence:.9},{source:'b',authority:'trusted',confidence:.9}]}),'provisional');
  assert.equal(verified.allowed,true);assert.equal(verified.resultStage,'verified');
});

void test('arrival/provisional/verified wording cannot become official without official evidence',()=>{
  const denied=evaluateRaceCommand('PROVISIONAL_RESULT',command('PROVISIONAL_RESULT',{command:'MARK_OFFICIAL_RESULT',evidence:[{source:'provider',authority:'trusted',confidence:.99}]}),'verified');
  assert.equal(denied.allowed,false);assert.equal(denied.reason,'OFFICIAL_RESULT_REQUIRES_OFFICIAL_EVIDENCE');assert.equal(denied.resultStage,'verified');
});

void test('expected-state mismatch fails closed without downgrading result authority stage',()=>{
  const result=evaluateRaceCommand('PROVISIONAL_RESULT',command('ANNOUNCED',{command:'MARK_OFFICIAL_RESULT'}),'verified');
  assert.equal(result.allowed,false);assert.equal(result.reason,'EXPECTED_STATE_MISMATCH');assert.equal(result.resultStage,'verified');
});

void test('postponed, suspended and cancelled alternate paths are explicit',()=>{
  assert.equal(evaluateRaceCommand('ANNOUNCED',command('ANNOUNCED',{command:'POSTPONE'})).to,'POSTPONED');
  assert.equal(evaluateRaceCommand('POSTPONED',command('POSTPONED',{command:'RESUME'})).to,'ANNOUNCED');
  assert.equal(evaluateRaceCommand('OPEN',command('OPEN',{command:'SUSPEND'})).to,'SUSPENDED');
  assert.equal(evaluateRaceCommand('SUSPENDED',command('SUSPENDED',{command:'CANCEL'})).to,'CANCELLED');
});

void test('natural query intents cover live operational questions and unknown context is not guessed',()=>{
  assert.equal(classifyRaceQueryIntent('¿Cuál es la próxima carrera?'),'NEXT_RACE');
  assert.equal(classifyRaceQueryIntent('carrera activa'),'ACTIVE_RACE');
  assert.equal(classifyRaceQueryIntent('última pizarra'),'LAST_RESULT');
  assert.equal(classifyRaceQueryIntent('resultado de la carrera'),'RESULT');
  assert.equal(classifyRaceQueryIntent('¿ese resultado es oficial?'),'OFFICIALITY');
  assert.equal(classifyRaceQueryIntent('programación de hoy'),'SCHEDULE');
  assert.equal(classifyRaceQueryIntent('¿a qué hora es la carrera?'),'SCHEDULED_TIME');
  assert.equal(classifyRaceQueryIntent('ejemplares inscritos'),'RUNNERS');
  assert.equal(classifyRaceQueryIntent('retirados'),'SCRATCHES');
  assert.equal(classifyRaceQueryIntent('momios de la carrera'),'ODDS');
  assert.equal(classifyRaceQueryIntent('estado de la reunión'),'MEETING_STATUS');
  assert.equal(classifyRaceQueryIntent('dime cualquier cosa'),'UNKNOWN');
});
