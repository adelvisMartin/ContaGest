import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCliArgs } from '../src/cli/command-parser.mjs';
import { createCliEnvelope, formatCliOutput } from '../src/cli/output.mjs';
import { runCli } from '../src/cli/hipico-cli.mjs';

const commands = [
  [['status'], 'status'],
  [['doctor'], 'doctor'],
  [['health'], 'health'],
  [['version'], 'version'],
  [['bridge', 'status'], 'bridge status'],
  [['channel', 'status'], 'channel status'],
  [['groups'], 'groups'],
  [['messages', 'tail'], 'messages tail'],
  [['events', 'tail'], 'events tail'],
  [['trace', 'hipico-abc-123'], 'trace']
];

test('CLI parser supports the #284 operational command surface and global --json', () => {
  for (const [argv, command] of commands) {
    const parsed = parseCliArgs([...argv, '--json']);
    assert.equal(parsed.command, command);
    assert.equal(parsed.json, true);
  }
  assert.equal(parseCliArgs(['messages', 'tail']).limit, 20);
  assert.equal(parseCliArgs(['messages', 'tail', '--limit', '50']).limit, 50);
  assert.equal(parseCliArgs(['events', 'tail', '--limit=200']).limit, 200);
  assert.equal(parseCliArgs(['trace', 'hipico-abc-123']).correlationId, 'hipico-abc-123');
});

test('CLI parser rejects unsafe/unknown commands and never exposes a send command', () => {
  for (const argv of [
    [],
    ['send'],
    ['source', 'send'],
    ['messages', 'tail', '--limit', '0'],
    ['events', 'tail', '--limit', '201'],
    ['trace'],
    ['trace', '../secret'],
    ['trace', 'bad\nvalue'],
    ['health', '--unknown']
  ]) {
    assert.throws(() => parseCliArgs(argv), (error) => error?.code === 'HIPICO_CLI_USAGE');
  }
});

test('JSON output is stable, versioned and centrally redacts secrets/content/WhatsApp identities', () => {
  const envelope = createCliEnvelope({
    ok: true,
    command: 'status',
    data: {
      token: 'top-secret-token',
      groupId: '120363123456789012@g.us',
      phone: '+584121234567',
      text: 'mensaje privado',
      nested: { authorization: 'Bearer abcdefghijklmnopqrstuvwxyz' },
      state: 'ready'
    }
  });
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.command, 'status');
  assert.equal(envelope.data.token, '[REDACTED]');
  assert.match(String(envelope.data.groupId), /^\[IDENTITY:/);
  assert.equal(envelope.data.text, '[CONTENT_REDACTED]');
  assert.equal(envelope.data.nested.authorization, '[REDACTED]');
  assert.equal(envelope.data.state, 'ready');

  const output = formatCliOutput(envelope, { json: true });
  const parsed = JSON.parse(output);
  assert.deepEqual(parsed, envelope);
  assert.doesNotMatch(output, /top-secret|120363123456789012@g\.us|584121234567|mensaje privado|Bearer abc/);
});

test('runCli routes read-only commands through injected services and never mutates transport', async () => {
  const calls = [];
  const services = {
    status: async () => (calls.push('status'), { state: 'ready' }),
    doctor: async () => (calls.push('doctor'), { ok: true }),
    health: async () => (calls.push('health'), { ready: true }),
    version: async () => (calls.push('version'), { version: '1.4.2' }),
    bridgeStatus: async () => (calls.push('bridgeStatus'), { backlog: 0 }),
    channelStatus: async () => (calls.push('channelStatus'), { sourceSendPossible: false }),
    groups: async () => (calls.push('groups'), { sourceBound: true, labBound: true }),
    messagesTail: async ({ limit }) => (calls.push(`messages:${limit}`), [{ id: 'm1', text: 'secret message' }]),
    eventsTail: async ({ limit }) => (calls.push(`events:${limit}`), [{ event: 'queued' }]),
    trace: async ({ correlationId }) => (calls.push(`trace:${correlationId}`), [{ correlationId, token: 'hidden' }])
  };

  const cases = [
    [['status'], 'status'],
    [['doctor'], 'doctor'],
    [['health'], 'health'],
    [['version'], 'version'],
    [['bridge', 'status'], 'bridgeStatus'],
    [['channel', 'status'], 'channelStatus'],
    [['groups'], 'groups'],
    [['messages', 'tail', '--limit', '7'], 'messages:7'],
    [['events', 'tail', '--limit=8'], 'events:8'],
    [['trace', 'hipico-xyz'], 'trace:hipico-xyz']
  ];

  for (const [argv, expectedCall] of cases) {
    const before = calls.length;
    const result = await runCli([...argv, '--json'], services);
    assert.equal(result.exitCode, 0);
    assert.equal(calls[before], expectedCall);
    assert.equal(JSON.parse(result.output).ok, true);
  }

  const messageResult = await runCli(['messages', 'tail', '--limit', '1', '--json'], services);
  assert.doesNotMatch(messageResult.output, /secret message/);
  const traceResult = await runCli(['trace', 'hipico-xyz', '--json'], services);
  assert.doesNotMatch(traceResult.output, /hidden/);
});

test('runCli converts operational failures to secret-free nonzero envelopes', async () => {
  const services = {
    status: async () => {
      const error = new Error('Bearer super-secret +584121234567');
      error.code = 'BACKEND_UNAVAILABLE';
      throw error;
    }
  };
  const result = await runCli(['status', '--json'], services);
  assert.equal(result.exitCode, 1);
  const payload = JSON.parse(result.output);
  assert.equal(payload.ok, false);
  assert.equal(payload.command, 'status');
  assert.equal(payload.error.code, 'BACKEND_UNAVAILABLE');
  assert.doesNotMatch(result.output, /super-secret|584121234567/);
});
