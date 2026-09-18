import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildCanonicalUrl } from '../frontend/api/hipico/canonical-backend.js';
import {
  cleanBaseUrl,
  commandPlan,
  parseCommand,
  redact,
  requestPlan,
  transformResult
} from '../tools/hipico-cli/hipico.mjs';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('#284 MessagingChannel boundary reuses canonical normalized messages and test adapter deduplicates replay without sending', () => {
  const source = read('backend/src/modules/hipico/messaging-channel.ts');
  const contract = read('backend/src/modules/hipico/messaging-channel.test.ts');
  assert.match(source, /HipicoNormalizedMessage/);
  assert.match(source, /class TestChannelAdapter implements MessagingChannel/);
  assert.match(source, /TEST_CHANNEL_RECEIVER_NOT_REGISTERED/);
  assert.match(source, /TEST_CHANNEL_RECEIVER_ALREADY_REGISTERED/);
  assert.match(source, /historySync/);
  assert.match(source, /effectsAllowed:\s*false/);
  assert.doesNotMatch(source, /whatsapp-web\.js|puppeteer|document\.|querySelector/);
  assert.match(contract, /history\/live replay/i);
  assert.match(contract, /deduplic/i);
});

test('#284 serverless linked-device adapter delegates business authority to canonical backend', () => {
  const ingest = read('frontend/api/hipico/group-bridge-ingest.js');
  const proxy = read('frontend/api/hipico/canonical-backend.js');
  assert.match(ingest, /proxyCanonicalRequest/);
  assert.match(ingest, /\/api\/v1\/hipico-bot\/bridge\/events/);
  assert.doesNotMatch(ingest, /supabase\(/);
  assert.doesNotMatch(ingest, /classifyText|shadowSuggestion|recordShadowPrediction/);
  assert.match(proxy, /redirect:\s*'error'/);
  assert.match(proxy, /MAX_PROXY_RESPONSE_BYTES/);
  assert.match(proxy, /HIPICO_CANONICAL_API_BASE_URL/);
});

test('#284 canonical proxy revalidates normalized paths and rejects namespace traversal', () => {
  const source = { HIPICO_CANONICAL_API_BASE_URL: 'https://hipico.example.test', NODE_ENV: 'production' };
  assert.equal(
    buildCanonicalUrl('/api/v1/hipico-bot/bridge/events', source),
    'https://hipico.example.test/api/v1/hipico-bot/bridge/events'
  );
  for (const malicious of [
    '/api/v1/hipico-bot/../../security/csp-report',
    '/api/v1/hipico-bot/%2e%2e/%2e%2e/security/csp-report',
    '/api/v1/hipico/../auth/login'
  ]) {
    assert.throws(
      () => buildCanonicalUrl(malicious, source),
      (error) => error?.code === 'HIPICO_CANONICAL_PATH_NOT_ALLOWED',
      malicious
    );
  }
});

test('#284 CLI command mapping uses only real bounded read surfaces', () => {
  assert.deepEqual(parseCommand(['events', 'tail', '25', '--json', '--group', 'source']), { json: true, group: 'source', command: 'events', subcommand: 'tail', value: '25' });
  assert.equal(commandPlan(parseCommand(['status'])).path, '/api/v1/hipico/system/status');
  assert.equal(commandPlan(parseCommand(['bridge', 'status'])).auth, 'bridge');
  assert.equal(commandPlan(parseCommand(['messages', 'tail', '500', '--group', 'source'])).path, '/api/v1/hipico/messages?limit=100');
  assert.equal(commandPlan(parseCommand(['events', 'tail', '7', '--group', 'source'])).path, '/api/v1/hipico/events?limit=7');
  assert.equal(commandPlan(parseCommand(['trace', 'corr-123', '--group', 'source'])).path, '/api/v1/hipico/trace/corr-123');
});

test('#284 CLI forbids plaintext remote credentials while retaining localhost development', () => {
  assert.equal(cleanBaseUrl('http://127.0.0.1:3030'), 'http://127.0.0.1:3030');
  assert.equal(cleanBaseUrl('https://hipico.example.test'), 'https://hipico.example.test');
  assert.throws(() => cleanBaseUrl('http://hipico.example.test'), (error) => error?.code === 'HIPICO_CLI_REMOTE_HTTP_FORBIDDEN');
  assert.throws(() => cleanBaseUrl('https://user:pass@hipico.example.test'), (error) => error?.code === 'HIPICO_CLI_INVALID_BASE_URL');
});

test('#284 CLI redacts secret-shaped fields and configured token values from stable JSON data', () => {
  const source = {
    HIPICO_GROUP_BRIDGE_TOKEN: 'bridge-secret-1234567890',
    HIPICO_OPERATOR_CONTROL_TOKEN: 'operator-secret-1234567890'
  };
  const safe = redact({
    token: 'should-hide',
    nested: { authorization: 'Bearer abc', text: 'prefix bridge-secret-1234567890 suffix' },
    ok: true
  }, source);
  assert.equal(safe.token, '[REDACTED]');
  assert.equal(safe.nested.authorization, '[REDACTED]');
  assert.equal(safe.nested.text.includes('bridge-secret-1234567890'), false);
  assert.equal(safe.ok, true);
});

test('#284 authenticated CLI request sends operator token only as a header and returns redacted response', async () => {
  const source = { HIPICO_OPERATOR_CONTROL_TOKEN: 'operator-secret-1234567890' };
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ ok: true, data: [{ token: 'provider-token', body: 'operator-secret-1234567890' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  const result = await requestPlan({ path: '/api/v1/hipico-bot/events?limit=2', auth: 'operator' }, {
    source,
    baseUrl: 'https://hipico.example.test',
    fetchImpl
  });
  assert.equal(captured.url, 'https://hipico.example.test/api/v1/hipico-bot/events?limit=2');
  assert.equal(captured.options.headers['x-hipico-operator-token'], source.HIPICO_OPERATOR_CONTROL_TOKEN);
  assert.equal(JSON.stringify(result).includes(source.HIPICO_OPERATOR_CONTROL_TOKEN), false);
  assert.equal(result.data.data[0].token, '[REDACTED]');
});

test('#284 trace and groups transformations remain bounded and do not expose configured group IDs', () => {
  const traced = transformResult({ ok: true, status: 200, data: { data: [
    { id: 1, payload: { correlationId: 'corr-1' } },
    { id: 2, payload: { correlationId: 'corr-2' } }
  ] } }, { transform: 'trace', correlationId: 'corr-2' });
  assert.equal(traced.data.scanned, 2);
  assert.deepEqual(traced.data.matches.map((row) => row.id), [2]);

  const groups = transformResult({ ok: true, status: 200, data: { data: {
    components: { channel: { state: 'degraded', reason: 'CHANNEL_PINNED_NOT_PROBED' } }
  } } }, { transform: 'groups' });
  assert.deepEqual(groups.data, {
    sourceLabPinned: true,
    channelState: 'degraded',
    reason: 'CHANNEL_PINNED_NOT_PROBED'
  });
});

test('#284 Windows daily launcher stays separate from dependency setup', () => {
  const ps = read('HIPICO.ps1');
  const cmd = read('HIPICO.cmd');
  const setup = read('HIPICO-SETUP.ps1');
  assert.match(ps, /tools\\hipico-cli\\hipico\.mjs/);
  assert.match(cmd, /tools\\hipico-cli\\hipico\.mjs/i);
  assert.doesNotMatch(ps, /npm\s+ci/i);
  assert.doesNotMatch(cmd, /npm\s+ci/i);
  assert.match(setup, /hipico-whatsapp-web-bridge\\INICIAR\.ps1/);
  assert.match(setup, /-SetupOnly/);
  assert.match(read('tools/hipico-whatsapp-web-bridge/INICIAR.ps1'), /npmCmd ci --no-fund --no-audit/);
});
