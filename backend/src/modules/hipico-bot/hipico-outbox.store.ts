import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { monotonicReceiptStatus } from './hipico-outbox-policy.js';
import {
  assertOutboxUuid,
  boundedOutboxInt,
  configuredOutboxOwnerId,
  normalizeCanonicalOutboundInput,
  outboxText,
  postgresCode,
  sameCanonicalOutboundIntent,
  type CanonicalOutboundInput
} from './hipico-outbox-input.js';
import {
  normalizeCanonicalReceiptInput,
  normalizeCanonicalReconciliationInput,
  normalizeOutboxFailure,
  type CanonicalReceiptInput,
  type CanonicalReconciliationInput
} from './hipico-outbox-receipt-input.js';

export type { CanonicalOutboundInput } from './hipico-outbox-input.js';
export { configuredOutboxOwnerId, sameCanonicalOutboundIntent } from './hipico-outbox-input.js';

export async function canonicalOutboxReadiness() {
  try {
    const rows = await prisma.$queryRaw<Array<{ outbox: string | null; receipts: string | null }>>`
      SELECT
        to_regclass('public.hipico_outbox')::text AS outbox,
        to_regclass('public.hipico_outbox_receipts')::text AS receipts`;
    return {
      ready: Boolean(rows[0]?.outbox && rows[0]?.receipts),
      outboxReady: Boolean(rows[0]?.outbox),
      receiptsReady: Boolean(rows[0]?.receipts)
    };
  } catch {
    return { ready: false, outboxReady: false, receiptsReady: false };
  }
}

export async function enqueueCanonicalOutbound(input: CanonicalOutboundInput) {
  const row = normalizeCanonicalOutboundInput(input);
  const inserted = await prisma.$queryRaw<any[]>`
    INSERT INTO public.hipico_outbox (
      owner_id, group_key, destination, idempotency_key, reply_type, payload, status,
      attempts, next_attempt_at, correlation_id, payload_digest, provider, max_attempts,
      created_at, updated_at
    ) VALUES (
      ${row.ownerId}::uuid, ${row.groupKey}, ${row.destination}, ${row.idempotencyKey},
      ${row.replyType}, ${JSON.stringify(row.payload)}::jsonb, 'queued', 0,
      ${row.nextAttemptAt}, ${row.correlationId}::uuid, ${row.payloadDigest}, ${row.provider},
      ${row.maxAttempts}, now(), now()
    )
    ON CONFLICT(owner_id, idempotency_key) DO NOTHING
    RETURNING *`;

  if (inserted[0]) return { row: inserted[0], inserted: true };

  const existing = await prisma.$queryRaw<any[]>`
    SELECT *
    FROM public.hipico_outbox
    WHERE owner_id = ${row.ownerId}::uuid AND idempotency_key = ${row.idempotencyKey}
    LIMIT 2`;
  if (existing.length !== 1) {
    throw Object.assign(new Error('Canonical idempotency row is missing or ambiguous.'), {
      code: 'HIPICO_OUTBOX_IDEMPOTENCY_ROW_INVALID'
    });
  }
  if (!sameCanonicalOutboundIntent(existing[0], row)) {
    throw Object.assign(new Error('Idempotency key reused with different outbound content.'), {
      code: 'HIPICO_OUTBOUND_IDEMPOTENCY_MISMATCH'
    });
  }
  return { row: existing[0], inserted: false };
}

export async function getCanonicalOutbox(ownerId: string, id: string) {
  assertOutboxUuid(ownerId, 'ownerId');
  assertOutboxUuid(id, 'outboxId');
  const rows = await prisma.$queryRaw<any[]>`
    SELECT * FROM public.hipico_outbox
    WHERE owner_id = ${ownerId}::uuid AND id = ${id}::uuid
    LIMIT 1`;
  return rows[0] || null;
}

export async function listCanonicalOutbox(
  ownerId: string,
  options: { limit?: number; status?: string } = {}
) {
  assertOutboxUuid(ownerId, 'ownerId');
  const limit = boundedOutboxInt(options.limit, 50, 1, 100);
  const status = outboxText(options.status);
  return prisma.$queryRaw<any[]>`
    SELECT * FROM public.hipico_outbox
    WHERE owner_id = ${ownerId}::uuid AND (${status} = '' OR status = ${status})
    ORDER BY created_at DESC
    LIMIT ${limit}`;
}

