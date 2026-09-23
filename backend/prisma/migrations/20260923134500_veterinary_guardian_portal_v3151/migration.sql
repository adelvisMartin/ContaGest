-- 31/51 · Veterinaria · portal temporal y revocable para tutor.
-- La tabla sólo almacena grants; las autoridades clínicas/comerciales siguen en Care*/SalesInvoice.

CREATE TABLE IF NOT EXISTS public."VeterinaryGuardianPortalGrant" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES public."CarePatient"("id") ON DELETE CASCADE,
  "tokenSha256" text NOT NULL,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "expiresAt" timestamptz NOT NULL,
  "revokedAt" timestamptz,
  "createdBy" text,
  "lastUsedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "VeterinaryGuardianPortalGrant_token_unique" UNIQUE ("tokenSha256"),
  CONSTRAINT "VeterinaryGuardianPortalGrant_expiry_check" CHECK ("expiresAt" > "createdAt")
);

CREATE INDEX IF NOT EXISTS "VeterinaryGuardianPortalGrant_tenant_patient_created_idx"
  ON public."VeterinaryGuardianPortalGrant" ("tenantId","patientId","createdAt" DESC);

CREATE INDEX IF NOT EXISTS "VeterinaryGuardianPortalGrant_active_idx"
  ON public."VeterinaryGuardianPortalGrant" ("tokenSha256","expiresAt")
  WHERE "revokedAt" IS NULL;

ALTER TABLE public."VeterinaryGuardianPortalGrant" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."VeterinaryGuardianPortalGrant" FROM anon, authenticated;
