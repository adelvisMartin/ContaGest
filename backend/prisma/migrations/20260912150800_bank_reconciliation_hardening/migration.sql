ALTER TABLE "BankReconciliation"
  ADD COLUMN IF NOT EXISTS "requestHash" char(64);

ALTER TABLE "BankReconciliation"
  ALTER COLUMN "idempotencyKey" TYPE varchar(200);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BankReconciliation_request_hash_check'
  ) THEN
    ALTER TABLE "BankReconciliation"
      ADD CONSTRAINT "BankReconciliation_request_hash_check"
      CHECK ("requestHash" IS NULL OR "requestHash" ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "BankStatementLine_tenant_account_bank_line_id_key"
  ON "BankStatementLine" ("tenantId", "accountId", "bankLineId")
  WHERE "bankLineId" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BankReconciliationAllocation_target_identity_check'
  ) THEN
    ALTER TABLE "BankReconciliationAllocation"
      ADD CONSTRAINT "BankReconciliationAllocation_target_identity_check"
      CHECK (
        ("targetType" = 'writeoff' AND "targetId" IS NULL)
        OR ("targetType" <> 'writeoff' AND "targetId" IS NOT NULL)
      );
  END IF;
END $$;

ALTER TABLE "BankStatementImport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankStatementImport" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_bank_statement_import" ON "BankStatementImport";
CREATE POLICY "tenant_isolation_bank_statement_import" ON "BankStatementImport"
  USING ("tenantId" = private.current_tenant_id())
  WITH CHECK ("tenantId" = private.current_tenant_id());

ALTER TABLE "BankStatementLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankStatementLine" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_bank_statement_line" ON "BankStatementLine";
CREATE POLICY "tenant_isolation_bank_statement_line" ON "BankStatementLine"
  USING ("tenantId" = private.current_tenant_id())
  WITH CHECK ("tenantId" = private.current_tenant_id());

ALTER TABLE "BankReconciliation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankReconciliation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_bank_reconciliation" ON "BankReconciliation";
CREATE POLICY "tenant_isolation_bank_reconciliation" ON "BankReconciliation"
  USING ("tenantId" = private.current_tenant_id())
  WITH CHECK ("tenantId" = private.current_tenant_id());

ALTER TABLE "BankReconciliationAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankReconciliationAllocation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_bank_reconciliation_allocation" ON "BankReconciliationAllocation";
CREATE POLICY "tenant_isolation_bank_reconciliation_allocation" ON "BankReconciliationAllocation"
  USING ("tenantId" = private.current_tenant_id())
  WITH CHECK ("tenantId" = private.current_tenant_id());

ALTER TABLE "BankReconciliationModel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankReconciliationModel" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_bank_reconciliation_model" ON "BankReconciliationModel";
CREATE POLICY "tenant_isolation_bank_reconciliation_model" ON "BankReconciliationModel"
  USING ("tenantId" = private.current_tenant_id())
  WITH CHECK ("tenantId" = private.current_tenant_id());

ALTER TABLE "BankReconciliationEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankReconciliationEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_bank_reconciliation_event" ON "BankReconciliationEvent";
CREATE POLICY "tenant_isolation_bank_reconciliation_event" ON "BankReconciliationEvent"
  USING ("tenantId" = private.current_tenant_id())
  WITH CHECK ("tenantId" = private.current_tenant_id());

COMMENT ON COLUMN "BankReconciliation"."requestHash" IS
  'Canonical SHA-256 of the financial intent bound to Idempotency-Key; retries with another request fail closed.';
COMMENT ON INDEX "BankStatementLine_tenant_account_bank_line_id_key" IS
  'A bank-provided stable line identifier cannot be imported twice for the same tenant/account.';
