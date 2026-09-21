-- 20/51 · Odontología · vínculo auditable con ERP financiero
-- CareEncounter mantiene la autoridad clínica y SalesInvoice la autoridad comercial.
-- Esta tabla sólo conserva provenance entre ambas autoridades.

CREATE TABLE IF NOT EXISTS public."DentalFinancialLink" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "treatmentPlanId" text NOT NULL REFERENCES public."CareEncounter"("id") ON DELETE RESTRICT,
  "patientId" text NOT NULL REFERENCES public."CarePatient"("id") ON DELETE RESTRICT,
  "salesInvoiceId" text NOT NULL REFERENCES public."SalesInvoice"("id") ON DELETE RESTRICT,
  "currency" text NOT NULL,
  "quotedTotal" numeric(18,2) NOT NULL,
  "budgetSnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "DentalFinancialLink_currency_check" CHECK ("currency" IN ('VES','USD')),
  CONSTRAINT "DentalFinancialLink_total_check" CHECK ("quotedTotal" >= 0),
  CONSTRAINT "DentalFinancialLink_tenant_plan_unique" UNIQUE ("tenantId","treatmentPlanId"),
  CONSTRAINT "DentalFinancialLink_tenant_sale_unique" UNIQUE ("tenantId","salesInvoiceId")
);

CREATE INDEX IF NOT EXISTS "DentalFinancialLink_tenant_patient_idx"
  ON public."DentalFinancialLink" ("tenantId","patientId","createdAt" DESC);

CREATE INDEX IF NOT EXISTS "DentalFinancialLink_tenant_created_idx"
  ON public."DentalFinancialLink" ("tenantId","createdAt" DESC);

ALTER TABLE public."DentalFinancialLink" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."DentalFinancialLink" FROM anon, authenticated;
