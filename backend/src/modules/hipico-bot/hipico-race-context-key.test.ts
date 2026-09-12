import assert from 'node:assert/strict';
import test from 'node:test';
import { operationalRaceContextKey, __test__ } from './hipico-race-context-key.js';

test('same operational race produces a stable legacy shadow key across accents/case spacing',()=>{
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

test('canonical dated identity separates the same track and race number across race days',()=>{
  const firstDay=operationalRaceContextKey({racetrack:'Churchill Downs',raceNumber:4,raceDate:'2026-09-11'});
  const nextDay=operationalRaceContextKey({racetrack:'Churchill Downs',raceNumber:4,raceDate:'2026-09-12'});
  const sameDayNormalized=operationalRaceContextKey({racetrack:'  CHURCHILL   DOWNS ',raceNumber:4,raceDate:'2026-09-11'});
  assert.match(firstDay||'',/^racectx_[a-f0-9]{24}$/);
  assert.notEqual(firstDay,nextDay);
  assert.equal(firstDay,sameDayNormalized);
});

test('explicit race date is strict calendar-only and never normalized by JavaScript Date rollover',()=>{
  assert.equal(__test__.normalizedRaceDate('2028-02-29'),'2028-02-29');
  assert.equal(__test__.normalizedRaceDate('2026-02-29'),undefined);
  assert.equal(__test__.normalizedRaceDate('2026-02-31'),undefined);
  assert.equal(__test__.normalizedRaceDate('2026-13-01'),undefined);
  assert.equal(__test__.normalizedRaceDate('11/09/2026'),undefined);
  assert.equal(operationalRaceContextKey({racetrack:'Churchill Downs',raceNumber:4,raceDate:'2026-02-31'}),null);
});

test('incomplete race context stays global instead of guessing an identity',()=>{
  assert.equal(operationalRaceContextKey({racetrack:'',raceNumber:1}),null);
  assert.equal(operationalRaceContextKey({racetrack:'Churchill Downs',raceNumber:null}),null);
});