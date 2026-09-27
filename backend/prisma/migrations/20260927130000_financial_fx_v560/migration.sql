-- #560 · authoritative multi-currency / FX sidecar
-- Forward-only. Existing financial documents and ledger rows remain untouched.

CREATE TABLE "FinancialFxPolicy" (
  "tenantId" UUID NOT NULL,
  "policyVersion" INTEGER NOT NULL DEFAULT 1,
  "functionalCurrency" VARCHAR(3) NOT NULL,
  "roundingMode" TEXT NOT NULL DEFAULT 'ROUND_HALF_UP',
  "moneyScale" SMALLINT NOT NULL DEFAULT 2,
  "exchangeRateScale" SMALLINT NOT NULL DEFAULT 4,
  "updatedBy" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "FinancialFxPolicy_pkey" PRIMARY KEY ("tenantId"),
  CONSTRAINT "FinancialFxPolicy_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "FinancialFxPolicy_currency_check" CHECK ("functionalCurrency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "FinancialFxPolicy_version_check" CHECK ("policyVersion" = 1),
  CONSTRAINT "FinancialFxPolicy_rounding_check" CHECK ("roundingMode" = 'ROUND_HALF_UP'),
  CONSTRAINT "FinancialFxPolicy_scale_check" CHECK ("moneyScale" = 2 AND "exchangeRateScale" = 4)
);

CREATE TABLE "FinancialFxDocumentSnapshot" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "documentType" TEXT NOT NULL,
  "documentId" UUID NOT NULL,
  "originalCurrency" VARCHAR(3) NOT NULL,
  "functionalCurrency" VARCHAR(3) NOT NULL,
  "exchangeRate" NUMERIC(18,4) NOT NULL,
  "rateDate" TIMESTAMPTZ NOT NULL,
  "rateSource" TEXT NOT NULL,
  "originalSubtotal" NUMERIC(18,2) NOT NULL,
  "originalTax" NUMERIC(18,2) NOT NULL,
  "originalTotal" NUMERIC(18,2) NOT NULL,
  "functionalSubtotal" NUMERIC(18,2) NOT NULL,
  "functionalTax" NUMERIC(18,2) NOT NULL,
  "functionalTotal" NUMERIC(18,2) NOT NULL,
  "policyVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "FinancialFxDocumentSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialFxDocumentSnapshot_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "FinancialFxDocumentSnapshot_document_type_check" CHECK ("documentType" IN ('sales','purchase')),
  CONSTRAINT "FinancialFxDocumentSnapshot_currency_check" CHECK ("originalCurrency" ~ '^[A-Z]{3}$' AND "functionalCurrency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "FinancialFxDocumentSnapshot_rate_check" CHECK ("exchangeRate" > 0),
  CONSTRAINT "FinancialFxDocumentSnapshot_rate_source_check" CHECK (LENGTH(BTRIM("rateSource")) > 0),
  CONSTRAINT "FinancialFxDocumentSnapshot_policy_check" CHECK ("policyVersion" = 1),
  CONSTRAINT "FinancialFxDocumentSnapshot_tenant_document_key" UNIQUE ("tenantId","documentType","documentId")
);
CREATE INDEX "FinancialFxDocumentSnapshot_tenant_currency_idx" ON "FinancialFxDocumentSnapshot"("tenantId","originalCurrency","createdAt");

CREATE TABLE "FinancialFxLedgerLineSnapshot" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "ledgerLineId" UUID NOT NULL,
  "originalDebit" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "originalCredit" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "functionalDebit" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "functionalCredit" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "originalCurrency" VARCHAR(3) NOT NULL,
  "functionalCurrency" VARCHAR(3) NOT NULL,
  "exchangeRate" NUMERIC(18,4) NOT NULL,
  "rateDate" TIMESTAMPTZ NOT NULL,
  "rateSource" TEXT NOT NULL,
  "policyVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "FinancialFxLedgerLineSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialFxLedgerLineSnapshot_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "FinancialFxLedgerLineSnapshot_line_fkey" FOREIGN KEY ("ledgerLineId") REFERENCES "LedgerLine"("id") ON DELETE CASCADE,
  CONSTRAINT "FinancialFxLedgerLineSnapshot_line_key" UNIQUE ("ledgerLineId"),
  CONSTRAINT "FinancialFxLedgerLineSnapshot_currency_check" CHECK ("originalCurrency" ~ '^[A-Z]{3}$' AND "functionalCurrency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "FinancialFxLedgerLineSnapshot_rate_check" CHECK ("exchangeRate" > 0),
  CONSTRAINT "FinancialFxLedgerLineSnapshot_policy_check" CHECK ("policyVersion" = 1)
);
CREATE INDEX "FinancialFxLedgerLineSnapshot_tenant_idx" ON "FinancialFxLedgerLineSnapshot"("tenantId","createdAt");

