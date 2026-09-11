import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { __test__ as canonicalTest } from './hipico-canonical-shadow.store.js';

const source=readFileSync(new URL('./hipico-canonical-shadow.store.ts',import.meta.url),'utf8');
const start=source.indexOf('async function ensureOfficialSourceChannel');
const end=source.indexOf('async function resolveChannel');
const provision=source.slice(start,end);
const sourceKey='club-hipico-triple-crown-official';
const labKey='control-hipico-lab';

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

test('canonical shadow store independently pins SOURCE and LAB channel roles',()=>{
  assert.equal(canonicalTest.canonicalChannelBindingError({groupName:'source',channelRole:'source',channelKey:sourceKey,labChannelKey:labKey}),null);
  assert.equal(canonicalTest.canonicalChannelBindingError({groupName:'lab',channelRole:'lab',channelKey:labKey,labChannelKey:labKey}),null);
  assert.equal(canonicalTest.canonicalChannelBindingError({groupName:'source',channelRole:'source',channelKey:labKey,labChannelKey:labKey}),'HIPICO_CANONICAL_SOURCE_CHANNEL_NOT_ALLOWED');
  assert.equal(canonicalTest.canonicalChannelBindingError({groupName:'lab',channelRole:'lab',channelKey:sourceKey,labChannelKey:labKey}),'HIPICO_CANONICAL_LAB_CHANNEL_NOT_ALLOWED');
  assert.equal(canonicalTest.canonicalChannelBindingError({groupName:'source',channelRole:'source',channelKey:sourceKey,labChannelKey:'other-lab'}),'HIPICO_CANONICAL_LAB_REFERENCE_NOT_ALLOWED');
});

test('canonical resolve performs role/key binding before any active-channel lookup',()=>{
  const resolveStart=source.indexOf('async function resolveChannel');
  const resolveEnd=source.indexOf('function eventType',resolveStart);
  const resolve=source.slice(resolveStart,resolveEnd);
  const binding=resolve.indexOf('canonicalChannelBindingError(input)');
  const lookup=resolve.indexOf('findActiveWebBridge(groupKey)');
  assert.ok(binding>=0&&lookup>binding);
});