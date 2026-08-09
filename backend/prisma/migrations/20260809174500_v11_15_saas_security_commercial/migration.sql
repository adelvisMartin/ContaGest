-- ContaGest v11.15
-- Security sessions + server-issued device credentials + commercial subscriptions + controlled multi-company memberships.
-- IMPORTANT: this migration only creates/alters ContaGest tables. It does not touch Budget Wallet or Hipico tables.

CREATE TABLE IF NOT EXISTS public."AccountUser" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "email" text NOT NULL,
  "fullName" text,
  "status" text NOT NULL DEFAULT 'active',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "AccountUser_status_check" CHECK ("status" IN ('active','invited','disabled')),
  CONSTRAINT "AccountUser_email_unique" UNIQUE ("email")
);

CREATE TABLE IF NOT EXISTS public."TenantMembership" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountUserId" text NOT NULL REFERENCES public."AccountUser"("id") ON DELETE CASCADE,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "userProfileId" text NOT NULL REFERENCES public."UserProfile"("id") ON DELETE CASCADE,
  "roleLabel" text,
  "status" text NOT NULL DEFAULT 'active',
  "isDefault" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "TenantMembership_status_check" CHECK ("status" IN ('active','invited','suspended','revoked')),
  CONSTRAINT "TenantMembership_account_tenant_unique" UNIQUE ("accountUserId", "tenantId"),
  CONSTRAINT "TenantMembership_profile_unique" UNIQUE ("userProfileId")
);

CREATE TABLE IF NOT EXISTS public."CustomerAccount" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "legalName" text NOT NULL,
  "rif" text,
  "contactName" text,
  "email" text,
  "phone" text,
  "segment" text NOT NULL DEFAULT 'smb',
  "status" text NOT NULL DEFAULT 'prospect',
  "notes" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CustomerAccount_status_check" CHECK ("status" IN ('prospect','trial','active','past_due','suspended','cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerAccount_rif_unique_not_null"
  ON public."CustomerAccount" (upper("rif")) WHERE "rif" IS NOT NULL AND btrim("rif") <> '';