CREATE TABLE "FinancialFxBankAccountMap" (
  "tenantId" UUID NOT NULL,
  "bankAccountId" UUID NOT NULL,
  "ledgerAccountCode" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "FinancialFxBankAccountMap_pkey" PRIMARY KEY ("tenantId","bankAccountId"),
  CONSTRAINT "FinancialFxBankAccountMap_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "FinancialFxBankAccountMap_account_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE,
  CONSTRAINT "FinancialFxBankAccountMap_code_check" CHECK (LENGTH(BTRIM("ledgerAccountCode")) > 0)
);

CREATE TABLE "FinancialFxEvent" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" UUID NOT NULL,
  "bankMovementId" UUID,
  "documentCurrency" VARCHAR(3) NOT NULL,
  "settlementCurrency" VARCHAR(3),
  "functionalCurrency" VARCHAR(3) NOT NULL,
  "originalAmount" NUMERIC(18,2) NOT NULL,
  "settlementAmount" NUMERIC(18,2),
  "historicalRate" NUMERIC(18,4) NOT NULL,
  "currentRate" NUMERIC(18,4) NOT NULL,
  "historicalFunctionalAmount" NUMERIC(18,2) NOT NULL,
  "currentFunctionalAmount" NUMERIC(18,2) NOT NULL,
  "difference" NUMERIC(18,2) NOT NULL,
  "fiscalPeriod" TEXT NOT NULL,
  "rateDate" TIMESTAMPTZ NOT NULL,
  "rateSource" TEXT NOT NULL,
  "ledgerEntryId" UUID NOT NULL,
  "reversalLedgerEntryId" UUID,
  "reversedAt" TIMESTAMPTZ,
  "policyVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "FinancialFxEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialFxEvent_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "FinancialFxEvent_bank_movement_fkey" FOREIGN KEY ("bankMovementId") REFERENCES "BankMovement"("id") ON DELETE RESTRICT,
  CONSTRAINT "FinancialFxEvent_ledger_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT,
  CONSTRAINT "FinancialFxEvent_reversal_ledger_fkey" FOREIGN KEY ("reversalLedgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT,
  CONSTRAINT "FinancialFxEvent_kind_check" CHECK ("kind" IN ('realized','unrealized')),
  CONSTRAINT "FinancialFxEvent_source_type_check" CHECK ("sourceType" IN ('sales','purchase')),
  CONSTRAINT "FinancialFxEvent_currency_check" CHECK ("documentCurrency" ~ '^[A-Z]{3}$' AND "functionalCurrency" ~ '^[A-Z]{3}$' AND ("settlementCurrency" IS NULL OR "settlementCurrency" ~ '^[A-Z]{3}$')),
  CONSTRAINT "FinancialFxEvent_amount_check" CHECK ("originalAmount" > 0 AND ("settlementAmount" IS NULL OR "settlementAmount" >= 0)),
  CONSTRAINT "FinancialFxEvent_rate_check" CHECK ("historicalRate" > 0 AND "currentRate" > 0),
  CONSTRAINT "FinancialFxEvent_policy_check" CHECK ("policyVersion" = 1),
  CONSTRAINT "FinancialFxEvent_ledger_key" UNIQUE ("ledgerEntryId"),
  CONSTRAINT "FinancialFxEvent_reversal_key" UNIQUE ("reversalLedgerEntryId")
);
CREATE INDEX "FinancialFxEvent_tenant_source_idx" ON "FinancialFxEvent"("tenantId","sourceType","sourceId","createdAt");
CREATE INDEX "FinancialFxEvent_tenant_kind_idx" ON "FinancialFxEvent"("tenantId","kind","fiscalPeriod");
CREATE UNIQUE INDEX "FinancialFxEvent_bank_movement_key" ON "FinancialFxEvent"("bankMovementId") WHERE "bankMovementId" IS NOT NULL;
