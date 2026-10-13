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

test('#665 public examples reject embedded URL credentials without exposing their values', () => {
  const secrets = [
    'postgres://operator:secret@db.example.test:5432/hipico',
    'https://operator:secret@api.example.test/v1',
    'mongodb+srv://operator:secret@cluster.example.test/hipico',
    'redis://:secret@localhost:6379/0'
  ];
  for (const secret of secrets) {
    const result = check({ frontend: frontend + '\nVITE_HIPICO_ENDPOINT=' + secret });
    assert.equal(result.status, 'FAIL');
    assert.ok(result.findings.some(f => f.code === 'PUBLIC_SECRET_VALUE' && f.key === 'VITE_HIPICO_ENDPOINT'));
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(JSON.stringify(result).includes('operator'), false);
  }
});
test('#665 public non-credentialed endpoints remain allowed', () => {
  for (const url of ['https://api.example.test/v1', 'postgres://db.example.test:5432/hipico']) {
    const result = check({ frontend: frontend + '\nVITE_HIPICO_ENDPOINT=' + url });
    assert.equal(result.status, 'PASS', url);
  }
});

test('#665 rejects embedded URL query and fragment credentials without logging secrets', () => {
  const secretUrls = [
    'https://api.example.test/v1?access_token=dummy-secret',
    'https://api.example.test/v1?client-secret=dummy-secret',
    'https://api.example.test/v1?API_KEY=dummy-secret',
    'https://api.example.test/v1#refresh_token=dummy-secret',
    'https://api.example.test/#/callback?access_token=dummy-secret',
    '/?auth=dummy-secret',
    '//operator:dummy-secret@api.example.test/v1',
    '?access_token=dummy-secret',
    '#id_token=dummy-secret',
    './callback?session_token=dummy-secret',
    '../login#authorization_code=dummy-secret'
  ];
  for (const url of secretUrls) {
    const result = check({ frontend: frontend + '\nVITE_HIPICO_ENDPOINT=' + url });
    assert.equal(result.status, 'FAIL', url.replace(/dummy-secret/g, '<redacted>'));
    assert.ok(result.findings.some(f => f.code === 'PUBLIC_SECRET_VALUE' && f.key === 'VITE_HIPICO_ENDPOINT'));
    assert.doesNotMatch(JSON.stringify(result), /dummy-secret|operator|access_token|client-secret/i);
  }
});

test('#665 permits harmless URL parameters and empty credentials', () => {
  const safeUrls = [
    'https://api.example.test/v1?module=login',
    'https://api.example.test/v1#documentation',
    'https://api.example.test/?token=',
    '/?module=login',
    '/#/landing?module=login',
    '?module=login',
    '#/callback?module=login',
    './index.html?sort=date'
  ];
  for (const url of safeUrls) {
    assert.deepEqual(check({ frontend: frontend + '\nVITE_HIPICO_ENDPOINT=' + url }), { status: 'PASS', findings: [] });
  }
});


test('#665 public URL userinfo with comments and spacing stays secret', () => {
  const credential = 'https://operator:private-password@api.example.test/v1';
  for (const value of [
    credential + ' # note',
    '"' + credential + '" # note',
    "'" + credential + "' # note",
    '"' + credential + '" # comment with "quoted" text'
  ]) {
    for (const prefix of ['VITE_TARGET=', 'VITE_TARGET = ', 'export VITE_TARGET = ']) {
      const report = check({ frontend: frontend + '\n' + prefix + value });
      assert.ok(report.findings.some(f => f.code === 'PUBLIC_SECRET_VALUE' && f.key === 'VITE_TARGET'));
      assert.doesNotMatch(JSON.stringify(report), /operator|private-password/);
    }
  }
});

test('#665 public JWT with Supabase service_role is denied regardless of env variable name', () => {
  const jwt = role => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    return encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ role, aud: 'authenticated' }) + '.fixture';
  };
  for (const key of ['VITE_SUPABASE_ANON_KEY', 'VITE_PUBLIC_SETTINGS']) {
    const value = key === 'VITE_SUPABASE_ANON_KEY'
      ? frontend.replace('VITE_SUPABASE_ANON_KEY=replace_me', 'VITE_SUPABASE_ANON_KEY="' + jwt('service_role') + '" # comment')
      : frontend + '\nVITE_PUBLIC_SETTINGS="' + jwt('service_role') + '" # comment';
    const report = check({ frontend: value });
    assert.ok(report.findings.some(f => f.code === 'PUBLIC_PRIVILEGED_JWT' && f.key === key));
    assert.doesNotMatch(JSON.stringify(report), /service_role|fixture/);
  }
  const anon = check({ frontend: frontend.replace('VITE_SUPABASE_ANON_KEY=replace_me',
    'VITE_SUPABASE_ANON_KEY=' + jwt('authenticated')) });
  assert.equal(anon.status, 'PASS');
});

test('#665 quoted dotenv comments preserve internal hashes and allowed URLs', () => {
  const values = parseEnvTemplate([
    'VITE_API="https://api.example.test/v1#fragment" # note',
    "VITE_HEADING='Demo #1' # note",
    'VITE_RAW=https://api.example.test/v1#fragment # note',
    'VITE_DEMO="http://example.test/#user-guide" # a note with "quotes"'
  ].join('\n')).vars;
  assert.equal(values.get('VITE_API'), 'https://api.example.test/v1#fragment');
  assert.equal(values.get('VITE_HEADING'), 'Demo #1');
  assert.equal(values.get('VITE_RAW'), 'https://api.example.test/v1#fragment');
  assert.equal(values.get('VITE_DEMO'), 'http://example.test/#user-guide');
  assert.equal(parseEnvTemplate('HIPICO_SOURCE_AUTO_REPLY_ENABLED = false').vars.get('HIPICO_SOURCE_AUTO_REPLY_ENABLED'), 'false');
});
