import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('./hipico-canonical-shadow.store.ts',import.meta.url),'utf8');
const start=source.indexOf('async function ensureOfficialSourceChannel');
const end=source.indexOf('async function resolveChannel');
const provision=source.slice(start,end);

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
