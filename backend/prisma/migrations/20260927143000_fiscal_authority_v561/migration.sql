-- #561 · forward-only fiscal authority.
-- PostgreSQL remains the canonical authority for rules, numbering and close evidence.

CREATE TABLE IF NOT EXISTS public."FiscalRuleVersion" (
  "id" uuid PRIMARY KEY,
  "tenantId" uuid NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "ruleKey" text NOT NULL,
  "version" integer NOT NULL CHECK ("version" > 0),
  "effectiveFrom" timestamptz NOT NULL,
  "effectiveTo" timestamptz,
  "source" text NOT NULL,
  "documentation" text NOT NULL,
  "definition" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "hash" text NOT NULL,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiscalRuleVersion_effective_window_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  CONSTRAINT "FiscalRuleVersion_tenant_rule_version_key" UNIQUE ("tenantId", "ruleKey", "version")
);
CREATE INDEX IF NOT EXISTS "FiscalRuleVersion_tenant_rule_effective_idx"
  ON public."FiscalRuleVersion" ("tenantId", "ruleKey", "effectiveFrom" DESC);

CREATE TABLE IF NOT EXISTS public."FiscalSequence" (
  "tenantId" uuid NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "prefix" text NOT NULL,
  "width" integer NOT NULL DEFAULT 8 CHECK ("width" BETWEEN 1 AND 18),
  "nextValue" bigint NOT NULL DEFAULT 1 CHECK ("nextValue" > 0),
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("tenantId", "kind")
);

CREATE TABLE IF NOT EXISTS public."FiscalDocumentRuleSnapshot" (
  "id" uuid PRIMARY KEY,
  "tenantId" uuid NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "fiscalDocumentId" uuid NOT NULL REFERENCES public."FiscalDocument"("id") ON DELETE RESTRICT,
  "ruleKey" text NOT NULL,
  "ruleVersion" integer NOT NULL,
  "ruleHash" text NOT NULL,
  "effectiveFrom" timestamptz NOT NULL,
  "effectiveTo" timestamptz,
  "source" text NOT NULL,
  "documentation" text NOT NULL,
  "definition" jsonb NOT NULL,
  "capturedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiscalDocumentRuleSnapshot_document_rule_key" UNIQUE ("fiscalDocumentId", "ruleKey")
);
CREATE INDEX IF NOT EXISTS "FiscalDocumentRuleSnapshot_tenant_document_idx"
  ON public."FiscalDocumentRuleSnapshot" ("tenantId", "fiscalDocumentId");

CREATE TABLE IF NOT EXISTS public."FiscalCloseEvidence" (
  "id" uuid PRIMARY KEY,
  "tenantId" uuid NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "closingPeriodId" uuid NOT NULL REFERENCES public."ClosingPeriod"("id") ON DELETE RESTRICT,
  "period" text NOT NULL,
  "module" text NOT NULL,
  "prechecks" jsonb NOT NULL,
  "postCloseReport" jsonb NOT NULL,
  "postCloseHash" text NOT NULL,
  "closedBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FiscalCloseEvidence_period_once_key" UNIQUE ("tenantId", "period", "module", "closingPeriodId")
);
CREATE INDEX IF NOT EXISTS "FiscalCloseEvidence_tenant_period_idx"
  ON public."FiscalCloseEvidence" ("tenantId", "period", "module");
