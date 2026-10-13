import test from 'node:test';
import assert from 'node:assert/strict';
import {createLabQueryBackoff} from '../src/lab-query-backoff.mjs';

test('backoff is per message, exponential and bounded without time sleeps',()=>{
  let time=100000;
  const gate=createLabQueryBackoff({now:()=>time,baseMs:1000,maxMs:4000,maxEntries:2});
  assert.equal(gate.allowed('first'),true);
  assert.equal(gate.fail('first'),1000);
  assert.equal(gate.allowed('first'),false);
  assert.equal(gate.allowed('second'),true);
  time+=1000;
  assert.equal(gate.allowed('first'),true);
  assert.equal(gate.fail('first'),2000);
  assert.equal(gate.allowed('first'),false);
  time+=2000;
  assert.equal(gate.fail('first'),4000);
  time+=4000;
  assert.equal(gate.allowed('first'),true);
  gate.clear('first');
  assert.equal(gate.allowed('first'),true);
});

test('bounded state drops oldest and never stores content as an authorization',()=>{
  let time=0;
  const gate=createLabQueryBackoff({now:()=>time,baseMs:1000,maxMs:10000,maxEntries:2});
  gate.fail('msgA');gate.fail('msgB');gate.fail('msgC');
  assert.equal(gate.size,2);
  assert.equal(gate.allowed('msgA'),true);
  assert.equal(gate.allowed('msgB'),false);
  assert.equal(gate.allowed('msgC'),false);
  assert.equal(gate.allowed(''),false);
  assert.throws(()=>createLabQueryBackoff({maxEntries:0}),/LAB_QUERY_BACKOFF_LIMITS_INVALID/);
});

test('Bridge never enters send journal when canonical read is pending or throttled',async()=>{
  const fs=await import('node:fs/promises');
  const code=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const start=code.indexOf('async function processLabTestInput()');
  const end=code.indexOf('async function visibleLabHasTag',start);
  const block=code.slice(start,end);
  const throttle=block.indexOf('!labQueryBackoff.allowed(row.id)');
  const lookup=block.indexOf('await queryCanonicalLab({');
  const blocked=block.indexOf('labQueryBackoff.fail(row.id)');
  const prepared=block.indexOf('await labTestReplyJournal.prepare(row.id)');
  assert.ok(throttle>0&&throttle<lookup&&lookup<blocked&&blocked<prepared);
  assert.match(block,/if\(inquiryPurpose\)labQueryBackoff.clear\(row.id\)/);
});
