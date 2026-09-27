import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  childTelemetryContext,
  createTelemetryContext,
  exportTelemetrySafely,
  parseTraceparent,
  propagationHeaders,
  sanitizeTelemetryAttributes
} from './context.js';

test('valid W3C traceparent keeps trace id and creates a new span id', () => {
  const incoming = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
  const context = createTelemetryContext({ traceparent: incoming, correlationId: 'corr-test-12345678' });
  assert.equal(context.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
  assert.notEqual(context.spanId, '00f067aa0ba902b7');
  assert.equal(context.correlationId, 'corr-test-12345678');
  assert.deepEqual(propagationHeaders(context), { traceparent: context.traceparent, 'x-correlation-id': context.correlationId });
});

test('invalid trace and correlation input fail closed to fresh safe identifiers', () => {
  assert.equal(parseTraceparent('00-00000000000000000000000000000000-0000000000000000-01'), null);
  const context = createTelemetryContext({ traceparent: 'evil', correlationId: 'Bearer secret' });
  assert.match(context.traceId, /^[a-f0-9]{32}$/);
  assert.match(context.spanId, /^[a-f0-9]{16}$/);
  assert.match(context.correlationId, /^[0-9a-f-]{36}$/i);
});

test('child span preserves correlation and trace but rotates span identity', () => {
  const parent = createTelemetryContext({ correlationId: 'corr-child-12345678' });
  const child = childTelemetryContext(parent);
  assert.equal(child.correlationId, parent.correlationId);
  assert.equal(child.traceId, parent.traceId);
  assert.notEqual(child.spanId, parent.spanId);
});

test('telemetry attributes remove prompts payloads tokens and message content', () => {
  assert.deepEqual(sanitizeTelemetryAttributes({
    operation: 'outbox.dispatch',
    outcome: 'success',
    latencyMs: 12.4,
    tenantClass: 'hipico',
    token: 'secret',
    prompt: 'ignore policy',
    payload: '{secret}',
    messageText: 'private message'
  }), {
    operation: 'outbox.dispatch',
    outcome: 'success',
    latencyMs: 12.4,
    tenantClass: 'hipico'
  });
});

test('telemetry exporter outage is fail-open for business execution', async () => {
  assert.equal(await exportTelemetrySafely(undefined, { event: 'x' }), false);
  assert.equal(await exportTelemetrySafely(async () => { throw new Error('collector unavailable'); }, { event: 'x' }), false);
  let exported = false;
  assert.equal(await exportTelemetrySafely(async () => { exported = true; }, { event: 'x' }), true);
  assert.equal(exported, true);
});