CREATE INDEX IF NOT EXISTS "CustomerAccount_status_segment_idx"
  ON public."CustomerAccount" ("status", "segment", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public."SalesAgent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" text NOT NULL,
  "email" text,
  "phone" text,
  "commissionRate" numeric(7,4) NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'active',
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SalesAgent_status_check" CHECK ("status" IN ('active','inactive')),
  CONSTRAINT "SalesAgent_commission_check" CHECK ("commissionRate" >= 0 AND "commissionRate" <= 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalesAgent_email_unique_not_null"
  ON public."SalesAgent" (lower("email")) WHERE "email" IS NOT NULL AND btrim("email") <> '';

CREATE TABLE IF NOT EXISTS public."Subscription" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "customerAccountId" text NOT NULL REFERENCES public."CustomerAccount"("id") ON DELETE RESTRICT,
  "salesAgentId" text REFERENCES public."SalesAgent"("id") ON DELETE SET NULL,
  "planCode" text NOT NULL,
  "customerSegment" text NOT NULL DEFAULT 'smb',
  "billingCycle" text NOT NULL DEFAULT 'monthly',
  "currency" text NOT NULL DEFAULT 'USD',
  "amount" numeric(18,2) NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'trial',
  "startsAt" timestamptz NOT NULL DEFAULT now(),
  "currentPeriodStart" timestamptz,
  "currentPeriodEnd" timestamptz,
  "nextRenewalAt" timestamptz,
  "graceUntil" timestamptz,
  "maxTenants" integer NOT NULL DEFAULT 1,
  "maxUsers" integer NOT NULL DEFAULT 3,
  "supportLevel" text NOT NULL DEFAULT 'standard',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Subscription_status_check" CHECK ("status" IN ('trial','active','past_due','suspended','cancelled','expired')),
  CONSTRAINT "Subscription_cycle_check" CHECK ("billingCycle" IN ('monthly','quarterly','semiannual','annual','manual')),
  CONSTRAINT "Subscription_max_tenants_check" CHECK ("maxTenants" BETWEEN 1 AND 1000),
  CONSTRAINT "Subscription_max_users_check" CHECK ("maxUsers" BETWEEN 1 AND 100000),
  CONSTRAINT "Subscription_amount_check" CHECK ("amount" >= 0)
);
CREATE INDEX IF NOT EXISTS "Subscription_status_renewal_idx"
  ON public."Subscription" ("status", "nextRenewalAt");
CREATE INDEX IF NOT EXISTS "Subscription_customer_idx"
  ON public."Subscription" ("customerAccountId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Subscription_agent_idx"
  ON public."Subscription" ("salesAgentId", "status");

CREATE TABLE IF NOT EXISTS public."SubscriptionTenant" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "subscriptionId" text NOT NULL REFERENCES public."Subscription"("id") ON DELETE CASCADE,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE RESTRICT,
  "status" text NOT NULL DEFAULT 'active',
  "priceOverride" numeric(18,2),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SubscriptionTenant_status_check" CHECK ("status" IN ('active','suspended','removed')),
  CONSTRAINT "SubscriptionTenant_unique" UNIQUE ("subscriptionId", "tenantId")
);
CREATE INDEX IF NOT EXISTS "SubscriptionTenant_tenant_idx"
  ON public."SubscriptionTenant" ("tenantId", "status");

CREATE TABLE IF NOT EXISTS public."ModuleEntitlement" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "subscriptionId" text NOT NULL REFERENCES public."Subscription"("id") ON DELETE CASCADE,
  "moduleCode" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'core',
  "status" text NOT NULL DEFAULT 'active',
  "quantity" integer NOT NULL DEFAULT 1,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ModuleEntitlement_kind_check" CHECK ("kind" IN ('core','vertical','addon')),
  CONSTRAINT "ModuleEntitlement_status_check" CHECK ("status" IN ('active','suspended','removed')),
  CONSTRAINT "ModuleEntitlement_quantity_check" CHECK ("quantity" >= 1),
  CONSTRAINT "ModuleEntitlement_unique" UNIQUE ("subscriptionId", "moduleCode")
);
CREATE INDEX IF NOT EXISTS "ModuleEntitlement_subscription_kind_idx"
  ON public."ModuleEntitlement" ("subscriptionId", "kind", "status");

CREATE TABLE IF NOT EXISTS public."SubscriptionPayment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "subscriptionId" text NOT NULL REFERENCES public."Subscription"("id") ON DELETE RESTRICT,
  "amount" numeric(18,2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "method" text,
  "reference" text,
  "status" text NOT NULL DEFAULT 'pending',
  "periodStart" timestamptz,
  "periodEnd" timestamptz,
  "paidAt" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SubscriptionPayment_status_check" CHECK ("status" IN ('pending','paid','failed','refunded','void')),
  CONSTRAINT "SubscriptionPayment_amount_check" CHECK ("amount" >= 0)
);
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_subscription_status_idx"
  ON public."SubscriptionPayment" ("subscriptionId", "status", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public."Commission" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "salesAgentId" text NOT NULL REFERENCES public."SalesAgent"("id") ON DELETE RESTRICT,
  "subscriptionId" text NOT NULL REFERENCES public."Subscription"("id") ON DELETE RESTRICT,
  "paymentId" text REFERENCES public."SubscriptionPayment"("id") ON DELETE SET NULL,
  "rate" numeric(7,4) NOT NULL DEFAULT 0,
  "baseAmount" numeric(18,2) NOT NULL DEFAULT 0,
  "amount" numeric(18,2) NOT NULL DEFAULT 0,
  "currency" text NOT NULL DEFAULT 'USD',
  "status" text NOT NULL DEFAULT 'pending',
  "earnedAt" timestamptz,
  "paidAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Commission_status_check" CHECK ("status" IN ('pending','earned','paid','void')),
  CONSTRAINT "Commission_rate_check" CHECK ("rate" >= 0 AND "rate" <= 100)
);
CREATE INDEX IF NOT EXISTS "Commission_agent_status_idx"
  ON public."Commission" ("salesAgentId", "status", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public."UserSession" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" text NOT NULL REFERENCES public."UserProfile"("id") ON DELETE CASCADE,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "refreshHash" text NOT NULL,
  "csrfHash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "rotationCounter" integer NOT NULL DEFAULT 0,
  "expiresAt" timestamptz NOT NULL,
  "revokedAt" timestamptz,
  "lastSeenAt" timestamptz NOT NULL DEFAULT now(),
  "lastIp" text,
  "lastUserAgent" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserSession_status_check" CHECK ("status" IN ('active','revoked','expired')),
  CONSTRAINT "UserSession_refresh_unique" UNIQUE ("refreshHash")
);
CREATE INDEX IF NOT EXISTS "UserSession_user_status_idx"
  ON public."UserSession" ("userId", "tenantId", "status", "expiresAt");

