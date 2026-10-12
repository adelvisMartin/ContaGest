import test from 'node:test';
import assert from 'node:assert/strict';
import { checkHipicoConfigTemplates, parseEnvTemplate } from '../scripts/hipico-config-contract-v665.mjs';

const backend = [
  'HIPICO_SOURCE_AUTO_REPLY_ENABLED=false', 'HIPICO_CLOUD_SEND_ENABLED=false', 'HIPICO_OUTBOX_WORKER_ENABLED=false',
  'HIPICO_WHATSAPP_COMPLIANCE_DECISION=', 'HIPICO_SOURCE_GROUP_ID=', 'HIPICO_LAB_GROUP_ID=', 'HIPICO_GROUP_BRIDGE_TOKEN=',
  'HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY=source-main', 'HIPICO_LAB_CHANNEL_KEY=lab-one'
].join('\n');
const bridge = [
  'HIPICO_SOURCE_AUTO_REPLY_ENABLED=false', 'HIPICO_LAB_SEND_ENABLED=false', 'HIPICO_LAB_TEST_INPUT_ENABLED=false',
  'HIPICO_REQUIRE_PINNED_GROUP_IDS=true', 'HIPICO_TRANSPORT_ADAPTER=playwright-web', 'HIPICO_SOURCE_GROUP_ID=',
  'HIPICO_LAB_GROUP_ID=', 'HIPICO_GROUP_BRIDGE_TOKEN=', 'HIPICO_SOURCE_CHANNEL_KEY=source-main',
  'HIPICO_LAB_CHANNEL_KEY=lab-one'
].join('\n');
const frontend = 'VITE_SUPABASE_ANON_KEY=replace_me\nVITE_API_BASE_URL=http://localhost:3030/api/v1';
const templates = { backend, bridge, frontend };
const check = (changes = {}) => checkHipicoConfigTemplates({ ...templates, ...changes });

test('#665 Hípico baseline: templates are fail-closed and channels agree', () => {
  assert.deepEqual(check(), { status: 'PASS', findings: [] });
});
test('#665 rejects dangerous outbound defaults on either process', () => {
  assert.equal(check({ backend: backend.replace('HIPICO_CLOUD_SEND_ENABLED=false', 'HIPICO_CLOUD_SEND_ENABLED=true') }).status, 'FAIL');
  assert.ok(check({ bridge: bridge.replace('HIPICO_SOURCE_AUTO_REPLY_ENABLED=false', 'HIPICO_SOURCE_AUTO_REPLY_ENABLED=true') }).findings.some(f => f.code === 'UNSAFE_DEFAULT'));
  assert.equal(check({ bridge: bridge.replace('HIPICO_LAB_SEND_ENABLED=false', 'HIPICO_LAB_SEND_ENABLED=true') }).status, 'FAIL');
});
test('#665 rejects channel drift, prefilled group IDs and unsafe pinning', () => {
  assert.ok(check({ bridge: bridge.replace('HIPICO_SOURCE_CHANNEL_KEY=source-main', 'HIPICO_SOURCE_CHANNEL_KEY=other') }).findings.some(f => f.code === 'CHANNEL_KEY_MISMATCH'));
  assert.equal(check({ backend: backend.replace('HIPICO_LAB_GROUP_ID=', 'HIPICO_LAB_GROUP_ID=123@g.us') }).status, 'FAIL');
  assert.equal(check({ bridge: bridge.replace('HIPICO_REQUIRE_PINNED_GROUP_IDS=true', 'HIPICO_REQUIRE_PINNED_GROUP_IDS=false') }).status, 'FAIL');
});
test('#665 detects duplicate template keys and public secret exposure', () => {
  assert.deepEqual(parseEnvTemplate('A=one\nA=two').duplicates, [{ key: 'A', line: 2 }]);
  const result = check({ frontend: frontend + '\nVITE_HIPICO_SERVICE_ROLE_KEY=abc\nVITE_X=sb_secret_unsafe' });
  assert.ok(result.findings.some(f => f.code === 'PUBLIC_SECRET_KEY'));
  assert.ok(result.findings.some(f => f.code === 'PUBLIC_SECRET_VALUE'));
});
test('#665 diagnostics contain no secret values', () => {
  const secret = 'unpublished-secret-value';
  const result = check({ bridge: bridge.replace('HIPICO_GROUP_BRIDGE_TOKEN=', 'HIPICO_GROUP_BRIDGE_TOKEN=' + secret) });
  assert.equal(result.status, 'FAIL');
  assert.ok(!JSON.stringify(result).includes(secret));
});
