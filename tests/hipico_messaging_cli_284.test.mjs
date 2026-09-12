import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCommand, commandRequest } from '../tools/hipico-cli/hipico.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const groupAdapter = read('../frontend/api/hipico/group-bridge-ingest.js');
const metaAdapter = read('../frontend/api/hipico/whatsapp-webhook.js');
const shared = read('../frontend/api/hipico/_shared.js');

void test('serverless messaging adapters delegate instead of classifying or persisting business events', () => {
  for (const source of [groupAdapter, metaAdapter]) {
    assert.match(source, /proxyCanonicalRequest/);
    assert.doesNotMatch(source, /classifyText/);
    assert.doesNotMatch(source, /supabase\(/);
  }
  assert.doesNotMatch(shared, /export function classifyText/);
  assert.doesNotMatch(shared, /adapterCaptureDecision/);
});

void test('CLI maps stable commands and json flag', () => {
  assert.deepEqual(parseCommand(['bridge', 'status', '--json']), { json: true, command: 'bridge', subcommand: 'status', value: '' });
  assert.deepEqual(commandRequest(parseCommand(['status'])), ['/api/v1/hipico/system/status', 'GET']);
  assert.deepEqual(commandRequest(parseCommand(['trace', 'corr-123'])), ['/api/v1/hipico/trace/corr-123', 'GET']);
});

void test('CLI rejects malformed trace identifiers', () => {
  assert.throws(() => commandRequest(parseCommand(['trace', '../../secret'])), /HIPICO_CLI_INVALID_TRACE_ID/);
});