ALTER TABLE public."LicenseKey"
  ADD COLUMN IF NOT EXISTS "subscriptionId" text,
  ADD COLUMN IF NOT EXISTS "issuedForMembershipId" text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LicenseKey_subscriptionId_fkey') THEN
    ALTER TABLE public."LicenseKey"
      ADD CONSTRAINT "LicenseKey_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES public."Subscription"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LicenseKey_membership_fkey') THEN
    ALTER TABLE public."LicenseKey"
      ADD CONSTRAINT "LicenseKey_membership_fkey"
      FOREIGN KEY ("issuedForMembershipId") REFERENCES public."TenantMembership"("id") ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "LicenseKey_subscription_tenant_idx"
  ON public."LicenseKey" ("subscriptionId", "tenantId", "status");

ALTER TABLE public."LicenseActivation"
  ADD COLUMN IF NOT EXISTS "credentialHash" text,
  ADD COLUMN IF NOT EXISTS "credentialPreview" text,
  ADD COLUMN IF NOT EXISTS "credentialVersion" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "credentialIssuedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "credentialExpiresAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "revokedAt" timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS "LicenseActivation_credential_unique"
  ON public."LicenseActivation" ("credentialHash") WHERE "credentialHash" IS NOT NULL;

-- Backfill global account identities without changing existing per-tenant UserProfile behavior.
INSERT INTO public."AccountUser" ("email", "fullName", "status", "createdAt", "updatedAt")
SELECT lower(up."email"), max(up."fullName"), 'active', min(up."createdAt"), now()
FROM public."UserProfile" up
WHERE up."email" IS NOT NULL AND btrim(up."email") <> ''
GROUP BY lower(up."email")
ON CONFLICT ("email") DO UPDATE SET
  "fullName" = COALESCE(EXCLUDED."fullName", public."AccountUser"."fullName"),
  "updatedAt" = now();

INSERT INTO public."TenantMembership" ("accountUserId", "tenantId", "userProfileId", "status", "isDefault", "createdAt", "updatedAt")
SELECT au."id", up."tenantId", up."id", CASE WHEN up."status"::text = 'active' THEN 'active' ELSE 'suspended' END,
       false, up."createdAt", now()
FROM public."UserProfile" up
JOIN public."AccountUser" au ON au."email" = lower(up."email")
ON CONFLICT ("accountUserId", "tenantId") DO UPDATE SET
  "userProfileId" = EXCLUDED."userProfileId",
  "status" = EXCLUDED."status",
  "updatedAt" = now();

-- Enforce the commercial tenant limit at the database boundary.
CREATE OR REPLACE FUNCTION private.enforce_subscription_tenant_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  allowed integer;
  current_count integer;
