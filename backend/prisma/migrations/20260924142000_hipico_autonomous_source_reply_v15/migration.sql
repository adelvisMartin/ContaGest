-- Control Hípico v15 — autonomous WhatsApp source replies.
-- Adds idempotency only for the existing compatibility outbox target.
-- No financial or race-state authority is granted by this migration.

CREATE UNIQUE INDEX IF NOT EXISTS "HipicoBotOutbox_source_reply_event_unique"
  ON public."HipicoBotOutbox"("eventId", "targetType")
  WHERE "eventId" IS NOT NULL AND "targetType" = 'source_reply';

CREATE INDEX IF NOT EXISTS "HipicoBotOutbox_source_reply_status_idx"
  ON public."HipicoBotOutbox"("status", "createdAt" DESC)
  WHERE "targetType" = 'source_reply';
