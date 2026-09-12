import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('./hipico-canonical-shadow.store.ts',import.meta.url),'utf8');
const start=source.indexOf('async function ensureOfficialSourceChannel');
const end=source.indexOf('async function resolveChannel');
const provision=source.slice(start,end);
const bindingStart=source.indexOf('function canonicalChannelBindingError');
const bindingEnd=source.indexOf('async function findActiveWebBridge',bindingStart);
const binding=source.slice(bindingStart,bindingEnd);

test('official source provisioning never reactivates an existing disabled channel',()=>{
  assert.ok(start>=0&&end>start);
  assert.match(provision,/ON CONFLICT \(owner_id,group_key\) DO NOTHING/);
  assert.doesNotMatch(provision,/DO UPDATE SET/);
  assert.match(provision,/HIPICO_SOURCE_CHANNEL_DISABLED_OR_INCOMPATIBLE/);
  assert.match(provision,/status!=='active'/);
  assert.match(provision,/channelType!=='web_bridge'/);
});

test('official source provisioning stays bound to the unique active LAB owner',()=>{
  assert.match(provision,/findActiveWebBridge\(labKey\)/);
  assert.match(provision,/labRows\.length!==1/);
  assert.match(provision,/VALUES \(\$\{lab\.ownerId\}::uuid/);
});

test('canonical shadow store independently pins SOURCE and LAB channel roles to configured keys',()=>{
  assert.ok(bindingStart>=0&&bindingEnd>bindingStart);
  assert.match(binding,/input\.channelRole==='source'/);
  assert.match(binding,/groupKey!==OFFICIAL_SOURCE_CHANNEL_KEY/);
  assert.match(binding,/groupKey!==DEFAULT_LAB_CHANNEL_KEY/);
  assert.match(binding,/labKey!==DEFAULT_LAB_CHANNEL_KEY/);
  assert.match(binding,/HIPICO_CANONICAL_SOURCE_CHANNEL_NOT_ALLOWED/);
  assert.match(binding,/HIPICO_CANONICAL_LAB_CHANNEL_NOT_ALLOWED/);
  assert.match(binding,/HIPICO_CANONICAL_LAB_REFERENCE_NOT_ALLOWED/);
});

test('canonical resolve performs role/key binding before any active-channel lookup',()=>{
  const resolveStart=source.indexOf('async function resolveChannel');
  const resolveEnd=source.indexOf('function eventType',resolveStart);
  const resolve=source.slice(resolveStart,resolveEnd);
  const bindingCheck=resolve.indexOf('canonicalChannelBindingError(input)');
  const lookup=resolve.indexOf('findActiveWebBridge(groupKey)');
  assert.ok(bindingCheck>=0&&lookup>bindingCheck);
});