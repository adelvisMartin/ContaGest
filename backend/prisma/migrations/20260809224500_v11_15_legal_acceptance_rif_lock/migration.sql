-- ContaGest v11.15 - legal acceptance evidence, cookie preferences and immutable company RIF.
-- Scope is intentionally limited to ContaGest tables. Do not add Budget Wallet or Hipico objects here.

CREATE TABLE IF NOT EXISTS public."LegalAcceptance" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."UserProfile"("id") ON DELETE CASCADE,
  "accountUserId" text NULL REFERENCES public."AccountUser"("id") ON DELETE SET NULL,
  "documentCode" text NOT NULL,
  "documentVersion" text NOT NULL,
  "documentHash" text NOT NULL,
  "acceptedAt" timestamptz NOT NULL DEFAULT now(),
  "acceptanceMethod" text NOT NULL DEFAULT 'explicit-checkbox',
  "locale" text NOT NULL DEFAULT 'es-VE',
  "ipAddress" text NULL,
  "userAgent" text NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "LegalAcceptance_unique_version" UNIQUE ("tenantId","userId","documentCode","documentVersion","documentHash")
);

CREATE INDEX IF NOT EXISTS "LegalAcceptance_user_tenant_idx"
  ON public."LegalAcceptance" ("userId","tenantId","acceptedAt" DESC);
CREATE INDEX IF NOT EXISTS "LegalAcceptance_document_idx"
  ON public."LegalAcceptance" ("documentCode","documentVersion","documentHash");

CREATE TABLE IF NOT EXISTS public."CookiePreference" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."UserProfile"("id") ON DELETE CASCADE,
  "necessaryAcknowledged" boolean NOT NULL DEFAULT true,
  "analyticsEnabled" boolean NOT NULL DEFAULT false,
  "marketingEnabled" boolean NOT NULL DEFAULT false,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedIp" text NULL,
  "updatedUserAgent" text NULL,
  CONSTRAINT "CookiePreference_user_tenant_key" UNIQUE ("tenantId","userId")
);

ALTER TABLE public."LegalAcceptance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CookiePreference" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."LegalAcceptance" FROM anon, authenticated;
REVOKE ALL ON TABLE public."CookiePreference" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."LegalAcceptance" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."CookiePreference" TO service_role;

-- A company's fiscal identity is immutable through normal runtime operations.
-- A genuine correction must be executed as a controlled, documented platform migration
-- after validating the requester and the supporting SENIAT documentation.
CREATE OR REPLACE FUNCTION private.contagest_prevent_tenant_rif_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF NEW."rif" IS DISTINCT FROM OLD."rif" THEN
    RAISE EXCEPTION 'tenant_rif_immutable'
      USING ERRCODE = '23514',
            DETAIL = 'The registered company RIF cannot be modified through normal runtime operations.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Tenant_rif_immutable" ON public."Tenant";
CREATE TRIGGER "Tenant_rif_immutable"
BEFORE UPDATE OF "rif" ON public."Tenant"
FOR EACH ROW EXECUTE FUNCTION private.contagest_prevent_tenant_rif_update();
