-- Control Hipico group shadow outbox idempotency.
-- One compatibility outbox record per transport event for the WhatsApp group.

CREATE UNIQUE INDEX IF NOT EXISTS "HipicoBotOutbox_group_event_unique"
  ON public."HipicoBotOutbox"("eventId", "targetType")
  WHERE "eventId" IS NOT NULL AND "targetType" = 'group_bridge';
