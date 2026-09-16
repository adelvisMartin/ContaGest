import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  cleanBaseUrl,
  commandPlan,
  parseCommand,
  redact
} from '../tools/hipico-cli/hipico.mjs';

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('serverless messaging adapters delegate to canonical backend instead of owning business logic', () => {
  for (const source of [
    read('../frontend/api/hipico/group-bridge-ingest.js'),
    read('../frontend/api/hipico/whatsapp-webhook.js')
  ]) {
    assert.match(source, /proxyCanonicalRequest/);
    assert.doesNotMatch(source, /classifyText\s*\(/);
    assert.doesNotMatch(source, /supabase\s*\(/);
  }
});

test('canonical MessagingChannel remains transport-only and TestChannelAdapter is deterministic', () => {
  const channel = read('../backend/src/modules/hipico/messaging-channel.ts');
  const channelTests = read('../backend/src/modules/hipico/messaging-channel.test.ts');

  assert.match(channel, /export interface MessagingChannel/);
  for (const method of ['connect', 'disconnect', 'status', 'receive', 'send']) {
    assert.match(channel, new RegExp(`${method}\\(`));
  }
  assert.match(channel, /export class TestChannelAdapter implements MessagingChannel/);
  assert.match(channel, /hipicoNormalizedMessageSchema\.parse\(input\)/);
  assert.match(channel, /TEST_CHANNEL_RECEIVER_ALREADY_REGISTERED/);
  assert.match(channel, /this\.seen\.has\(key\)/);
  assert.doesNotMatch(channel, /classif|settlement|supabase|persistHipico|raceState/i);
  assert.match(channelTests, /history\/live replay is deduplicated/);
  assert.match(channelTests, /receiving history must never auto-send/);
});

test('canonical bridge suppresses LAB simulation for replayed and duplicate events', () => {
  const route = read('../backend/src/modules/hipico-bot/hipico-bridge.routes.ts');
  assert.match(route, /if\(input\.channelRole!==['"]source['"]\|\|input\.historySync\)return null/);
  assert.match(route, /labSimulation:event\.inserted\?buildLabSimulation\([^)]*\):null/);
});

test('Windows setup and daily launcher are separated on the operational web bridge', () => {
  const setup = read('../HIPICO-SETUP.ps1');
  const daily = read('../INICIAR-HIPICO-WHATSAPP.cmd');
  const launcher = read('../tools/hipico-whatsapp-web-bridge/INICIAR.ps1');

  assert.match(setup, /hipico-whatsapp-web-bridge\\INICIAR\.ps1/);
  assert.match(setup, /-SetupOnly/);
  assert.match(daily, /hipico-whatsapp-web-bridge\\INICIAR\.ps1/);
  assert.doesNotMatch(daily, /npm\s+ci/i);
  assert.match(launcher, /if \(\$SetupOnly\) \{/);
  assert.match(launcher, /npmCmd ci --no-fund --no-audit/);
  assert.match(launcher, /Dependencias no instaladas\. Ejecuta primero HIPICO-SETUP\.ps1/);
});

test('CLI maps the required commands and preserves a stable json flag', () => {
  assert.deepEqual(parseCommand(['bridge', 'status', '--json']), {
    json: true,
    group: '',
    command: 'bridge',
    subcommand: 'status',
    value: ''
  });
  assert.equal(commandPlan(parseCommand(['status'])).path, '/api/v1/hipico/system/status');
  assert.equal(commandPlan(parseCommand(['doctor'])).local, 'doctor');
  assert.equal(commandPlan(parseCommand(['health'])).path, '/api/v1/hipico/system/readiness');
  assert.equal(commandPlan(parseCommand(['version'])).path, '/api/v1/hipico/system/version');
  assert.equal(commandPlan(parseCommand(['channel', 'status'])).transform, 'channel');
  assert.equal(commandPlan(parseCommand(['groups'])).path, '/api/v1/hipico/groups');
  assert.equal(commandPlan(parseCommand(['messages', 'tail', '25', '--group', 'source']))?.path, '/api/v1/hipico/messages?limit=25');
  assert.equal(commandPlan(parseCommand(['events', 'tail', '25', '--group', 'source']))?.path, '/api/v1/hipico/events?limit=25');
  assert.equal(commandPlan(parseCommand(['trace', 'corr-123', '--group', 'source']))?.path, '/api/v1/hipico/trace/corr-123');
});

test('CLI fails closed for malformed trace ids and unsafe remote HTTP', () => {
  assert.equal(commandPlan(parseCommand(['trace', '../../secret']))?.local, 'invalid-trace');
  assert.throws(() => cleanBaseUrl('http://example.com'), /HIPICO_CLI_REMOTE_HTTP_FORBIDDEN/);
  assert.equal(cleanBaseUrl('http://127.0.0.1:3030'), 'http://127.0.0.1:3030');
});

test('CLI redaction removes secret fields and configured secret values from json-safe output', () => {
  const source = {
    HIPICO_GROUP_BRIDGE_TOKEN: 'bridge-secret-value-1234567890',
    HIPICO_OPERATOR_CONTROL_TOKEN: 'operator-secret-value-1234567890'
  };
  const safe = redact({
    token: 'raw-token',
    nested: { password: 'raw-password' },
    message: `prefix ${source.HIPICO_GROUP_BRIDGE_TOKEN} suffix`
  }, source);
  const serialized = JSON.stringify(safe);

  assert.equal(safe.token, '[REDACTED]');
  assert.equal(safe.nested.password, '[REDACTED]');
  assert.doesNotMatch(serialized, /bridge-secret-value-1234567890/);
  assert.doesNotMatch(serialized, /operator-secret-value-1234567890/);
});
