import assert from 'node:assert/strict';
import test from 'node:test';
import { operationalRaceContextKey } from './hipico-race-context-key.js';

test('same operational race produces a stable key across accents/case spacing',()=>{
  const a=operationalRaceContextKey({racetrack:'La Rinconada',raceNumber:7});
  const b=operationalRaceContextKey({racetrack:'  LA   RINCONADA ',raceNumber:7});
  assert.equal(a,b);
  assert.match(a||'',/^racectx_[a-f0-9]{24}$/);
});

test('same race number at different tracks never shares conversation key',()=>{
  const churchill=operationalRaceContextKey({racetrack:'Churchill Downs',raceNumber:1});
  const colonial=operationalRaceContextKey({racetrack:'Colonial Downs',raceNumber:1});
  assert.notEqual(churchill,colonial);
});

test('incomplete race context stays global instead of guessing an identity',()=>{
  assert.equal(operationalRaceContextKey({racetrack:'',raceNumber:1}),null);
  assert.equal(operationalRaceContextKey({racetrack:'Churchill Downs',raceNumber:null}),null);
});
