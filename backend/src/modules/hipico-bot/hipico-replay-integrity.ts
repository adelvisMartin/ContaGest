import crypto from 'node:crypto';

type TransportReplayMetadata = {
  sentAt?: unknown;
  groupId?: unknown;
  channelKey?: unknown;
  labChannelKey?: unknown;
  channelRole?: unknown;
  historySync?: unknown;
  fromMe?: unknown;
  hasMedia?: unknown;
  mediaKind?: unknown;
  mediaName?: unknown;
  quotedExternalMessageId?: unknown;
};

type TransportReplaySource = {
  phoneNumberId?: string | null;
  sender?: string | null;
  messageType?: string | null;
  body?: string | null;
  payload?: TransportReplayMetadata | null;
};

type CanonicalReplaySource = {
  sender?: string | null;
  sentAt?: Date | string | null;
  messageType?: string | null;
  body?: string | null;
  quotedExternalMessageId?: string | null;
};

type GroupShadowReplaySource = {
  recipient?: string | null;
  message?: string | null;
  intent?: string | null;
  risk?: string | null;
};

type ReplayKind = 'transport' | 'canonical' | 'group-shadow';

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

function timestamp(value: Date | string | null | undefined | unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function booleanValue(value: unknown) {
  return value === true;
}

function digest(parts: readonly unknown[]) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function transportReplaySignature(source: TransportReplaySource) {
  const payload=source.payload&&typeof source.payload==='object'?source.payload:{};
  return digest([
    nullableText(source.phoneNumberId),
    nullableText(source.sender),
    text(source.messageType) || 'unknown',
    bodyText(source.body),
    timestamp(payload.sentAt),
    nullableText(payload.groupId),
    nullableText(payload.channelKey),
    nullableText(payload.labChannelKey),
    text(payload.channelRole),
    booleanValue(payload.historySync),
    booleanValue(payload.fromMe),
    booleanValue(payload.hasMedia),
    text(payload.mediaKind) || 'none',
    nullableText(payload.mediaName),
    nullableText(payload.quotedExternalMessageId)
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

export function groupShadowReplaySignature(source: GroupShadowReplaySource) {
  return digest([
    nullableText(source.recipient),
    bodyText(source.message),
    text(source.intent),
    text(source.risk)
  ]);
}

export function assertReplayMatch(kind: ReplayKind, expectedSignature: string, actualSignature: string) {
  if (!expectedSignature || !actualSignature || expectedSignature !== actualSignature) {
    const code = kind === 'transport'
      ? 'HIPICO_TRANSPORT_REPLAY_MISMATCH'
      : kind === 'canonical'
        ? 'HIPICO_CANONICAL_REPLAY_MISMATCH'
        : 'HIPICO_GROUP_SHADOW_OUTBOX_REPLAY_MISMATCH';
    throw Object.assign(new Error(`${kind} replay does not match the first persisted source event.`), { code });
  }
}

export const __test__ = { text, bodyText, nullableText, timestamp, booleanValue };
