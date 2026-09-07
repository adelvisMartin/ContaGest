CREATE TABLE IF NOT EXISTS "BankStatementImport" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "accountId" text NOT NULL REFERENCES "BankAccount"("id") ON DELETE RESTRICT,
  "fileName" text NOT NULL,
  "format" varchar(12) NOT NULL CHECK ("format" IN ('csv','ofx','qfx','camt')),
  "parserName" varchar(80) NOT NULL,
  "parserVersion" varchar(40) NOT NULL,
  "sourceHash" char(64) NOT NULL,
  "rawContent" bytea NOT NULL,
  "openingBalance" numeric(18,2),
  "closingBalance" numeric(18,2),
  "currency" varchar(4) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'imported' CHECK ("status" IN ('imported','review','error')),
  "sourceMetadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "uploadedBy" text REFERENCES "UserProfile"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "accountId", "sourceHash")
);

CREATE TABLE IF NOT EXISTS "BankStatementLine" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "importId" text NOT NULL REFERENCES "BankStatementImport"("id") ON DELETE CASCADE,
  "accountId" text NOT NULL REFERENCES "BankAccount"("id") ON DELETE RESTRICT,
  "bankLineId" text,
  "lineHash" char(64) NOT NULL,
  "bookedAt" timestamptz NOT NULL,
  "valueDate" timestamptz,
  "amount" numeric(18,2) NOT NULL,
  "currency" varchar(4) NOT NULL,
  "reference" varchar(240),
  "memo" varchar(1000),
  "counterparty" varchar(240),
  "raw" jsonb NOT NULL,
  "normalized" jsonb NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'unmatched' CHECK ("status" IN ('unmatched','suggested','partial','reconciled','conflict')),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "accountId", "lineHash")
);

CREATE TABLE IF NOT EXISTS "BankReconciliation" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "accountId" text NOT NULL REFERENCES "BankAccount"("id") ON DELETE RESTRICT,
  "statementLineId" text NOT NULL REFERENCES "BankStatementLine"("id") ON DELETE RESTRICT,
  "kind" varchar(24) NOT NULL CHECK ("kind" IN ('match','partial','writeoff','model')),
  "status" varchar(20) NOT NULL DEFAULT 'confirmed' CHECK ("status" IN ('confirmed','reversed')),
  "confidence" numeric(5,4),
  "reasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "matchedAmount" numeric(18,2) NOT NULL,
  "writeoffAccountCode" varchar(80),
  "writeoffReason" varchar(500),
  "ledgerEntryId" text REFERENCES "LedgerEntry"("id") ON DELETE SET NULL,
  "createdBy" text REFERENCES "UserProfile"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "reversedBy" text REFERENCES "UserProfile"("id") ON DELETE SET NULL,
  "reversedAt" timestamptz,
  "reversalLedgerEntryId" text REFERENCES "LedgerEntry"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "BankReconciliationAllocation" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "reconciliationId" text NOT NULL REFERENCES "BankReconciliation"("id") ON DELETE CASCADE,
  "targetType" varchar(32) NOT NULL CHECK ("targetType" IN ('bank_movement','sales_invoice','purchase_invoice','ledger_entry','writeoff')),
  "targetId" text,
  "amount" numeric(18,2) NOT NULL CHECK ("amount" > 0),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "BankReconciliationModel" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "name" varchar(160) NOT NULL,
  "version" integer NOT NULL CHECK ("version" > 0),
  "active" boolean NOT NULL DEFAULT true,
  "memoPattern" varchar(240) NOT NULL,
  "accountCode" varchar(80) NOT NULL,
  "accountName" varchar(160) NOT NULL,
  "reasonCode" varchar(64) NOT NULL,
  "createdBy" text REFERENCES "UserProfile"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "name", "version")
);

CREATE TABLE IF NOT EXISTS "BankReconciliationEvent" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "statementLineId" text NOT NULL REFERENCES "BankStatementLine"("id") ON DELETE RESTRICT,
  "reconciliationId" text REFERENCES "BankReconciliation"("id") ON DELETE SET NULL,
  "type" varchar(40) NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actorId" text REFERENCES "UserProfile"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "BankStatementImport_tenant_account_idx" ON "BankStatementImport" ("tenantId","accountId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "BankStatementLine_tenant_status_idx" ON "BankStatementLine" ("tenantId","accountId","status","bookedAt" DESC);
CREATE INDEX IF NOT EXISTS "BankStatementLine_reference_idx" ON "BankStatementLine" ("tenantId","reference");
CREATE INDEX IF NOT EXISTS "BankReconciliation_line_idx" ON "BankReconciliation" ("tenantId","statementLineId","status","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "BankReconciliationAllocation_target_idx" ON "BankReconciliationAllocation" ("tenantId","targetType","targetId");
CREATE INDEX IF NOT EXISTS "BankReconciliationEvent_line_idx" ON "BankReconciliationEvent" ("tenantId","statementLineId","createdAt");

ALTER TABLE "BankStatementImport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankStatementImport" FORCE ROW LEVEL SECURITY;
ALTER TABLE "BankStatementLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankStatementLine" FORCE ROW LEVEL SECURITY;
ALTER TABLE "BankReconciliation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankReconciliation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "BankReconciliationAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankReconciliationAllocation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "BankReconciliationModel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankReconciliationModel" FORCE ROW LEVEL SECURITY;
ALTER TABLE "BankReconciliationEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankReconciliationEvent" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_bank_statement_import" ON "BankStatementImport";
CREATE POLICY "tenant_isolation_bank_statement_import" ON "BankStatementImport" USING ("tenantId"=private.current_tenant_id()) WITH CHECK ("tenantId"=private.current_tenant_id());
DROP POLICY IF EXISTS "tenant_isolation_bank_statement_line" ON "BankStatementLine";
CREATE POLICY "tenant_isolation_bank_statement_line" ON "BankStatementLine" USING ("tenantId"=private.current_tenant_id()) WITH CHECK ("tenantId"=private.current_tenant_id());
DROP POLICY IF EXISTS "tenant_isolation_bank_reconciliation" ON "BankReconciliation";
CREATE POLICY "tenant_isolation_bank_reconciliation" ON "BankReconciliation" USING ("tenantId"=private.current_tenant_id()) WITH CHECK ("tenantId"=private.current_tenant_id());
DROP POLICY IF EXISTS "tenant_isolation_bank_reconciliation_allocation" ON "BankReconciliationAllocation";
CREATE POLICY "tenant_isolation_bank_reconciliation_allocation" ON "BankReconciliationAllocation" USING ("tenantId"=private.current_tenant_id()) WITH CHECK ("tenantId"=private.current_tenant_id());
DROP POLICY IF EXISTS "tenant_isolation_bank_reconciliation_model" ON "BankReconciliationModel";
CREATE POLICY "tenant_isolation_bank_reconciliation_model" ON "BankReconciliationModel" USING ("tenantId"=private.current_tenant_id()) WITH CHECK ("tenantId"=private.current_tenant_id());
DROP POLICY IF EXISTS "tenant_isolation_bank_reconciliation_event" ON "BankReconciliationEvent";
CREATE POLICY "tenant_isolation_bank_reconciliation_event" ON "BankReconciliationEvent" USING ("tenantId"=private.current_tenant_id()) WITH CHECK ("tenantId"=private.current_tenant_id());

COMMENT ON COLUMN "BankStatementImport"."rawContent" IS 'Immutable source evidence. Application code never updates it.';
COMMENT ON COLUMN "BankStatementLine"."raw" IS 'Immutable parser provenance for one bank statement line.';