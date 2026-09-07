CREATE TABLE IF NOT EXISTS "PayableDocument" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "supplierId" text REFERENCES "Supplier"("id") ON DELETE SET NULL,
  "purchaseInvoiceId" text REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL,
  "duplicateOfId" text REFERENCES "PayableDocument"("id") ON DELETE SET NULL,
  "documentHash" text NOT NULL,
  "fileName" text NOT NULL,
  "mimeType" text NOT NULL,
  "sizeBytes" integer NOT NULL CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 8388608),
  "originalContent" bytea NOT NULL,
  "sourceMetadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "uploaderId" text,
  "uploadedAt" timestamptz NOT NULL DEFAULT now(),
  "state" text NOT NULL DEFAULT 'uploaded' CHECK ("state" IN ('uploaded','parsing','review','draft_created','error')),
  "suspectedDuplicate" boolean NOT NULL DEFAULT false,
  "supplierReference" text,
  "parserName" text,
  "parserVersion" text,
  "parserResult" jsonb,
  "matchMode" text NOT NULL DEFAULT 'none' CHECK ("matchMode" IN ('none','2-way','3-way')),
  "matchResult" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "reviewedData" jsonb,
  "reviewStatus" text NOT NULL DEFAULT 'pending' CHECK ("reviewStatus" IN ('pending','confirmed','rejected')),
  "reviewedBy" text,
  "reviewedAt" timestamptz,
  "retentionUntil" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PayableDocument_tenant_hash_key" UNIQUE ("tenantId", "documentHash")
);

CREATE TABLE IF NOT EXISTS "PayableParserRun" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "documentId" text NOT NULL REFERENCES "PayableDocument"("id") ON DELETE CASCADE,
  "parserName" text NOT NULL,
  "parserVersion" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('success','error')),
  "result" jsonb,
  "errorCode" text,
  "errorMessage" text,
  "durationMs" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "PayableDocument_tenant_state_idx"
  ON "PayableDocument" ("tenantId", "state", "uploadedAt" DESC);
CREATE INDEX IF NOT EXISTS "PayableDocument_tenant_supplier_reference_idx"
  ON "PayableDocument" ("tenantId", "supplierId", "supplierReference");
CREATE INDEX IF NOT EXISTS "PayableParserRun_tenant_document_idx"
  ON "PayableParserRun" ("tenantId", "documentId", "createdAt" DESC);

ALTER TABLE "PayableDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayableDocument" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_payable_document" ON "PayableDocument";
CREATE POLICY "tenant_isolation_payable_document" ON "PayableDocument"
  USING ("tenantId" = private.current_tenant_id())
  WITH CHECK ("tenantId" = private.current_tenant_id());

ALTER TABLE "PayableParserRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayableParserRun" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_payable_parser_run" ON "PayableParserRun";
CREATE POLICY "tenant_isolation_payable_parser_run" ON "PayableParserRun"
  USING ("tenantId" = private.current_tenant_id())
  WITH CHECK ("tenantId" = private.current_tenant_id());

COMMENT ON COLUMN "PayableDocument"."originalContent" IS
  'Immutable original evidence. Application code never updates this column after ingestion.';
COMMENT ON COLUMN "PayableDocument"."parserResult" IS
  'First parser output retained immutably; reprocessing is appended to PayableParserRun.';
