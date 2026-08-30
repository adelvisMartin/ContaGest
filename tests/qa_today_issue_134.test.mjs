import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const script=fs.readFileSync('scripts/qa-today.mjs','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const runbook=fs.readFileSync('docs/qa/QA-TODAY-2026-08-30.md','utf8');

test('qa today exposes prepare/status/instructions',()=>{
  assert.match(script,/prepare\|status\|instructions/);
  for(const key of ['qa:today','qa:today:prepare','qa:today:status'])assert.equal(typeof pkg.scripts[key],'string',key);
});

test('qa today binds all evidence templates to a 40-char candidate SHA',()=>{
  assert.match(script,/QA_TODAY_REQUIRES_BOUND_SHA/);
  for(const path of ['erp-v155','erp-performance-v157','erp-mobile-v182','hipico-v119','hipico-v120'])assert.match(script,new RegExp(path));
});

test('physical/soak instructions preserve SOURCE read-only and LAB write-only',()=>{
  assert.match(script,/SOURCE no se usa como destino de escritura/);
  assert.match(script,/--source-read-only=PASS/);
  assert.match(script,/--lab-only-write=PASS/);
});

test('runbook never treats Actions no-runner as PASS and keeps compliance NO_GO',()=>{
  assert.match(runbook,/runner_id=0/);
  assert.match(runbook,/BLOCKED\/NOT_EXECUTED/);
  assert.match(runbook,/NO_GO/);
  assert.match(runbook,/apuestas con dinero real/);
});
