import crypto from 'node:crypto';
import { outboundPayloadDigest } from './hipico-outbox-policy.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const E164_DIGITS = /^[1-9]\d{6,14}$/;
const PROVIDER = /^[a-z0-9_.-]{2,40}$/;

export type CanonicalOutboundInput = {
  ownerId: string;
  groupKey: string;
  destination: string;
  idempotencyKey: string;
  replyType?: string;
  payload: Record<string, unknown>;
  provider?: string;
  maxAttempts?: number;
  nextAttemptAt?: Date;
  correlationId?: string;
};

export function outboxText(value: unknown) {
  return String(value ?? '').trim();
}

export function outboxField(row: any, camel: string, snake: string) {
  return row?.[camel] ?? row?.[snake] ?? null;
}

export function assertOutboxUuid(value: string, label: string) {
  if (!UUID.test(value)) {
    throw Object.assign(new Error(`${label} must be UUID.`), { code: 'HIPICO_OUTBOX_INPUT_INVALID' });
  }
}

export function boundedOutboxInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, Math.trunc(parsed)))
    : fallback;
}

export function postgresCode(error: any) {
  return String(error?.meta?.code || error?.code || '');
}

export function configuredOutboxOwnerId(env: NodeJS.ProcessEnv = process.env) {
  const value = outboxText(env.HIPICO_OWNER_ID);
  return UUID.test(value) ? value : null;
}

export function sameCanonicalOutboundIntent(existing: any, candidate: any) {
  return outboxText(outboxField(existing, 'ownerId', 'owner_id')).toLowerCase()
      === outboxText(outboxField(candidate, 'ownerId', 'owner_id')).toLowerCase()
    && outboxText(outboxField(existing, 'groupKey', 'group_key'))
      === outboxText(outboxField(candidate, 'groupKey', 'group_key'))
    && outboxText(outboxField(existing, 'destination', 'destination')).replace(/^\+/, '')
      === outboxText(outboxField(candidate, 'destination', 'destination')).replace(/^\+/, '')
    && outboxText(outboxField(existing, 'replyType', 'reply_type') || 'operational')
      === outboxText(outboxField(candidate, 'replyType', 'reply_type') || 'operational')
    && outboxText(outboxField(existing, 'provider', 'provider') || 'meta_cloud')
      === outboxText(outboxField(candidate, 'provider', 'provider') || 'meta_cloud')
    && outboxText(outboxField(existing, 'payloadDigest', 'payload_digest'))
      === outboxText(outboxField(candidate, 'payloadDigest', 'payload_digest'));
}

export function normalizeCanonicalOutboundInput(input: CanonicalOutboundInput) {
  const ownerId = outboxText(input.ownerId);
  const groupKey = outboxText(input.groupKey);
  const destination = outboxText(input.destination).replace(/^\+/, '');
  const idempotencyKey = outboxText(input.idempotencyKey);
  const replyType = outboxText(input.replyType || 'operational');
  const provider = outboxText(input.provider || 'meta_cloud').toLowerCase();
  const correlationId = outboxText(input.correlationId || crypto.randomUUID());

  assertOutboxUuid(ownerId, 'ownerId');
  assertOutboxUuid(correlationId, 'correlationId');
  if (
    !groupKey
    || groupKey.length > 120
    || !E164_DIGITS.test(destination)
    || idempotencyKey.length < 8
    || idempotencyKey.length > 220
    || replyType.length < 1
    || replyType.length > 80
    || !PROVIDER.test(provider)
  ) {
    throw Object.assign(new Error('Canonical outbound input is invalid.'), { code: 'HIPICO_OUTBOX_INPUT_INVALID' });
  }
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
    throw Object.assign(new Error('Canonical outbound payload must be an object.'), { code: 'HIPICO_OUTBOX_INPUT_INVALID' });
  }

  const payloadDigest = outboundPayloadDigest({ ownerId, groupKey, destination, replyType, payload: input.payload });
  return {
    ownerId,
    groupKey,
    destination,
    idempotencyKey,
    replyType,
    provider,
    correlationId,
    payloadDigest,
    payload: input.payload,
    maxAttempts: boundedOutboxInt(input.maxAttempts, 4, 1, 20),
    nextAttemptAt: input.nextAttemptAt || new Date()
  };
}

export function validOutboxProvider(value: string) {
  return PROVIDER.test(value);
}

export const __test__ = { UUID, E164_DIGITS, PROVIDER };
