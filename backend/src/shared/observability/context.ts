import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { redactTelemetryValue, sanitizeLogValue } from './redaction.js';

const TRACEPARENT = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/i;
const CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$/;
const SENSITIVE_ATTRIBUTE = /(authorization|cookie|password|secret|token|api[-_]?key|prompt|body|payload|message(content|text)?)/i;

export type TelemetryContext = {
  correlationId: string;
  traceId: string;
  spanId: string;
  traceFlags: string;
  traceparent: string;
};

const telemetryStorage = new AsyncLocalStorage<TelemetryContext>();

function hex(bytes: number) { return crypto.randomBytes(bytes).toString('hex'); }
function traceparent(traceId: string, spanId: string, flags = '01') { return `00-${traceId}-${spanId}-${flags}`; }

export function parseTraceparent(value: unknown) {
  const match = TRACEPARENT.exec(String(value ?? '').trim());
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return null;
  return { traceId: match[1].toLowerCase(), parentSpanId: match[2].toLowerCase(), traceFlags: match[3].toLowerCase() };
}

export function createTelemetryContext(input: {
  traceparent?: unknown;
  correlationId?: unknown;
  requestId?: unknown;
} = {}): TelemetryContext {
  const parent = parseTraceparent(input.traceparent);
  const incomingCorrelation = sanitizeLogValue(input.correlationId, 96);
  const requestId = sanitizeLogValue(input.requestId, 96);
  const correlationId = CORRELATION_ID.test(incomingCorrelation)
    ? incomingCorrelation
    : CORRELATION_ID.test(requestId)
      ? requestId
      : crypto.randomUUID();
  const traceId = parent?.traceId || hex(16);
  const spanId = hex(8);
  const traceFlags = parent?.traceFlags || '01';
  return { correlationId, traceId, spanId, traceFlags, traceparent: traceparent(traceId, spanId, traceFlags) };
}

export function childTelemetryContext(parent: TelemetryContext): TelemetryContext {
  const spanId = hex(8);
  return { ...parent, spanId, traceparent: traceparent(parent.traceId, spanId, parent.traceFlags) };
}

export function runWithTelemetryContext<T>(context: TelemetryContext, operation: () => T): T {
  return telemetryStorage.run(context, operation);
}

export function currentTelemetryContext() {
  return telemetryStorage.getStore() || null;
}

export function currentCorrelationId() {
  return telemetryStorage.getStore()?.correlationId;
}

export function createJobTelemetryContext(input: {
  traceparent?: unknown;
  correlationId?: unknown;
  requestId?: unknown;
} = {}) {
  const active = currentTelemetryContext();
  return active ? childTelemetryContext(active) : createTelemetryContext(input);
}

export function propagationHeaders(context: TelemetryContext) {
  return { traceparent: context.traceparent, 'x-correlation-id': context.correlationId };
}

export function sanitizeTelemetryAttributes(input: Record<string, unknown>) {
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input).slice(0, 64)) {
    const safeKey = sanitizeLogValue(key, 80);
    if (!safeKey || SENSITIVE_ATTRIBUTE.test(safeKey)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) output[safeKey] = value;
    else if (typeof value === 'boolean') output[safeKey] = Boolean(value);
    else if (value === null) output[safeKey] = null;
    else if (typeof value === 'string') {
      const redacted = redactTelemetryValue(value);
      if (typeof redacted === 'string') output[safeKey] = sanitizeLogValue(redacted, 240);
    }
  }
  return output;
}

export async function exportTelemetrySafely(exporter: undefined | null | ((event: unknown) => Promise<void> | void), event: unknown) {
  if (!exporter) return false;
  try {
    await exporter(event);
    return true;
  } catch {
    return false;
  }
}

export const __test__ = { TRACEPARENT, CORRELATION_ID, SENSITIVE_ATTRIBUTE };
