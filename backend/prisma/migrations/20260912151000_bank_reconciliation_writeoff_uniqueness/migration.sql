CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_bank_reconciliation_source_key"
  ON "LedgerEntry" ("tenantId", "source", "sourceId")
  WHERE "source" = 'banking'
    AND "sourceId" LIKE 'bank-reconciliation:%';

COMMENT ON INDEX "LedgerEntry_bank_reconciliation_source_key" IS
  'Exactly one ledger entry may represent a bank-reconciliation write-off intent, including retries and concurrent recovery.';
