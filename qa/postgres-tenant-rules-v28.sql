\set ON_ERROR_STOP on
\pset pager off

DO $$
BEGIN
  IF current_database() !~ '_e2e$' THEN
    RAISE EXCEPTION 'issue_28_requires_ephemeral_e2e_database: %', current_database();
  END IF;
END;
$$;

BEGIN;

-- All fixtures live inside this transaction and are rolled back at the end.
INSERT INTO public."Tenant" ("id","rif","name","legalName","plan","status","settings","createdAt","updatedAt")
VALUES
  ('qa28-tenant-a','J-28000001','QA28 Empresa A','QA28 Empresa A','enterprise','active','{}'::jsonb,now(),now()),
  ('qa28-tenant-b','J-28000002','QA28 Empresa B','QA28 Empresa B','enterprise','active','{}'::jsonb,now(),now());

INSERT INTO public."UserProfile" ("id","tenantId","email","fullName","status","createdAt","updatedAt")
VALUES ('qa28-user-a','qa28-tenant-a','qa28-user-a@example.test','QA28 User A','active',now(),now());

INSERT INTO public."CustomerAccount" ("id","legalName","rif","segment","status","metadata","createdAt","updatedAt")
VALUES ('qa28-customer','QA28 Customer','J-28999999','smb','active','{}'::jsonb,now(),now());

INSERT INTO public."Subscription"
  ("id","customerAccountId","planCode","customerSegment","billingCycle","currency","amount","status","startsAt","maxTenants","maxUsers","supportLevel","metadata","createdAt","updatedAt")
VALUES
  ('qa28-sub','qa28-customer','qa28','smb','monthly','USD',10,'active',now(),1,1,'standard','{}'::jsonb,now(),now());

INSERT INTO public."SubscriptionTenant" ("id","subscriptionId","tenantId","status","createdAt","updatedAt")
VALUES ('qa28-st-a','qa28-sub','qa28-tenant-a','active',now(),now());

-- AC1: Tenant.rif is immutable.
DO $$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    UPDATE public."Tenant" SET "rif"='J-28000999' WHERE "id"='qa28-tenant-a';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='23514' AND SQLERRM LIKE '%tenant_rif_immutable%' THEN
      rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'qa28_expected_tenant_rif_update_rejection';
  END IF;
  RAISE NOTICE '[qa28][PASS] Tenant RIF UPDATE rejected';
END;
$$;

-- AC2: maxTenants=1 rejects a second distinct RIF/tenant.
DO $$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO public."SubscriptionTenant" ("id","subscriptionId","tenantId","status","createdAt","updatedAt")
    VALUES ('qa28-st-b','qa28-sub','qa28-tenant-b','active',now(),now());
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%subscription_tenant_limit_reached%' THEN
      rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'qa28_expected_second_tenant_rejection';
  END IF;
  IF (SELECT count(*) FROM public."SubscriptionTenant" WHERE "subscriptionId"='qa28-sub' AND "status"='active') <> 1 THEN
    RAISE EXCEPTION 'qa28_tenant_limit_left_invalid_state';
  END IF;
  RAISE NOTICE '[qa28][PASS] maxTenants rejected second RIF';
END;
$$;

-- AC3: maxUsers=1 counts distinct active licensed emails and rejects the second.
INSERT INTO public."LicenseKey"
  ("id","tenantId","userId","userEmail","plan","keyHash","keyPreview","modules","expiresAt","status","subscriptionId","createdAt","updatedAt")
VALUES
  ('qa28-license-a','qa28-tenant-a','qa28-user-a','qa28-user-a@example.test','qa28',repeat('a',64),'qa28…a','["clientes"]'::jsonb,now()+interval '1 day','active','qa28-sub',now(),now());

DO $$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO public."LicenseKey"
      ("id","tenantId","userEmail","plan","keyHash","keyPreview","modules","expiresAt","status","subscriptionId","createdAt","updatedAt")
    VALUES
      ('qa28-license-b','qa28-tenant-a','qa28-user-b@example.test','qa28',repeat('b',64),'qa28…b','["clientes"]'::jsonb,now()+interval '1 day','active','qa28-sub',now(),now());
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%subscription_user_limit_reached%' THEN
      rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'qa28_expected_second_user_rejection';
  END IF;
  IF (SELECT count(DISTINCT lower("userEmail")) FROM public."LicenseKey" WHERE "subscriptionId"='qa28-sub' AND "status"='active') <> 1 THEN
    RAISE EXCEPTION 'qa28_user_limit_left_invalid_state';
  END IF;
  RAISE NOTICE '[qa28][PASS] maxUsers rejected second distinct user';
END;
$$;

