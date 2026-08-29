-- Control Hípico #152: durable response safety / human handoff.
-- No habilita transporte productivo ni mutaciones monetarias.

CREATE TABLE IF NOT EXISTS public."HipicoConversationHandoff" (
  "conversationKey" TEXT PRIMARY KEY,
  "groupKey" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "raceId" TEXT,
  "ownership" TEXT NOT NULL DEFAULT 'bot' CHECK ("ownership" IN ('bot','human')),
  "clarificationCount" INTEGER NOT NULL DEFAULT 0 CHECK ("clarificationCount" >= 0),
  "reason" TEXT,
  "humanOwnerId" TEXT,
  "expiresAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "HipicoConversationHandoff_group_participant_idx"
  ON public."HipicoConversationHandoff"("groupKey", "participantId", "raceId");
CREATE INDEX IF NOT EXISTS "HipicoConversationHandoff_ownership_expires_idx"
  ON public."HipicoConversationHandoff"("ownership", "expiresAt");

CREATE TABLE IF NOT EXISTS public."HipicoHandoffAudit" (
  "id" TEXT PRIMARY KEY,
  "conversationKey" TEXT NOT NULL REFERENCES public."HipicoConversationHandoff"("conversationKey") ON DELETE CASCADE,
  "eventType" TEXT NOT NULL,
  "actorId" TEXT,
  "sourceMessageId" TEXT,
  "correlationId" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "HipicoHandoffAudit_conversation_created_idx"
  ON public."HipicoHandoffAudit"("conversationKey", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public."HipicoResponseReceipt" (
  "id" TEXT PRIMARY KEY,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "sourceMessageId" TEXT NOT NULL,
  "decisionVersion" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "intent" TEXT NOT NULL,
  "responseHash" TEXT,
  "receiptId" TEXT,
  "transactionId" TEXT,
  "stateId" TEXT,
  "confirmationVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "HipicoResponseReceipt_source_idx"
  ON public."HipicoResponseReceipt"("sourceMessageId", "decisionVersion");
CREATE INDEX IF NOT EXISTS "HipicoResponseReceipt_status_idx"
  ON public."HipicoResponseReceipt"("status", "createdAt" DESC);
