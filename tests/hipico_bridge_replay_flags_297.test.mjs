import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test__ } from '../frontend/api/hipico/group-bridge-ingest.js';

const bridgeSource = await readFile(new URL('../frontend/api/hipico/group-bridge-ingest.js', import.meta.url), 'utf8');

const base = {
  senderId: '584121234567',
  timestamp: '2026-09-11T06:00:00.000Z',
  type: 'chat',
  text: 'Juego 1N del 5 con 100k',
  quotedExternalMessageId: 'origin-1',
  fromMe: false,
  hasMedia: false,
  historySync: false
};

test('serverless bridge accepts only explicit ISO-8601 timestamps with timezone and valid calendar fields', () => {
  assert.equal(__test__.normalizedTimestamp('2026-09-11T06:00:00Z'), '2026-09-11T06:00:00.000Z');
  assert.equal(__test__.normalizedTimestamp('2026-09-11T01:00:00-05:00'), '2026-09-11T06:00:00.000Z');
  assert.equal(__test__.normalizedTimestamp('2024-02-29T23:59:59.123456Z'), '2024-02-29T23:59:59.123Z');
  assert.equal(__test__.normalizedTimestamp('2026-09-11T11:30:00+05:30'), '2026-09-11T06:00:00.000Z');

  for (const invalid of [
    '2026-09-11',
    '2026-09-11T06:00:00',
    '2026-09-11 06:00:00Z',
    '09/11/2026 06:00:00',
    '2026-02-29T06:00:00Z',
    '2026-02-31T06:00:00Z',
    '2026-13-01T06:00:00Z',
    '2026-09-11T24:00:00Z',
    '2026-09-11T06:60:00Z',
    '2026-09-11T06:00:60Z',
    '2026-09-11T06:00:00+14:30',
    '2026-09-11T06:00:00+15:00'
  ]) assert.equal(__test__.normalizedTimestamp(invalid), undefined, invalid);
});

test('serverless bridge replay signature binds sender instant body quote and behavior-changing transport flags', () => {
  const sameInstant = { ...base, timestamp: '2026-09-11T01:00:00-05:00' };
  assert.equal(__test__.sourceReplaySignature(base), __test__.sourceReplaySignature(sameInstant));
  assert.notEqual(__test__.sourceReplaySignature(base), __test__.sourceReplaySignature({ ...base, fromMe: true }));
  assert.notEqual(__test__.sourceReplaySignature(base), __test__.sourceReplaySignature({ ...base, hasMedia: true }));
  assert.notEqual(__test__.sourceReplaySignature(base), __test__.sourceReplaySignature({ ...base, historySync: true }));
  assert.notEqual(__test__.sourceReplaySignature(base), __test__.sourceReplaySignature({ ...base, text: 'Juego 1N del 5 con 300k' }));
  assert.notEqual(__test__.sourceReplaySignature(base), __test__.sourceReplaySignature({ ...base, quotedExternalMessageId: 'origin-2' }));
});

test('bridge adapter forwards normalized replay evidence to canonical backend and owns no persisted replay authority', () => {
  assert.match(bridgeSource, /proxyCanonicalRequest/);
  assert.match(bridgeSource, /\/api\/v1\/hipico-bot\/bridge\/events/);
  assert.match(bridgeSource, /historySync:\s*body\.historySync === true/);
  assert.match(bridgeSource, /fromMe:\s*body\.fromMe === true/);
  assert.match(bridgeSource, /hasMedia:\s*body\.hasMedia === true/);
  assert.match(bridgeSource, /rawMeta:\s*`serverless-compat:\$\{sourceReplaySignature\(body\)\.slice\(0, 24\)\}`/);
  assert.doesNotMatch(bridgeSource, /persistedReplaySignature/);
  assert.doesNotMatch(bridgeSource, /hipico_messages|hipico_ledger_entries|storedClassification|adapterCaptureDecision/);
});