BEGIN
  SELECT "maxTenants" INTO allowed FROM public."Subscription" WHERE "id" = NEW."subscriptionId" FOR UPDATE;
  IF allowed IS NULL THEN RAISE EXCEPTION 'subscription_not_found'; END IF;
  SELECT count(*)::int INTO current_count
  FROM public."SubscriptionTenant"
  WHERE "subscriptionId" = NEW."subscriptionId"
    AND "status" = 'active'
    AND "id" <> NEW."id";
  IF NEW."status" = 'active' AND current_count >= allowed THEN
    RAISE EXCEPTION 'subscription_tenant_limit_reached';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "SubscriptionTenant_limit_trigger" ON public."SubscriptionTenant";
CREATE TRIGGER "SubscriptionTenant_limit_trigger"
BEFORE INSERT OR UPDATE OF "subscriptionId", "status" ON public."SubscriptionTenant"
FOR EACH ROW EXECUTE FUNCTION private.enforce_subscription_tenant_limit();

-- A license attached to a subscription can only be issued for a tenant explicitly entitled by that subscription.
CREATE OR REPLACE FUNCTION private.enforce_license_subscription_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF NEW."subscriptionId" IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public."SubscriptionTenant" st
    JOIN public."Subscription" s ON s."id" = st."subscriptionId"
    WHERE st."subscriptionId" = NEW."subscriptionId"
      AND st."tenantId" = NEW."tenantId"
      AND st."status" = 'active'
      AND s."status" IN ('trial','active','past_due')
  ) THEN
    RAISE EXCEPTION 'subscription_not_entitled_for_tenant';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "LicenseKey_subscription_tenant_trigger" ON public."LicenseKey";
CREATE TRIGGER "LicenseKey_subscription_tenant_trigger"
BEFORE INSERT OR UPDATE OF "subscriptionId", "tenantId" ON public."LicenseKey"
FOR EACH ROW EXECUTE FUNCTION private.enforce_license_subscription_tenant();

-- Browser clients do not need direct PostgREST access. Backend/database runtime is the security boundary.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'AccountUser','TenantMembership','CustomerAccount','SalesAgent','Subscription','SubscriptionTenant',
    'ModuleEntitlement','SubscriptionPayment','Commission','UserSession'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "AccountUser_service_role_all" ON public."AccountUser";
CREATE POLICY "AccountUser_service_role_all" ON public."AccountUser" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "TenantMembership_service_role_all" ON public."TenantMembership";
CREATE POLICY "TenantMembership_service_role_all" ON public."TenantMembership" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "CustomerAccount_service_role_all" ON public."CustomerAccount";
CREATE POLICY "CustomerAccount_service_role_all" ON public."CustomerAccount" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "SalesAgent_service_role_all" ON public."SalesAgent";
CREATE POLICY "SalesAgent_service_role_all" ON public."SalesAgent" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Subscription_service_role_all" ON public."Subscription";
CREATE POLICY "Subscription_service_role_all" ON public."Subscription" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "SubscriptionTenant_service_role_all" ON public."SubscriptionTenant";
CREATE POLICY "SubscriptionTenant_service_role_all" ON public."SubscriptionTenant" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ModuleEntitlement_service_role_all" ON public."ModuleEntitlement";
CREATE POLICY "ModuleEntitlement_service_role_all" ON public."ModuleEntitlement" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "SubscriptionPayment_service_role_all" ON public."SubscriptionPayment";
CREATE POLICY "SubscriptionPayment_service_role_all" ON public."SubscriptionPayment" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Commission_service_role_all" ON public."Commission";
CREATE POLICY "Commission_service_role_all" ON public."Commission" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "UserSession_service_role_all" ON public."UserSession";
CREATE POLICY "UserSession_service_role_all" ON public."UserSession" FOR ALL TO service_role USING (true) WITH CHECK (true);