export async function claimCanonicalOutbound(input: {
  ownerId: string;
  id?: string | null;
  leaseMs?: number;
  cooldownMs?: number;
  allowApprovalRequired?: boolean;
}) {
  assertOutboxUuid(input.ownerId, 'ownerId');
  const idValue = input.id ? outboxText(input.id) : null;
  if (idValue) assertOutboxUuid(idValue, 'outboxId');

  const leaseToken = crypto.randomUUID();
  const leaseSeconds = boundedOutboxInt(input.leaseMs, 120_000, 5_000, 10 * 60_000) / 1000;
  const cooldownSeconds = boundedOutboxInt(input.cooldownMs, 1_500, 0, 60_000) / 1000;
  const allowApprovalRequired = input.allowApprovalRequired === true;

  try {
    const rows = await prisma.$queryRaw<any[]>`
      WITH candidate AS (
        SELECT o.id
        FROM public.hipico_outbox o
        WHERE o.owner_id = ${input.ownerId}::uuid
          AND (${idValue}::uuid IS NULL OR o.id = ${idValue}::uuid)
          AND o.status IN ('queued', 'retry')
          AND (${allowApprovalRequired} OR COALESCE(o.payload->>'approvalRequired', 'false') <> 'true')
          AND o.attempts < o.max_attempts
          AND o.next_attempt_at <= now()
          AND (o.cooldown_until IS NULL OR o.cooldown_until <= now())
          AND (o.leased_until IS NULL OR o.leased_until <= now())
          AND NOT EXISTS (
            SELECT 1
            FROM public.hipico_outbox active
            WHERE active.owner_id = o.owner_id
              AND active.group_key = o.group_key
              AND active.destination = o.destination
              AND active.id <> o.id
              AND active.status = 'sending'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.hipico_outbox recent
            WHERE recent.owner_id = o.owner_id
              AND recent.group_key = o.group_key
              AND recent.destination = o.destination
              AND recent.id <> o.id
              AND recent.accepted_at IS NOT NULL
              AND recent.accepted_at > now() - make_interval(secs => ${cooldownSeconds})
          )
        ORDER BY o.next_attempt_at, o.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE public.hipico_outbox target
      SET status = 'sending',
          lease_token = ${leaseToken}::uuid,
          leased_at = now(),
          leased_until = now() + make_interval(secs => ${leaseSeconds}),
          attempts = target.attempts + 1,
          updated_at = now()
      FROM candidate
      WHERE target.id = candidate.id
      RETURNING target.*`;
    return rows[0] || null;
  } catch (error: any) {
    if (postgresCode(error) === '23505') return null;
    throw error;
  }
}

type SendingLease = { ownerId: string; id: string; leaseToken: string };

async function finishSending(
  input: SendingLease,
  setSql: (args: SendingLease) => Promise<any[]>
) {
  assertOutboxUuid(input.ownerId, 'ownerId');
  assertOutboxUuid(input.id, 'outboxId');
  assertOutboxUuid(input.leaseToken, 'leaseToken');
  const rows = await setSql(input);
  return rows[0] || null;
}

export async function markCanonicalAccepted(input: SendingLease & { providerMessageId: string }) {
  const providerMessageId = outboxText(input.providerMessageId);
  if (!providerMessageId || providerMessageId.length > 320) {
    throw Object.assign(new Error('Provider message id invalid.'), { code: 'HIPICO_OUTBOX_RECEIPT_INVALID' });
  }
  return finishSending(input, ({ ownerId, id, leaseToken }) => prisma.$queryRaw<any[]>`
    UPDATE public.hipico_outbox
    SET status = 'accepted', external_message_id = ${providerMessageId}, accepted_at = now(),
        lease_token = NULL, leased_at = NULL, leased_until = NULL,
        last_error = NULL, last_error_code = NULL, updated_at = now()
    WHERE owner_id = ${ownerId}::uuid AND id = ${id}::uuid
      AND status = 'sending' AND lease_token = ${leaseToken}::uuid
    RETURNING *`);
}

export async function markCanonicalRetry(input: SendingLease & {
  nextAttemptAt: Date;
  error: string;
  errorCode?: string;
}) {
  const failure = normalizeOutboxFailure(input.error, input.errorCode);
  return finishSending(input, ({ ownerId, id, leaseToken }) => prisma.$queryRaw<any[]>`
    UPDATE public.hipico_outbox
    SET status = 'retry', next_attempt_at = ${input.nextAttemptAt},
        lease_token = NULL, leased_at = NULL, leased_until = NULL,
        last_error = ${failure.error}, last_error_code = ${failure.errorCode}, updated_at = now()
    WHERE owner_id = ${ownerId}::uuid AND id = ${id}::uuid
      AND status = 'sending' AND lease_token = ${leaseToken}::uuid
    RETURNING *`);
}

export async function markCanonicalFailed(input: SendingLease & { error: string; errorCode?: string }) {
  const failure = normalizeOutboxFailure(input.error, input.errorCode);
  return finishSending(input, ({ ownerId, id, leaseToken }) => prisma.$queryRaw<any[]>`
    UPDATE public.hipico_outbox
    SET status = 'failed', failed_at = now(),
        lease_token = NULL, leased_at = NULL, leased_until = NULL,
        last_error = ${failure.error}, last_error_code = ${failure.errorCode}, updated_at = now()
    WHERE owner_id = ${ownerId}::uuid AND id = ${id}::uuid
      AND status = 'sending' AND lease_token = ${leaseToken}::uuid
    RETURNING *`);
}

