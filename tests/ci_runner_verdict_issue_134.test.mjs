import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRunnerIncident } from '../scripts/ci-runner-verdict-v134.mjs';

const SHA='a'.repeat(40);
const run=(overrides={})=>({status:'completed',conclusion:'failure',head_sha:SHA,...overrides});

test('#134 keeps unfinished exact-SHA runs NOT_EXECUTED',()=>{
  assert.equal(classifyRunnerIncident(run({status:'queued',conclusion:null}),[],SHA),'NOT_EXECUTED');
  assert.equal(classifyRunnerIncident(run({status:'in_progress',conclusion:null}),[],SHA),'NOT_EXECUTED');
});

test('#134 rejects evidence from another SHA',()=>{
  assert.equal(classifyRunnerIncident(run({head_sha:'b'.repeat(40)}),[],SHA),'SHA_MISMATCH');
});

test('#134 never treats a zero-job startup/configuration failure as runner infrastructure',()=>{
  assert.equal(classifyRunnerIncident(run(),[],SHA),'FAIL_CONFIG_OR_STARTUP');
});

test('#134 classifies a completed failure before runner assignment as BLOCKED_RUNNER',()=>{
  const jobs=[{id:1,runner_id:0,steps:[]},{id:2,runner_id:null,steps:null}];
  assert.equal(classifyRunnerIncident(run(),jobs,SHA),'BLOCKED_RUNNER');
});

test('#134 classifies failures after any executed step as workflow/product failures',()=>{
  const jobs=[{id:1,runner_id:123,steps:[{name:'Checkout',status:'completed',conclusion:'success'}]}];
  assert.equal(classifyRunnerIncident(run(),jobs,SHA),'FAIL_EXECUTED');
});

test('#134 requires executed job evidence before accepting success as PASS',()=>{
  assert.equal(classifyRunnerIncident(run({conclusion:'success'}),[],SHA),'FAIL_CONFIG_OR_STARTUP');
  assert.equal(classifyRunnerIncident(run({conclusion:'success'}),[{id:1,runner_id:123,steps:[{name:'probe',status:'completed',conclusion:'success'}]}],SHA),'PASS');
});
