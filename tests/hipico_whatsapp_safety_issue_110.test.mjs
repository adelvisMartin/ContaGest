import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizeGroupId,extractGroupIds,assertPinnedGroupIdentity,selectUniqueGroupId,redactGroupId
} from '../tools/hipico-whatsapp-web-bridge/src/group-identity.mjs';
import { loadRuntimeConfig,validateRuntimeConfig } from '../tools/hipico-whatsapp-web-bridge/src/runtime-config.mjs';

const SOURCE='120363111111111111-1111111111@g.us';
const LAB='120363222222222222-2222222222@g.us';

test('DOM wrappers and underscores still resolve the pinned JID only',()=>{
  assert.deepEqual(extractGroupIds(`false_${SOURCE}_ABC`,`data-id=true_${LAB}_XYZ`),[SOURCE,LAB]);
  assert.equal(selectUniqueGroupId([`bad_${SOURCE}_x`,SOURCE],SOURCE),SOURCE);
  assert.equal(normalizeGroupId(`false_${SOURCE}_x`),'');
});

test('LAB identity requires exact ID/title and can never point to SOURCE',()=>{
  assert.equal(assertPinnedGroupIdentity({role:'LAB',expectedId:LAB,expectedTitle:'Control hípico lab',actualId:LAB,actualTitle:'CONTROL HIPICO LAB',sourceId:SOURCE}),true);
  assert.throws(()=>assertPinnedGroupIdentity({role:'LAB',expectedId:LAB,expectedTitle:'Control hípico lab',actualId:SOURCE,actualTitle:'Control hípico lab',sourceId:SOURCE}),/ID_MISMATCH|POINTS_TO_SOURCE/);
  assert.throws(()=>assertPinnedGroupIdentity({role:'LAB',expectedId:LAB,expectedTitle:'Control hípico lab',actualId:LAB,actualTitle:'Club hípico real',sourceId:SOURCE}),/TITLE_MISMATCH/);
});

test('production LAB writes require two distinct pinned group IDs',()=>{
  const base={
    HIPICO_RUNTIME_MODE:'production',HIPICO_BACKEND_SYNC_ENABLED:'true',HIPICO_INGEST_URL:'https://example.test/events',
    HIPICO_BRIDGE_HEALTH_URL:'https://example.test/health',HIPICO_GROUP_BRIDGE_TOKEN:'x'.repeat(40),
    HIPICO_SOURCE_GROUP_MATCH:'Club real',HIPICO_LAB_GROUP_NAME:'Control hípico lab',HIPICO_REQUIRE_PINNED_GROUP_IDS:'true',
    HIPICO_LAB_SEND_ENABLED:'true',HIPICO_SOURCE_GROUP_ID:SOURCE,HIPICO_LAB_GROUP_ID:LAB
  };
  assert.deepEqual(validateRuntimeConfig(loadRuntimeConfig(base,'/tmp')),[]);
  const same=loadRuntimeConfig({...base,HIPICO_LAB_GROUP_ID:SOURCE},'/tmp');
  assert.ok(validateRuntimeConfig(same).some((error)=>/deben ser distintos/i.test(error)));
  const missing=loadRuntimeConfig({...base,HIPICO_LAB_GROUP_ID:''},'/tmp');
  assert.ok(validateRuntimeConfig(missing).some((error)=>/LAB.*pinneado/i.test(error)));
});

test('runtime exposes no SOURCE compose route and LAB send revalidates identity before write',async()=>{
  const source=await readFile(new URL('../tools/hipico-whatsapp-web-bridge/src/index.mjs',import.meta.url),'utf8');
  assert.match(source,/sourceSendPossible:\s*false/);
  assert.match(source,/async function sendMirrorToLab\(/);
  assert.match(source,/await assertCurrentLabIdentity\(\)/);
  assert.doesNotMatch(source,/function\s+send(?:Message|Text|Mirror)ToSource\s*\(/i);
  assert.match(source,/FUENTE: SOLO LECTURA/);
});

test('group identifiers are redacted for diagnostics',()=>{
  const redacted=redactGroupId(SOURCE);
  assert.notEqual(redacted,SOURCE);
  assert.match(redacted,/…/);
  assert.ok(!redacted.includes(SOURCE.split('@')[0]));
});
