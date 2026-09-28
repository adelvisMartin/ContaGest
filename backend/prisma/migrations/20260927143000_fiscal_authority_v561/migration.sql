-- #561 · forward-only fiscal authority.
-- PostgreSQL remains the canonical authority for rules, numbering and close evidence.

CREATE TABLE IF NOT EXISTS public."FiscalRuleVersion" (
  "id" uuid PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
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
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "prefix" text NOT NULL,
  "width" integer NOT NULL DEFAULT 8 CHECK ("width" BETWEEN 1 AND 18),
  "nextValue" bigint NOT NULL DEFAULT 1 CHECK ("nextValue" > 0),
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("tenantId", "kind")
);

CREATE TABLE IF NOT EXISTS public."FiscalDocumentRuleSnapshot" (
  "id" uuid PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "fiscalDocumentId" text NOT NULL REFERENCES public."FiscalDocument"("id") ON DELETE RESTRICT,
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
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "closingPeriodId" text NOT NULL REFERENCES public."ClosingPeriod"("id") ON DELETE RESTRICT,
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

-- The fiscal router already enforces these capabilities. Persist them so a clean
-- or upgraded database cannot end up with permanently unreachable fiscal routes.
INSERT INTO public."Permission" ("id", "key", "description") VALUES
  ('56100000-0000-4000-8000-000000000001', 'fiscal.read', 'Ver períodos, reglas y documentos fiscales'),
  ('56100000-0000-4000-8000-000000000002', 'fiscal.manage_documents', 'Emitir y gestionar documentos fiscales'),
  ('56100000-0000-4000-8000-000000000003', 'fiscal.close', 'Gestionar reglas y cerrar períodos fiscales'),
  ('56100000-0000-4000-8000-000000000004', 'fiscal.reopen', 'Reabrir períodos fiscales mediante aprobación')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

-- Existing global administrators retain the capabilities they already represent.
-- Other roles remain least-privilege and must receive fiscal grants explicitly.
INSERT INTO public."RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM public."Role" r
JOIN public."Permission" p ON p."key" IN ('fiscal.read','fiscal.manage_documents','fiscal.close','fiscal.reopen')
WHERE r."system" = true AND r."name" = 'Administrador Global'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;