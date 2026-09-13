import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalPreviewRaceContext } from './hipico-canonical.routes.js';

const entities={racetrack:'Churchill Downs',raceNumber:7};

test('canonical preview never publishes an undated legacy race key as canonical identity',()=>{
  const preview=canonicalPreviewRaceContext(entities,undefined);
  assert.equal(preview.raceContextKey,null);
  assert.equal(preview.canonicalRaceContextKey,null);
  assert.equal(preview.raceDateRequired,true);
});

test('canonical preview emits one dated race identity when date track and race are complete',()=>{
  const preview=canonicalPreviewRaceContext(entities,'2026-09-12');
  assert.match(String(preview.raceContextKey),/^racectx_[a-f0-9]{24}$/);
  assert.equal(preview.canonicalRaceContextKey,preview.raceContextKey);
  assert.equal(preview.raceDateRequired,false);
});

test('invalid race date cannot silently fall back to a date-less key',()=>{
  const preview=canonicalPreviewRaceContext(entities,'2026-02-31');
  assert.equal(preview.raceContextKey,null);
  assert.equal(preview.canonicalRaceContextKey,null);
  assert.equal(preview.raceDateRequired,true);
});
