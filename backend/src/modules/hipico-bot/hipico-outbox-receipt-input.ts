import {
  assertOutboxUuid,
  outboxText,
  validOutboxProvider
} from './hipico-outbox-input.js';

export type CanonicalReceiptInput = {
  ownerId: string;
  provider?: string;
  providerMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
};

export type CanonicalReconciliationInput = {
  ownerId: string;
  id: string;
  resolution: 'sent' | 'failed';
  actorRef: string;
  reason: string;
  providerMessageId?: string | null;
};

export function normalizeCanonicalReceiptInput(input: CanonicalReceiptInput) {
  assertOutboxUuid(input.ownerId, 'ownerId');
  const provider = outboxText(input.provider || 'meta_cloud').toLowerCase();
  const providerMessageId = outboxText(input.providerMessageId);
  if (
    !validOutboxProvider(provider)
    || !providerMessageId
    || providerMessageId.length > 320
    || !Number.isFinite(input.timestamp.getTime())
  ) {
    throw Object.assign(new Error('Provider receipt invalid.'), { code: 'HIPICO_OUTBOX_RECEIPT_INVALID' });
  }
  const metadata = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
    ? input.metadata
    : {};
  return {
    ownerId: input.ownerId,
    provider,
    providerMessageId,
    status: input.status,
    timestamp: input.timestamp,
    errorCode: outboxText(input.errorCode).slice(0, 120) || null,
    metadata
  };
}

export function normalizeCanonicalReconciliationInput(input: CanonicalReconciliationInput) {
  assertOutboxUuid(input.ownerId, 'ownerId');
  assertOutboxUuid(input.id, 'outboxId');
  const actorRef = outboxText(input.actorRef).slice(0, 220);
  const reason = outboxText(input.reason).slice(0, 500);
  const providerMessageId = outboxText(input.providerMessageId).slice(0, 320) || null;
  if (!actorRef || reason.length < 5 || (input.resolution === 'sent' && !providerMessageId)) {
    throw Object.assign(new Error('Explicit reconciliation evidence is incomplete.'), {
      code: 'HIPICO_OUTBOX_RECONCILIATION_INVALID'
    });
  }
  return {
    ownerId: input.ownerId,
    id: input.id,
    resolution: input.resolution,
    actorRef,
    reason,
    providerMessageId
  };
}

export function normalizeOutboxFailure(error: unknown, errorCode: unknown, fallbackCode: string | null = null) {
  return {
    error: outboxText(error).slice(0, 1000),
    errorCode: outboxText(errorCode).slice(0, 120) || fallbackCode
  };
}
