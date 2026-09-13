import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCommand, commandRequest } from '../tools/hipico-cli/hipico.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const groupAdapter = read('../frontend/api/hipico/group-bridge-ingest.js');
const metaAdapter = read('../frontend/api/hipico/whatsapp-webhook.js');
const shared = read('../frontend/api/hipico/_shared.js');
const systemRoutes = read('../backend/src/modules/hipico/hipico-system.routes.ts');

void test('serverless messaging adapters delegate instead of classifying or persisting business events', () => {
  for (const source of [groupAdapter, metaAdapter]) {
    assert.match(source, /proxyCanonicalRequest/);
    assert.doesNotMatch(source, /classifyText/);
    assert.doesNotMatch(source, /supabase\(/);
  }
  assert.doesNotMatch(shared, /export function classifyText/);
  assert.doesNotMatch(shared, /adapterCaptureDecision/);
});

void test('CLI maps current canonical endpoints and keeps operator auth on system status', () => {
  const parsed = parseCommand(['bridge', 'status', '--json', '--limit', '999']);
  assert.equal(parsed.json, true);
  assert.equal(parsed.command, 'bridge');
  assert.equal(parsed.subcommand, 'status');
  assert.equal(parsed.limit, 200);

  assert.deepEqual(commandRequest(parseCommand(['status'])), ['/api/v1/hipico/status', 'GET', 'operator']);
  assert.deepEqual(commandRequest(parseCommand(['readiness'])), ['/api/v1/hipico/readiness', 'GET', 'operator']);
  assert.deepEqual(commandRequest(parseCommand(['version'])), ['/api/v1/hipico/version', 'GET', 'operator']);
  assert.deepEqual(commandRequest(parseCommand(['trace', 'corr-123'])), ['/api/v1/hipico/trace/corr-123', 'GET', 'operator-group']);
  assert.match(systemRoutes, /operatorTokenValid/);
});

void test('CLI rejects malformed trace identifiers and never accepts tokens as command-line flags', () => {
  assert.throws(() => commandRequest(parseCommand(['trace', '../../secret'])), /HIPICO_CLI_INVALID_TRACE_ID/);
  const source = read('../tools/hipico-cli/hipico.mjs');
  assert.doesNotMatch(source, /--(?:operator|bridge)-token/);
  assert.match(source, /HIPICO_CLI_REMOTE_HTTP_FORBIDDEN/);
  assert.match(source, /HIPICO_CLI_BASE_PATH_FORBIDDEN/);
});
