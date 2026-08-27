-- Issue #94: inventory balances are projections of immutable movements.
-- Existing stock/reserved values are intentionally NOT backfilled into fictional movements.

CREATE UNIQUE INDEX IF NOT EXISTS "Product_tenantId_id_key"
  ON "Product" ("tenantId", "id");

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryMovement_tenantId_id_key"
  ON "InventoryMovement" ("tenantId", "id");

CREATE TABLE IF NOT EXISTS "InventoryMovementAuditLink" (
  "id" UUID PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "originalMovementId" TEXT,
  "relatedMovementId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovementAuditLink_kind_check"
    CHECK ("kind" IN ('opening','adjustment','reversal')),
  CONSTRAINT "InventoryMovementAuditLink_product_fk"
    FOREIGN KEY ("tenantId", "productId")
    REFERENCES "Product" ("tenantId", "id") ON DELETE RESTRICT,
  CONSTRAINT "InventoryMovementAuditLink_related_fk"
    FOREIGN KEY ("tenantId", "relatedMovementId")
    REFERENCES "InventoryMovement" ("tenantId", "id") ON DELETE RESTRICT,
  CONSTRAINT "InventoryMovementAuditLink_original_fk"
    FOREIGN KEY ("tenantId", "originalMovementId")
    REFERENCES "InventoryMovement" ("tenantId", "id") ON DELETE RESTRICT,
  CONSTRAINT "InventoryMovementAuditLink_reversal_shape"
    CHECK (("kind" = 'reversal' AND "originalMovementId" IS NOT NULL) OR ("kind" <> 'reversal' AND "originalMovementId" IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryMovementAuditLink_related_key"
  ON "InventoryMovementAuditLink" ("tenantId", "relatedMovementId");

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryMovementAuditLink_one_opening_per_product"
  ON "InventoryMovementAuditLink" ("tenantId", "productId")
  WHERE "kind" = 'opening';

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryMovementAuditLink_one_reversal_per_original"
  ON "InventoryMovementAuditLink" ("tenantId", "originalMovementId")
  WHERE "kind" = 'reversal';

CREATE INDEX IF NOT EXISTS "InventoryMovementAuditLink_product_created_idx"
  ON "InventoryMovementAuditLink" ("tenantId", "productId", "createdAt");