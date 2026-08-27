-- Issue #92: reusable financial idempotency ledger.
-- Additive only: no existing business rows are rewritten or deleted.

CREATE TABLE public."IdempotencyRecord" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "scope" VARCHAR(80) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'processing',
  "resourceType" VARCHAR(80),
  "resourceId" TEXT,
  "responseCode" INTEGER,
  "responsePayload" JSONB,
  "requestId" VARCHAR(96),
  "lastRequestId" VARCHAR(96),
  "hitCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),

  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdempotencyRecord_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IdempotencyRecord_status_check"
    CHECK ("status" IN ('processing', 'succeeded', 'failed')),
  CONSTRAINT "IdempotencyRecord_keyHash_check"
    CHECK ("keyHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "IdempotencyRecord_requestHash_check"
    CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "IdempotencyRecord_hitCount_check"
    CHECK ("hitCount" >= 0),
  CONSTRAINT "IdempotencyRecord_responseCode_check"
    CHECK ("responseCode" IS NULL OR ("responseCode" >= 100 AND "responseCode" <= 599))
);

CREATE UNIQUE INDEX "IdempotencyRecord_tenantId_scope_keyHash_key"
  ON public."IdempotencyRecord"("tenantId", "scope", "keyHash");

CREATE INDEX "IdempotencyRecord_tenantId_status_lastSeenAt_idx"
  ON public."IdempotencyRecord"("tenantId", "status", "lastSeenAt");

CREATE INDEX "IdempotencyRecord_tenantId_createdAt_idx"
  ON public."IdempotencyRecord"("tenantId", "createdAt");

COMMENT ON TABLE public."IdempotencyRecord" IS
  'Tenant-scoped idempotency evidence for mutations whose repeated execution could duplicate financial effects.';
COMMENT ON COLUMN public."IdempotencyRecord"."keyHash" IS
  'SHA-256 of the opaque client Idempotency-Key; the raw key is intentionally not stored.';
COMMENT ON COLUMN public."IdempotencyRecord"."requestHash" IS
  'SHA-256 of the canonicalized validated request relevant to the operation scope.';
COMMENT ON COLUMN public."IdempotencyRecord"."expiresAt" IS
  'Nullable by policy. Financial keys do not expire automatically until an approved retention policy guarantees expiry cannot re-enable a duplicate effect.';
