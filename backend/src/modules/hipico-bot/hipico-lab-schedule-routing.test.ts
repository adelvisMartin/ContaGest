import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

test('new LAB schedule queries stay on authenticated existing read-only route',()=>{
  const route=readFileSync(new URL('./hipico-bridge.routes.ts',import.meta.url),'utf8');
  const begin=route.indexOf("router.post('/bridge/lab/query'");
  const end=route.indexOf("router.post('/bridge/events'",begin);
  assert.ok(begin>0&&end>begin);
  const block=route.slice(begin,end);
  const auth=block.indexOf("bridgeTokenValid(req.header('x-hipico-bridge-token')");
  const schema=block.indexOf('labCanonicalQuerySchema.safeParse');
  const group=block.indexOf('validateBridgeGroupIdentity(input)');
  const intent=block.indexOf('isLabInformationRequest(input.text,input.purpose,result)');
  const read=block.indexOf('await readScopedLabSchedule({');
  assert.ok(auth>=0&&schema>auth&&group>schema&&intent>group&&read>intent);
  assert.match(block,/decision\.audit\.monetaryOrStateful/);
  assert.match(block,/decision\.audit\.humanOwned/);
  assert.match(block,/ownerId,groupKey:OFFICIAL_SOURCE_CHANNEL_KEY/);
  assert.match(block,/status:canonical\.reason/);
  assert.match(block,/'version' in canonical&&'updatedAt' in canonical/);
  assert.doesNotMatch(block,/persistBridgeTransportEvent|persistHipicoDomainEvent|ensureSourceReplyOutbox|sendCloudText|responsePlan\.canSend/);
});

test('new schedule purpose never bypasses established SOURCE read-only gate',()=>{
  const code=readFileSync(new URL('./hipico-bridge.routes.ts',import.meta.url),'utf8');
  assert.match(code,/sourceSendPossible:false/);
  const child=readFileSync(new URL('./hipico-lab-schedule-read.ts',import.meta.url),'utf8');
  assert.match(child,/sourceWriteAllowed:false/);
  assert.match(child,/financialAuthority:false/);
  assert.match(child,/domainEffectsAllowed:false/);
  assert.doesNotMatch(child,/\.command\(|createRace\(|createMeeting\(/);
});
