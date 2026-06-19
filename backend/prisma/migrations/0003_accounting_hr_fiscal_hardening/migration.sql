-- ContaGest-VE v6: catálogo contable, reglas contables, documentos fiscales inmutables, parámetros RRHH y cierres por período.
CREATE TABLE IF NOT EXISTS "ChartAccount" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "nature" TEXT NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 1,
  "parentCode" TEXT,
  "allowPosting" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChartAccount_tenantId_code_key" ON "ChartAccount"("tenantId","code");
CREATE INDEX IF NOT EXISTS "ChartAccount_tenantId_type_idx" ON "ChartAccount"("tenantId","type");
CREATE INDEX IF NOT EXISTS "ChartAccount_tenantId_parentCode_idx" ON "ChartAccount"("tenantId","parentCode");

CREATE TABLE IF NOT EXISTS "AccountingRule" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "source" "LedgerSource" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "template" JSONB NOT NULL DEFAULT '{}',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingRule_tenantId_source_name_key" ON "AccountingRule"("tenantId","source","name");

CREATE TABLE IF NOT EXISTS "FiscalDocument" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'issued',
  "hash" TEXT NOT NULL,
  "fileUrl" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "FiscalDocument_tenantId_kind_number_key" ON "FiscalDocument"("tenantId","kind","number");
CREATE INDEX IF NOT EXISTS "FiscalDocument_tenantId_period_idx" ON "FiscalDocument"("tenantId","period");

CREATE TABLE IF NOT EXISTS "HrParameter" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "value" DECIMAL(18,4) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'percent',
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "HrParameter_tenantId_code_effectiveFrom_idx" ON "HrParameter"("tenantId","code","effectiveFrom");

CREATE TABLE IF NOT EXISTS "ClosingPeriod" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "period" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "closedAt" TIMESTAMP(3),
  "closedBy" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClosingPeriod_tenantId_period_module_key" ON "ClosingPeriod"("tenantId","period","module");
CREATE INDEX IF NOT EXISTS "ClosingPeriod_tenantId_status_idx" ON "ClosingPeriod"("tenantId","status");
