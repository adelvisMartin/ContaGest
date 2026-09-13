import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createCliRuntimeServices } from '../src/cli/runtime-services.mjs';

async function fixture() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hipico-cli-'));
  const trainingDir = path.join(dataDir, 'training');
  await fs.mkdir(trainingDir, { recursive: true });
  const env = {
    HIPICO_RUNTIME_MODE: 'shadow-local',
    HIPICO_DATA_DIR: dataDir,
    HIPICO_SOURCE_GROUP_ID: '120363111111111111@g.us',
    HIPICO_LAB_GROUP_ID: '120363222222222222@g.us',
    HIPICO_SOURCE_CHANNEL_KEY: 'club-hipico-triple-crown-official',
    HIPICO_LAB_CHANNEL_KEY: 'control-hipico-lab',
    HIPICO_LAB_GROUP_NAME: 'Control hipico lab',
    HIPICO_REQUIRE_PINNED_GROUP_IDS: 'true'
  };
  const health = {
    version: '1.4.2',
    timestamp: new Date().toISOString(),
    runtimeMode: 'shadow-local',
    sourceSendPossible: false,
    activeSourceTitle: 'Grupo privado fuente',
    readiness: { ready: true, reasons: [] },
    groupBinding: { required: true, sourceBound: true, labBound: true },
    labSendEnabled: false,
    labTestInputEnabled: false,
    backend: { state: 'local-only', lastReason: null },
    counters: { captured: 2, mirrored: 0, eventSpool: 0, mirrorSpool: 0, deadLetters: 0 }
  };
  await fs.writeFile(path.join(dataDir, 'health.json'), JSON.stringify(health), 'utf8');
  await fs.writeFile(path.join(trainingDir, 'shadow-2026-09-13.jsonl'), `${JSON.stringify({
    recordedAt: new Date().toISOString(),
    sourceMessageKey: 'hash-1',
    timestamp: new Date().toISOString(),
    text: 'mensaje privado 100k',
    mediaKind: 'none',
    local: { intent: 'unknown', risk: 'review', confidence: 0 },
    shadowOnly: true
  })}\n`, 'utf8');
  await fs.writeFile(path.join(dataDir, 'bridge.log'), [
    '[2026-09-13T20:00:00.000Z] HEALTH ready',
    '[2026-09-13T20:00:01.000Z] TRACE hipico-abc-123 120363111111111111@g.us +584121234567 Bearer supersecret'
  ].join('\n'), 'utf8');
  return { dataDir, env };
}

test('runtime CLI services expose readiness without returning raw group identities', async (t) => {
  const { dataDir, env } = await fixture();
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const services = createCliRuntimeServices({ env, cwd: dataDir });
  const status = await services.status();
  assert.equal(status.sourceSendPossible, false);
  assert.equal(status.ready, true);

  const groups = await services.groups();
  const serialized = JSON.stringify(groups);
  assert.equal(groups.sourceSendPossible, false);
  assert.doesNotMatch(serialized, /120363111111111111@g\.us|120363222222222222@g\.us/);
  assert.match(groups.source.id, /…/);
  assert.match(groups.lab.id, /…/);
});

test('messages tail keeps metadata but redacts chat content', async (t) => {
  const { dataDir, env } = await fixture();
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const services = createCliRuntimeServices({ env, cwd: dataDir });
  const messages = await services.messagesTail({ limit: 20 });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, '[CONTENT_REDACTED]');
  assert.equal(messages[0].shadowOnly, true);
  assert.doesNotMatch(JSON.stringify(messages), /mensaje privado|100k/);
});

test('events tail and trace redact bearer tokens, phones and WhatsApp JIDs', async (t) => {
  const { dataDir, env } = await fixture();
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const services = createCliRuntimeServices({ env, cwd: dataDir });
  const events = await services.eventsTail({ limit: 10 });
  const trace = await services.trace({ correlationId: 'hipico-abc-123' });
  assert.equal(trace.length, 1);
  const output = JSON.stringify({ events, trace });
  assert.doesNotMatch(output, /supersecret|584121234567|120363111111111111@g\.us/);
  assert.match(output, /\[REDACTED\]|\[PHONE\]|\[WHATSAPP_ID\]/);
});

test('doctor reports fail-closed safety/readiness facts instead of exposing configuration values', async (t) => {
  const { dataDir, env } = await fixture();
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const services = createCliRuntimeServices({ env, cwd: dataDir });
  const doctor = await services.doctor();
  assert.equal(doctor.sourceSendGuardOk, true);
  assert.equal(doctor.dataDirExists, true);
  assert.equal(doctor.healthExists, true);
  assert.equal(Array.isArray(doctor.configurationErrors), true);
  const output = JSON.stringify(doctor);
  assert.doesNotMatch(output, /120363111111111111@g\.us|Control hipico lab/);
});
