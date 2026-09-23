-- 32/51 · Veterinaria · boarding/recursos opcional.
-- Mantiene estancia no clínica separada de CareHospitalization.
-- La disponibilidad se deriva de recursos + estancias, sin materializar un saldo paralelo.

CREATE TABLE IF NOT EXISTS public."VeterinaryBoardingSetting" (
  "tenantId" text PRIMARY KEY REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT false,
  "updatedBy" text,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."VeterinaryBoardingResource" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL DEFAULT 'cage',
  "location" text,
  "status" text NOT NULL DEFAULT 'active',
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "VeterinaryBoardingResource_type_check" CHECK ("type" IN ('cage','kennel','room','isolation','other')),
  CONSTRAINT "VeterinaryBoardingResource_status_check" CHECK ("status" IN ('active','maintenance','inactive')),
  CONSTRAINT "VeterinaryBoardingResource_tenant_code_unique" UNIQUE ("tenantId","code")
);

CREATE TABLE IF NOT EXISTS public."VeterinaryBoardingStay" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES public."CarePatient"("id") ON DELETE RESTRICT,
  "resourceId" text NOT NULL REFERENCES public."VeterinaryBoardingResource"("id") ON DELETE RESTRICT,
  "startsAt" timestamptz NOT NULL,
  "plannedEndsAt" timestamptz NOT NULL,
  "endedAt" timestamptz,
  "status" text NOT NULL DEFAULT 'reserved',
  "notes" text,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "VeterinaryBoardingStay_status_check" CHECK ("status" IN ('reserved','checked_in','completed','cancelled')),
  CONSTRAINT "VeterinaryBoardingStay_window_check" CHECK ("plannedEndsAt" > "startsAt"),
  CONSTRAINT "VeterinaryBoardingStay_end_check" CHECK ("endedAt" IS NULL OR "endedAt" >= "startsAt")
);

CREATE INDEX IF NOT EXISTS "VeterinaryBoardingResource_tenant_status_idx"
  ON public."VeterinaryBoardingResource" ("tenantId","status","name");
CREATE INDEX IF NOT EXISTS "VeterinaryBoardingStay_resource_window_idx"
  ON public."VeterinaryBoardingStay" ("tenantId","resourceId","startsAt","plannedEndsAt");
CREATE INDEX IF NOT EXISTS "VeterinaryBoardingStay_patient_window_idx"
  ON public."VeterinaryBoardingStay" ("tenantId","patientId","startsAt" DESC);

ALTER TABLE public."VeterinaryBoardingSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VeterinaryBoardingResource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VeterinaryBoardingStay" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."VeterinaryBoardingSetting" FROM anon, authenticated;
REVOKE ALL ON TABLE public."VeterinaryBoardingResource" FROM anon, authenticated;
REVOKE ALL ON TABLE public."VeterinaryBoardingStay" FROM anon, authenticated;
