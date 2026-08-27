import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildSupportBundle,
  classifyHealth,
  deriveOperationalMetrics,
  inspectSpoolHealth,
  redactDiagnostic,
  rotateFileIfNeeded,
  sha256Text,
  structuredLog
} from '../src/observability.mjs';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'hipico-observability-'));
}

test('redaction removes bearer, signed urls, phone numbers, group ids and secret keys', () => {
  const safe = redactDiagnostic({
    token: 'super-secret',
    message: 'Bearer abc.def.ghi +58 412 123 4567 1234567890-123456@g.us',
    url: 'https://example.test/a?token=secret&expires=9'
  });
  const text = JSON.stringify(safe);
  assert.equal(safe.token, '[REDACTED]');
  assert.match(text, /Bearer \[REDACTED\]/);
  assert.match(text, /\[PHONE\]/);
  assert.match(text, /\[GROUP_ID\]/);
  assert.match(text, /\[SIGNED_URL_REDACTED\]/);
  assert.doesNotMatch(text, /super-secret|abc\.def\.ghi|1234567890-123456@g\.us/);
});

test('structured logs always include component version sha and correlation id without leaking secrets', () => {
  const row = JSON.parse(structuredLog({
    component: 'bridge', version: '1.4.2', sha: 'abcdef', correlationId: 'cid-1', event: 'LAB_SEND_FAILED',
    data: { authorization: 'Bearer secret', phone: '+58 424 555 1212' }
  }));
  assert.equal(row.component, 'bridge');
  assert.equal(row.version, '1.4.2');
  assert.equal(row.sha, 'abcdef');
  assert.equal(row.correlationId, 'cid-1');
  assert.equal(row.data.authorization, '[REDACTED]');
  assert.equal(row.data.phone, '[PHONE]');
});

test('health distinguishes live, degraded and down and flags old backlog', () => {
  const now = Date.parse('2026-08-27T21:00:00.000Z');
  const base = {
    timestamp: '2026-08-27T20:59:50.000Z', sourceSendPossible: false,
    readiness: { ready: true }, activeSourceTitle: 'SOURCE', labSendEnabled: true,
    groupBinding: { labBound: true }, backend: { state: 'online' }, browser: { state: 'ready' },
    spool: { oldestQueuedAgeMs: 0 }
  };
  assert.equal(classifyHealth(base, { now }).state, 'live');
  assert.equal(classifyHealth({ ...base, spool: { oldestQueuedAgeMs: 900000 } }, { now }).state, 'degraded');
  assert.equal(classifyHealth({ ...base, sourceSendPossible: true }, { now }).state, 'down');
  assert.equal(classifyHealth({ ...base, timestamp: '2026-08-27T20:00:00.000Z' }, { now }).state, 'down');
});

test('operational metrics make pending and failure counts explicit', () => {
  assert.deepEqual(deriveOperationalMetrics({
    counters: { captured: 10, parsed: 9, ambiguous: 2, mirrored: 5, eventSpool: 3, mirrorSpool: 4, deadLetters: 1 },
    metrics: { latencyMs: 120, backlogAgeMs: 333 }
  }), {
    captured: 10, parsed: 9, ambiguous: 2, labSent: 5, pending: 7, failed: 1,
    parseRate: 0.9, latencyMs: 120, backlogAgeMs: 333
  });
});

test('spool inspection reports oldest queue age and dead-letter warning', async () => {
  const root = await tempDir();
  const eventDir = path.join(root, 'events'); const mirrorDir = path.join(root, 'mirrors'); const dead = path.join(root, 'dead');
  await Promise.all([eventDir, mirrorDir, dead].map((dir) => fs.mkdir(dir)));
  await fs.writeFile(path.join(eventDir, 'a.json'), '{}');
  await fs.writeFile(path.join(dead, 'x.json'), '{}');
  const health = await inspectSpoolHealth({ eventDir, mirrorDir, deadLetterDir: dead, warnAgeMs: 0 });
  assert.equal(health.eventQueued, 1);
  assert.equal(health.deadLetters, 1);
  assert.equal(health.warning, true);
});

test('rotation caps an oversized log and preserves numbered history', async () => {
  const root = await tempDir(); const file = path.join(root, 'bridge.log');
  await fs.writeFile(file, 'x'.repeat(128));
  const result = await rotateFileIfNeeded(file, { maxBytes: 32, keep: 3 });
  assert.equal(result.rotated, true);
  assert.equal(await fs.readFile(`${file}.1`, 'utf8'), 'x'.repeat(128));
  await assert.rejects(() => fs.stat(file));
});

test('support bundle is allow-listed, immutable per destination and hash-verifiable', async () => {
  const root = await tempDir(); const dataDir = path.join(root, 'data'); const outDir = path.join(root, 'bundle');
  await fs.mkdir(dataDir); await fs.mkdir(outDir);
  await fs.writeFile(path.join(dataDir, 'health.json'), JSON.stringify({ token: 'secret', phone: '+58 412 123 4567', group: '1234567890-999@g.us' }));
  await fs.writeFile(path.join(dataDir, 'retry-state.json'), JSON.stringify({ state: 'ok' }));
  await fs.writeFile(path.join(dataDir, 'bridge.log'), 'Bearer abcdef +58 414 999 0000 1234567890-777@g.us');
  await fs.writeFile(path.join(dataDir, 'session-secret.json'), '{"cookie":"DO_NOT_COPY"}');

  const manifest = await buildSupportBundle({ dataDir, outDir, version: '1.4.2', sha: 'candidate-sha' });
  assert.equal(manifest.sha, 'candidate-sha');
  assert.equal(manifest.files.some((file) => file.name === 'session-secret.json'), false);
  const health = await fs.readFile(path.join(outDir, 'health.json'), 'utf8');
  const log = await fs.readFile(path.join(outDir, 'bridge-tail.log'), 'utf8');
  assert.doesNotMatch(health + log, /secret|abcdef|1234567890-|\+58/);
  for (const item of manifest.files) {
    const content = await fs.readFile(path.join(outDir, item.name), 'utf8');
    assert.equal(sha256Text(content), item.sha256);
  }
  await assert.rejects(() => buildSupportBundle({ dataDir, outDir, version: '1.4.2', sha: 'candidate-sha' }), /SUPPORT_TARGET_EXISTS/);
  await assert.rejects(() => buildSupportBundle({ dataDir, outDir: path.join(root, 'bad'), allowlist: ['session-secret.json'] }), /NOT_ALLOWLISTED/);
});
