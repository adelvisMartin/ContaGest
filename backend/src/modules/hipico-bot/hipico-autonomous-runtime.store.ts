import { prisma } from '../../database/prisma.js';

export type AutonomousSourceReplyState =
  | 'planned'
  | 'sending'
  | 'sent'
  | 'ambiguous'
  | 'held'
  | 'cancelled'
  | 'dead_letter';

export type AutonomousSourceReplyRow = {
  id: string;
  eventId: string;
  recipient: string;
  message: string;
  intent: string;
  risk: string;
  status: AutonomousSourceReplyState | string;
  providerMessageId: string | null;
  error: string | null;
  sentAt: Date | string | null;
};

function safeError(value: unknown) {
  return String(value ?? '').trim().slice(0, 500) || null;
}

export async function claimAutonomousSourceReply(id: string) {
  const rows = await prisma.$queryRaw<AutonomousSourceReplyRow[]>`
    UPDATE public."HipicoBotOutbox"
    SET "status"='sending', "error"=NULL, "updatedAt"=CURRENT_TIMESTAMP
    WHERE "id"=${id}
      AND "targetType"='source_reply'
      AND "status"='planned'
    RETURNING
      "id","eventId","recipient","message","intent","risk","status",
      "providerMessageId","error","sentAt"
  `;
  return rows[0] || null;
}

export async function getAutonomousSourceReply(id: string) {
  const rows = await prisma.$queryRaw<AutonomousSourceReplyRow[]>`
    SELECT
      "id","eventId","recipient","message","intent","risk","status",
      "providerMessageId","error","sentAt"
    FROM public."HipicoBotOutbox"
    WHERE "id"=${id} AND "targetType"='source_reply'
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function markAutonomousSourceReplySent(id: string, providerMessageId: string) {
  const providerId = String(providerMessageId || '').trim().slice(0, 320);
  if (!providerId) {
    throw Object.assign(new Error('Provider message id is required after an accepted delivery.'), {
      code: 'HIPICO_AUTONOMOUS_PROVIDER_MESSAGE_ID_REQUIRED'
    });
  }
  const rows = await prisma.$queryRaw<AutonomousSourceReplyRow[]>`
    UPDATE public."HipicoBotOutbox"
    SET "status"='sent', "providerMessageId"=${providerId}, "error"=NULL,
        "sentAt"=COALESCE("sentAt",CURRENT_TIMESTAMP), "updatedAt"=CURRENT_TIMESTAMP
    WHERE "id"=${id}
      AND "targetType"='source_reply'
      AND "status"='sending'
    RETURNING
      "id","eventId","recipient","message","intent","risk","status",
      "providerMessageId","error","sentAt"
  `;
  return rows[0] || null;
}

export async function markAutonomousSourceReplyAmbiguous(id: string, error: unknown) {
  const rows = await prisma.$queryRaw<AutonomousSourceReplyRow[]>`
    UPDATE public."HipicoBotOutbox"
    SET "status"='ambiguous', "error"=${safeError(error)}, "updatedAt"=CURRENT_TIMESTAMP
    WHERE "id"=${id}
      AND "targetType"='source_reply'
      AND "status"='sending'
    RETURNING
      "id","eventId","recipient","message","intent","risk","status",
      "providerMessageId","error","sentAt"
  `;
  return rows[0] || null;
}

export async function holdAutonomousSourceReply(id: string, reason: unknown) {
  const rows = await prisma.$queryRaw<AutonomousSourceReplyRow[]>`
    UPDATE public."HipicoBotOutbox"
    SET "status"='held', "error"=${safeError(reason)}, "updatedAt"=CURRENT_TIMESTAMP
    WHERE "id"=${id}
      AND "targetType"='source_reply'
      AND "status" IN ('planned','sending')
    RETURNING
      "id","eventId","recipient","message","intent","risk","status",
      "providerMessageId","error","sentAt"
  `;
  return rows[0] || null;
}

export async function cancelAutonomousSourceReply(id: string, reason: unknown) {
  const rows = await prisma.$queryRaw<AutonomousSourceReplyRow[]>`
    UPDATE public."HipicoBotOutbox"
    SET "status"='cancelled', "error"=${safeError(reason)}, "updatedAt"=CURRENT_TIMESTAMP
    WHERE "id"=${id}
      AND "targetType"='source_reply'
      AND "status" IN ('planned','sending')
    RETURNING
      "id","eventId","recipient","message","intent","risk","status",
      "providerMessageId","error","sentAt"
  `;
  return rows[0] || null;
}

export async function deadLetterAutonomousSourceReply(id: string, reason: unknown) {
  const rows = await prisma.$queryRaw<AutonomousSourceReplyRow[]>`
    UPDATE public."HipicoBotOutbox"
    SET "status"='dead_letter', "error"=${safeError(reason)}, "updatedAt"=CURRENT_TIMESTAMP
    WHERE "id"=${id}
      AND "targetType"='source_reply'
      AND "status" IN ('planned','sending','ambiguous')
    RETURNING
      "id","eventId","recipient","message","intent","risk","status",
      "providerMessageId","error","sentAt"
  `;
  return rows[0] || null;
}

export async function recoverInterruptedAutonomousSourceReplies(staleBefore: Date, limit = 100) {
  const bounded = Math.min(500, Math.max(1, Math.trunc(Number(limit) || 100)));
  return prisma.$queryRaw<AutonomousSourceReplyRow[]>`
    WITH stale AS (
      SELECT "id"
      FROM public."HipicoBotOutbox"
      WHERE "targetType"='source_reply'
        AND "status"='sending'
        AND "updatedAt"<=${staleBefore}
      ORDER BY "updatedAt" ASC
      LIMIT ${bounded}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public."HipicoBotOutbox" target
    SET "status"='ambiguous',
        "error"='RESTART_RECOVERY_REQUIRES_RECONCILIATION',
        "updatedAt"=CURRENT_TIMESTAMP
    FROM stale
    WHERE target."id"=stale."id"
    RETURNING
      target."id",target."eventId",target."recipient",target."message",target."intent",target."risk",target."status",
      target."providerMessageId",target."error",target."sentAt"
  `;
}
