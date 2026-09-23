-- 30/51 · Veterinaria · estimación → autorización → atención → consumos → factura.
-- La autoridad clínica permanece en Care*; la autoridad comercial en SalesInvoice.
-- Estas tablas conservan workflow/provenance y evitan facturar dos veces el mismo consumo.

CREATE TABLE IF NOT EXISTS public."VeterinaryFinancialCase" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES public."CarePatient"("id") ON DELETE RESTRICT,
  "currency" text NOT NULL DEFAULT 'VES',
  "status" text NOT NULL DEFAULT 'proposed',
  "estimateSnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "estimateSha256" text NOT NULL,
  "estimatedSubtotal" numeric(18,2) NOT NULL,
  "estimatedTax" numeric(18,2) NOT NULL,
  "estimatedTotal" numeric(18,2) NOT NULL,
  "authorizationConsentId" text REFERENCES public."CareConsent"("id") ON DELETE RESTRICT,
  "careEncounterId" text REFERENCES public."CareEncounter"("id") ON DELETE RESTRICT,
  "hospitalizationId" text REFERENCES public."CareHospitalization"("id") ON DELETE RESTRICT,
  "salesInvoiceId" text REFERENCES public."SalesInvoice"("id") ON DELETE RESTRICT,
  "invoiceSnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdBy" text,
  "authorizedAt" timestamptz,
  "attendedAt" timestamptz,
  "invoicedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "VeterinaryFinancialCase_currency_check" CHECK ("currency"='VES'),
  CONSTRAINT "VeterinaryFinancialCase_status_check" CHECK ("status" IN ('proposed','authorized','attended','invoiced','cancelled')),
  CONSTRAINT "VeterinaryFinancialCase_estimate_amounts_check" CHECK ("estimatedSubtotal">=0 AND "estimatedTax">=0 AND "estimatedTotal">=0),
  CONSTRAINT "VeterinaryFinancialCase_care_source_check" CHECK (NOT ("careEncounterId" IS NOT NULL AND "hospitalizationId" IS NOT NULL)),
  CONSTRAINT "VeterinaryFinancialCase_tenant_sale_unique" UNIQUE ("tenantId","salesInvoiceId"),
  CONSTRAINT "VeterinaryFinancialCase_tenant_consent_unique" UNIQUE ("tenantId","authorizationConsentId")
);

CREATE INDEX IF NOT EXISTS "VeterinaryFinancialCase_tenant_patient_created_idx"
  ON public."VeterinaryFinancialCase" ("tenantId","patientId","createdAt" DESC);

CREATE INDEX IF NOT EXISTS "VeterinaryFinancialCase_tenant_status_idx"
  ON public."VeterinaryFinancialCase" ("tenantId","status","updatedAt" DESC);

CREATE TABLE IF NOT EXISTS public."VeterinaryFinancialConsumptionLink" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "financialCaseId" text NOT NULL REFERENCES public."VeterinaryFinancialCase"("id") ON DELETE RESTRICT,
  "inventoryMovementId" text NOT NULL REFERENCES public."InventoryMovement"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "VeterinaryFinancialConsumptionLink_case_movement_unique" UNIQUE ("tenantId","financialCaseId","inventoryMovementId"),
  CONSTRAINT "VeterinaryFinancialConsumptionLink_movement_unique" UNIQUE ("tenantId","inventoryMovementId")
);

CREATE INDEX IF NOT EXISTS "VeterinaryFinancialConsumptionLink_case_idx"
  ON public."VeterinaryFinancialConsumptionLink" ("tenantId","financialCaseId","createdAt");

ALTER TABLE public."VeterinaryFinancialCase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VeterinaryFinancialConsumptionLink" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."VeterinaryFinancialCase" FROM anon, authenticated;
REVOKE ALL ON TABLE public."VeterinaryFinancialConsumptionLink" FROM anon, authenticated;
