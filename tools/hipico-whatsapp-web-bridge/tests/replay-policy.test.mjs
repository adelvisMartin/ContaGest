import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReplayArgs } from '../src/replay-policy.mjs';

test('replay CLI accepts a bounded deterministic window',()=>{
  const parsed=normalizeReplayArgs({
    kind:'lab-mirror',destination:'control-hipico-lab',limit:'250',execute:'false',
    from:'2026-09-11T01:00:00-05:00',to:'2026-09-11T07:00:00Z'
  });
  assert.equal(parsed.limit,250);
  assert.equal(parsed.execute,false);
  assert.equal(parsed.from,'2026-09-11T06:00:00.000Z');
  assert.equal(parsed.to,'2026-09-11T07:00:00.000Z');
});

test('replay CLI refuses malformed or unbounded limits',()=>{
  for(const limit of ['abc','0','-1','1001','1.5']){
    assert.throws(()=>normalizeReplayArgs({limit}),/REPLAY_LIMIT_INVALID/);
  }
});

test('replay CLI refuses ambiguous, impossible and reversed time ranges',()=>{
  for(const from of ['2026-09-11','09/11/2026 06:00:00','2026-02-31T06:00:00Z','2026-09-11T06:00:00+15:00']){
    assert.throws(()=>normalizeReplayArgs({from}),/REPLAY_FROM_INVALID/);
  }
  assert.throws(()=>normalizeReplayArgs({from:'2026-09-11T08:00:00Z',to:'2026-09-11T07:00:00Z'}),/REPLAY_RANGE_INVALID/);
});

test('replay CLI refuses unknown arguments and ambiguous execute flags',()=>{
  assert.throws(()=>normalizeReplayArgs({force:'true'}),/REPLAY_UNKNOWN_ARGUMENT:force/);
  assert.throws(()=>normalizeReplayArgs({execute:'yes'}),/REPLAY_EXECUTE_INVALID/);
});
