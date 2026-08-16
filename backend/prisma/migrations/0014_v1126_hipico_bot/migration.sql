-- Control Hípico v1.13 bot persistence.
-- Product owner: Control Hípico. This migration intentionally contains no
-- ContaGest ERP/Fitness tables even though both products share PostgreSQL today.

CREATE TABLE IF NOT EXISTS public."HipicoWebhookEvent" (
  "id" TEXT PRIMARY KEY,
  "providerMessageId" TEXT NOT NULL UNIQUE,
  "phoneNumberId" TEXT,
  "sender" TEXT,
  "messageType" TEXT NOT NULL DEFAULT 'unknown',
  "body" TEXT,
  "intent" TEXT NOT NULL DEFAULT 'unknown',
  "risk" TEXT NOT NULL DEFAULT 'review',
  "status" TEXT NOT NULL DEFAULT 'received',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "suggestion" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "HipicoWebhookEvent_receivedAt_idx"
  ON public."HipicoWebhookEvent"("receivedAt" DESC);
CREATE INDEX IF NOT EXISTS "HipicoWebhookEvent_status_idx"
  ON public."HipicoWebhookEvent"("status");

CREATE TABLE IF NOT EXISTS public."HipicoBotOutbox" (
  "id" TEXT PRIMARY KEY,
  "eventId" TEXT REFERENCES public."HipicoWebhookEvent"("id") ON DELETE SET NULL,
  "recipient" TEXT NOT NULL,
  "targetType" TEXT NOT NULL DEFAULT 'individual',
  "message" TEXT NOT NULL,
  "intent" TEXT NOT NULL DEFAULT 'unknown',
  "risk" TEXT NOT NULL DEFAULT 'review',
  "status" TEXT NOT NULL DEFAULT 'pending_approval',
  "providerMessageId" TEXT,
  "error" TEXT,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "HipicoBotOutbox_status_createdAt_idx"
  ON public."HipicoBotOutbox"("status", "createdAt" DESC);
