-- Issue #93: append-only banking corrections and auditable opening balances.
-- Existing movements are intentionally not backfilled: doing so would invent historical intent.

CREATE UNIQUE INDEX IF NOT EXISTS "BankAccount_tenantId_id_key"
  ON "BankAccount"("tenantId", "id");

CREATE UNIQUE INDEX IF NOT EXISTS "BankMovement_tenantId_id_key"
  ON "BankMovement"("tenantId", "id");

CREATE TABLE "BankMovementAuditLink" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "originalMovementId" TEXT,
  "relatedMovementId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BankMovementAuditLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BankMovementAuditLink_kind_check" CHECK ("kind" IN ('opening', 'reversal', 'correction')),
  CONSTRAINT "BankMovementAuditLink_account_fkey"
    FOREIGN KEY ("tenantId", "accountId") REFERENCES "BankAccount"("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BankMovementAuditLink_original_fkey"
    FOREIGN KEY ("tenantId", "originalMovementId") REFERENCES "BankMovement"("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BankMovementAuditLink_related_fkey"
    FOREIGN KEY ("tenantId", "relatedMovementId") REFERENCES "BankMovement"("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BankMovementAuditLink_related_key"
  ON "BankMovementAuditLink"("tenantId", "relatedMovementId");

CREATE UNIQUE INDEX "BankMovementAuditLink_reversal_once_key"
  ON "BankMovementAuditLink"("tenantId", "originalMovementId")
  WHERE "kind" = 'reversal' AND "originalMovementId" IS NOT NULL;

CREATE UNIQUE INDEX "BankMovementAuditLink_opening_once_key"
  ON "BankMovementAuditLink"("tenantId", "accountId")
  WHERE "kind" = 'opening';

CREATE INDEX "BankMovementAuditLink_account_created_idx"
  ON "BankMovementAuditLink"("tenantId", "accountId", "createdAt");

CREATE INDEX "BankMovementAuditLink_original_idx"
  ON "BankMovementAuditLink"("tenantId", "originalMovementId");
