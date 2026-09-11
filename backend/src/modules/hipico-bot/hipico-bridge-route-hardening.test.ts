import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const routes=readFileSync(new URL('./hipico-bridge.routes.ts',import.meta.url),'utf8');

test('bridge route pins source and lab channels and requires shadow mode for every inbound event',()=>{
  const validator=routes.slice(routes.indexOf('function validatePinnedChannel'),routes.indexOf('router.use'));
  assert.match(validator,/if\(!input\.shadowMode\)/);
  assert.match(validator,/input\.channelKey!==OFFICIAL_SOURCE_CHANNEL_KEY/);
  assert.match(validator,/input\.labChannelKey!==DEFAULT_LAB_CHANNEL_KEY/);
  assert.match(validator,/input\.channelKey!==DEFAULT_LAB_CHANNEL_KEY/);
});

test('operator handoff returns the persisted CAS version and conflicts require reload',()=>{
  const handoff=routes.slice(routes.indexOf("router.post('/bridge/handoff'"),routes.indexOf("router.post('/bridge/events'"));
  assert.match(handoff,/const saved=await saveHandoff/);
  assert.match(handoff,/handoff:saved/);
  assert.match(handoff,/HIPICO_HANDOFF_CONFLICT/);
  assert.match(handoff,/handoff_conflict_reload/);
});

test('bridge decision transition keeps the version returned by persistence',()=>{
  assert.match(routes,/handoffState=await saveHandoff\(next/);
  assert.match(routes,/HANDOFF_CONFLICT_RETRY/);
});
