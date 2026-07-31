-- ContaGest v11.4: bind licenses to one tenant/company and control device activations.
ALTER TABLE public."LicenseKey"
  ADD COLUMN IF NOT EXISTS "businessCategory" text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS "companyName" text,
  ADD COLUMN IF NOT EXISTS "companyRif" text,
  ADD COLUMN IF NOT EXISTS "maxUsers" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "maxDevices" integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "activationCount" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastIp" text,
  ADD COLUMN IF NOT EXISTS "lastUserAgent" text,
  ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "revokedAt" timestamptz;

ALTER TABLE public."LicenseKey"
  DROP CONSTRAINT IF EXISTS "LicenseKey_maxUsers_check",
  ADD CONSTRAINT "LicenseKey_maxUsers_check" CHECK ("maxUsers" BETWEEN 1 AND 10000),
  DROP CONSTRAINT IF EXISTS "LicenseKey_maxDevices_check",
  ADD CONSTRAINT "LicenseKey_maxDevices_check" CHECK ("maxDevices" BETWEEN 1 AND 1000);

CREATE TABLE IF NOT EXISTS public."LicenseActivation" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "licenseId" text NOT NULL REFERENCES public."LicenseKey"("id") ON DELETE CASCADE,
  "userId" text REFERENCES public."UserProfile"("id") ON DELETE SET NULL,
  "deviceHash" text NOT NULL,
  "deviceLabel" text,
  "status" text NOT NULL DEFAULT 'active',
  "firstSeenAt" timestamptz NOT NULL DEFAULT now(),
  "lastSeenAt" timestamptz NOT NULL DEFAULT now(),
  "lastIp" text,
  "lastUserAgent" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "LicenseActivation_status_check" CHECK ("status" IN ('active','blocked','revoked')),
  CONSTRAINT "LicenseActivation_license_device_unique" UNIQUE ("licenseId", "deviceHash")
);

CREATE INDEX IF NOT EXISTS "LicenseKey_tenant_category_status_idx" ON public."LicenseKey" ("tenantId", "businessCategory", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "LicenseActivation_tenant_lastSeen_idx" ON public."LicenseActivation" ("tenantId", "lastSeenAt" DESC);
CREATE INDEX IF NOT EXISTS "LicenseActivation_license_status_idx" ON public."LicenseActivation" ("licenseId", "status");
ALTER TABLE public."LicenseActivation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "LicenseActivation_service_role_all" ON public."LicenseActivation";
CREATE POLICY "LicenseActivation_service_role_all" ON public."LicenseActivation" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "LicenseActivation_tenant_authenticated_all" ON public."LicenseActivation";
CREATE POLICY "LicenseActivation_tenant_authenticated_all" ON public."LicenseActivation" FOR ALL TO authenticated USING ("tenantId" = private.current_tenant_id()) WITH CHECK ("tenantId" = private.current_tenant_id());
REVOKE ALL ON TABLE public."LicenseActivation" FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."LicenseActivation" TO authenticated, service_role;
