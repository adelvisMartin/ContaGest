import crypto from 'node:crypto';

type TransportReplaySource = {
  phoneNumberId?: string | null;
  sender?: string | null;
  messageType?: string | null;
  body?: string | null;
};

type CanonicalReplaySource = {
  sender?: string | null;
  sentAt?: Date | string | null;
  messageType?: string | null;
  body?: string | null;
  quotedExternalMessageId?: string | null;
};

function text(value: unknown) {
  return String(value ?? '').trim();
}

function bodyText(value: unknown) {
  return String(value ?? '');
}

function nullableText(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function timestamp(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function digest(parts: readonly unknown[]) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function transportReplaySignature(source: TransportReplaySource) {
  return digest([
    nullableText(source.phoneNumberId),
    nullableText(source.sender),
    text(source.messageType) || 'unknown',
    bodyText(source.body)
  ]);
}

export function canonicalReplaySignature(source: CanonicalReplaySource) {
  return digest([
    nullableText(source.sender),
    timestamp(source.sentAt),
    text(source.messageType) || 'text',
    bodyText(source.body),
    nullableText(source.quotedExternalMessageId)
  ]);
}

export function assertReplayMatch(kind: 'transport' | 'canonical', expectedSignature: string, actualSignature: string) {
  if (!expectedSignature || !actualSignature || expectedSignature !== actualSignature) {
    const code = kind === 'transport' ? 'HIPICO_TRANSPORT_REPLAY_MISMATCH' : 'HIPICO_CANONICAL_REPLAY_MISMATCH';
    throw Object.assign(new Error(`${kind} replay does not match the first persisted source event.`), { code });
  }
}

export const __test__ = { text, bodyText, nullableText, timestamp };