export async function markCanonicalReconciliationRequired(input: SendingLease & {
  error: string;
  errorCode?: string;
}) {
  const failure = normalizeOutboxFailure(input.error, input.errorCode, 'AMBIGUOUS_DELIVERY');
  return finishSending(input, ({ ownerId, id, leaseToken }) => prisma.$queryRaw<any[]>`
    UPDATE public.hipico_outbox
    SET status = 'reconciliation_required',
        lease_token = NULL, leased_at = NULL, leased_until = NULL,
        last_error = ${failure.error}, last_error_code = ${failure.errorCode}, updated_at = now()
    WHERE owner_id = ${ownerId}::uuid AND id = ${id}::uuid
      AND status = 'sending' AND lease_token = ${leaseToken}::uuid
    RETURNING *`);
}

export async function recordCanonicalReceipt(input: CanonicalReceiptInput) {
  const receiptInput = normalizeCanonicalReceiptInput(input);
  return prisma.$transaction(async (tx: any) => {
    const rows = await tx.$queryRaw<any[]>`
      SELECT * FROM public.hipico_outbox
      WHERE owner_id = ${receiptInput.ownerId}::uuid
        AND provider = ${receiptInput.provider}
        AND external_message_id = ${receiptInput.providerMessageId}
      LIMIT 1 FOR UPDATE`;
    const existing = rows[0];
    if (!existing) return { matched: false, inserted: false, row: null };

    const receipt = await tx.$queryRaw<any[]>`
      INSERT INTO public.hipico_outbox_receipts (
        owner_id, outbox_id, provider, provider_message_id,
        receipt_status, receipt_timestamp, error_code, metadata
      ) VALUES (
        ${receiptInput.ownerId}::uuid, ${existing.id}::uuid, ${receiptInput.provider},
        ${receiptInput.providerMessageId}, ${receiptInput.status}, ${receiptInput.timestamp},
        ${receiptInput.errorCode}, ${JSON.stringify(receiptInput.metadata)}::jsonb
      )
      ON CONFLICT(owner_id, provider, provider_message_id, receipt_status, receipt_timestamp) DO NOTHING
      RETURNING id`;

    const nextStatus = monotonicReceiptStatus(String(existing.status), receiptInput.status);
    const rank = receiptInput.status === 'read'
      ? 3
      : receiptInput.status === 'delivered'
        ? 2
        : receiptInput.status === 'sent'
          ? 1
          : 0;
    const failedCode = receiptInput.errorCode || 'PROVIDER_FAILED';

    const updated = await tx.$queryRaw<any[]>`
      UPDATE public.hipico_outbox
      SET status = ${nextStatus},
          sent_at = CASE WHEN ${rank} >= 1 THEN COALESCE(sent_at, ${receiptInput.timestamp}) ELSE sent_at END,
          delivered_at = CASE WHEN ${rank} >= 2 THEN COALESCE(delivered_at, ${receiptInput.timestamp}) ELSE delivered_at END,
          read_at = CASE WHEN ${rank} >= 3 THEN COALESCE(read_at, ${receiptInput.timestamp}) ELSE read_at END,
          failed_at = CASE WHEN ${nextStatus} = 'failed' THEN COALESCE(failed_at, ${receiptInput.timestamp}) ELSE failed_at END,
          last_error_code = CASE WHEN ${nextStatus} = 'failed' THEN ${failedCode} ELSE last_error_code END,
          updated_at = now()
      WHERE owner_id = ${receiptInput.ownerId}::uuid AND id = ${existing.id}::uuid
      RETURNING *`;

    return { matched: true, inserted: Boolean(receipt[0]), row: updated[0] || existing };
  });
}

export async function reconcileCanonicalOutbound(input: CanonicalReconciliationInput) {
  const reconciliation = normalizeCanonicalReconciliationInput(input);
  const rows = await prisma.$queryRaw<any[]>`
    UPDATE public.hipico_outbox
    SET status = ${reconciliation.resolution},
        external_message_id = COALESCE(${reconciliation.providerMessageId}, external_message_id),
        sent_at = CASE WHEN ${reconciliation.resolution} = 'sent' THEN COALESCE(sent_at, now()) ELSE sent_at END,
        failed_at = CASE WHEN ${reconciliation.resolution} = 'failed' THEN COALESCE(failed_at, now()) ELSE failed_at END,
        reconciled_by = ${reconciliation.actorRef},
        reconciled_at = now(),
        reconciliation_reason = ${reconciliation.reason},
        updated_at = now()
    WHERE owner_id = ${reconciliation.ownerId}::uuid
      AND id = ${reconciliation.id}::uuid
      AND status = 'reconciliation_required'
    RETURNING *`;
  return rows[0] || null;
}

export const __test__ = {
  normalizedInput: normalizeCanonicalOutboundInput,
  postgresCode
};
