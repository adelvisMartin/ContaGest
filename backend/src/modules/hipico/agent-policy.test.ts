import test from 'node:test';
import assert from 'node:assert/strict';
import { HipicoAgentEngine, agentCanAct, canPromoteAutomation, safeToolRequest, validateModelCandidate, type DeterministicAgentParser } from './agent-policy.js';
import { deterministicAgentParser } from './agent-engine.js';

void test('promotion gates require measured reviewed accuracy and zero high-risk/unauthorized errors',()=>{
  assert.equal(canPromoteAutomation('DISABLED','SHADOW',{reviewed:0,matched:0,highRiskFalsePositive:0,unauthorizedAction:0,conflicts:0}).allowed,true);
  assert.equal(canPromoteAutomation('SHADOW','ASSISTED',{reviewed:199,matched:199,highRiskFalsePositive:0,unauthorizedAction:0,conflicts:0}).allowed,false);
  assert.equal(canPromoteAutomation('SHADOW','ASSISTED',{reviewed:200,matched:196,highRiskFalsePositive:0,unauthorizedAction:0,conflicts:0}).allowed,true);
  assert.equal(canPromoteAutomation('ASSISTED','AUTOMATIC_LOW_RISK',{reviewed:500,matched:495,highRiskFalsePositive:0,unauthorizedAction:0,conflicts:2}).allowed,true);
  assert.equal(canPromoteAutomation('AUTOMATIC_LOW_RISK','AUTOMATIC',{reviewed:1000,matched:999,highRiskFalsePositive:0,unauthorizedAction:0,conflicts:0},false).allowed,false);
});

void test('SHADOW/ASSISTED never execute and monetary/review candidates never auto-act',()=>{
  const safe={intent:'query',confidence:.99,tool:'queryRaceStatus' as const,arguments:{},risk:'safe' as const,source:'deterministic' as const,modelVersion:null};
  assert.equal(agentCanAct('SHADOW',safe),false);assert.equal(agentCanAct('ASSISTED',safe),false);assert.equal(agentCanAct('AUTOMATIC_LOW_RISK',safe),true);
  assert.equal(agentCanAct('AUTOMATIC',{...safe,risk:'monetary'}),false);assert.equal(agentCanAct('AUTOMATIC',{...safe,risk:'review'}),false);
});

void test('model output must match bounded schema and cannot request SQL/shell/secrets through tool arguments',()=>{
  const candidate=validateModelCandidate({intent:'query:NEXT_RACE',confidence:.9,tool:'queryNextRace',arguments:{},risk:'safe',modelVersion:'fixture'});
  assert.equal(candidate.source,'model');
  assert.throws(()=>validateModelCandidate({intent:'x',confidence:2,tool:'queryNextRace',arguments:{},risk:'safe'}),/AGENT_CANDIDATE_SCHEMA_INVALID/);
  assert.throws(()=>safeToolRequest({...candidate,arguments:{shell:'rm -rf /'}}),/AGENT_TOOL_ARGUMENTS_REJECTED/);
  assert.throws(()=>safeToolRequest({...candidate,arguments:{token:'secret'}}),/AGENT_TOOL_ARGUMENTS_REJECTED/);
});

void test('deterministic parser handles natural race queries before any optional model',()=>{
  const parsed=deterministicAgentParser.parse('¿Cuál es la próxima carrera?');
  assert.equal(parsed.intent,'query:NEXT_RACE');assert.equal(parsed.tool,'queryNextRace');assert.equal(parsed.risk,'safe');
});

void test('optional model is only a candidate and cannot bypass safe tool policy',async()=>{
  const weak:DeterministicAgentParser={parse:()=>({intent:'unknown',confidence:.2,tool:null,arguments:{},risk:'review'})};
  const engine=new HipicoAgentEngine(weak,{id:'fixture-model',async generate(){return{intent:'query',confidence:.9,tool:'queryRaceStatus',arguments:{},risk:'safe'};}});
  const result=await engine.evaluate('mensaje','SHADOW');
  assert.equal(result.candidate.source,'model');assert.equal(result.canAct,false);assert.equal(result.toolRequest?.tool,'queryRaceStatus');
});
