-- Control Hipico bot audit join performance.
-- Idempotent and data-preserving: supports event -> shadow outbox inspection.

CREATE INDEX IF NOT EXISTS "HipicoBotOutbox_eventId_idx"
  ON public."HipicoBotOutbox"("eventId");