-- AC4: a subscription-bound license cannot target a tenant not covered by SubscriptionTenant.
DO $$
DECLARE
  rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO public."LicenseKey"
      ("id","tenantId","userEmail","plan","keyHash","keyPreview","modules","expiresAt","status","subscriptionId","createdAt","updatedAt")
    VALUES
      ('qa28-license-uncovered','qa28-tenant-b','qa28-uncovered@example.test','qa28',repeat('c',64),'qa28…c','[]'::jsonb,now()+interval '1 day','active','qa28-sub',now(),now());
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%subscription_not_entitled_for_tenant%' THEN
      rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'qa28_expected_uncovered_tenant_license_rejection';
  END IF;
  RAISE NOTICE '[qa28][PASS] uncovered tenant license rejected';
END;
$$;

-- AC5a: legal evidence tables are RLS-protected and not directly readable/writable by public auth roles.
DO $$
DECLARE
  legal_rls boolean;
  cookie_rls boolean;
BEGIN
  SELECT c.relrowsecurity INTO legal_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='LegalAcceptance';
  SELECT c.relrowsecurity INTO cookie_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='CookiePreference';

  IF legal_rls IS DISTINCT FROM true OR cookie_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'qa28_legal_tables_must_have_rls';
  END IF;
  IF has_table_privilege('anon','public."LegalAcceptance"','SELECT')
     OR has_table_privilege('authenticated','public."LegalAcceptance"','SELECT')
     OR has_table_privilege('anon','public."CookiePreference"','SELECT')
     OR has_table_privilege('authenticated','public."CookiePreference"','SELECT') THEN
    RAISE EXCEPTION 'qa28_legal_tables_exposed_to_public_auth_roles';
  END IF;
  RAISE NOTICE '[qa28][PASS] legal tables private by RLS + grants';
END;
$$;

-- AC5b: acceptance evidence is versioned; distinct versions coexist and exact duplicate is rejected.
INSERT INTO public."LegalAcceptance"
  ("id","tenantId","userId","documentCode","documentVersion","documentHash","acceptanceMethod","locale","metadata","createdAt")
VALUES
  ('qa28-legal-v1','qa28-tenant-a','qa28-user-a','terms','1.0','sha256:qa28-v1','explicit-checkbox','es-VE','{}'::jsonb,now()),
  ('qa28-legal-v2','qa28-tenant-a','qa28-user-a','terms','2.0','sha256:qa28-v2','explicit-checkbox','es-VE','{}'::jsonb,now());

DO $$
DECLARE
  rejected boolean := false;
  versions integer;
BEGIN
  SELECT count(*)::int INTO versions
  FROM public."LegalAcceptance"
  WHERE "tenantId"='qa28-tenant-a' AND "userId"='qa28-user-a' AND "documentCode"='terms';
  IF versions <> 2 THEN
    RAISE EXCEPTION 'qa28_versioned_legal_acceptance_not_preserved';
  END IF;

  BEGIN
    INSERT INTO public."LegalAcceptance"
      ("id","tenantId","userId","documentCode","documentVersion","documentHash","acceptanceMethod","locale","metadata","createdAt")
    VALUES
      ('qa28-legal-dup','qa28-tenant-a','qa28-user-a','terms','2.0','sha256:qa28-v2','explicit-checkbox','es-VE','{}'::jsonb,now());
  EXCEPTION WHEN unique_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'qa28_expected_exact_legal_acceptance_duplicate_rejection';
  END IF;
  RAISE NOTICE '[qa28][PASS] legal acceptance versions preserved; exact duplicate rejected';
END;
$$;

-- Confirm that only intended QA rows were created inside this transaction.
SELECT '[qa28][SUMMARY] active tenants=' || count(*)::text
FROM public."SubscriptionTenant"
WHERE "subscriptionId"='qa28-sub' AND "status"='active';

ROLLBACK;

-- The rollback itself is part of the isolation contract.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."Tenant" WHERE "id" LIKE 'qa28-%')
     OR EXISTS (SELECT 1 FROM public."CustomerAccount" WHERE "id" LIKE 'qa28-%')
     OR EXISTS (SELECT 1 FROM public."Subscription" WHERE "id" LIKE 'qa28-%')
     OR EXISTS (SELECT 1 FROM public."LicenseKey" WHERE "id" LIKE 'qa28-%')
     OR EXISTS (SELECT 1 FROM public."LegalAcceptance" WHERE "id" LIKE 'qa28-%') THEN
    RAISE EXCEPTION 'qa28_transaction_cleanup_failed';
  END IF;
  RAISE NOTICE '[qa28][PASS] fixture transaction rolled back cleanly';
END;
$$;
