-- ContaGest issue #635 · forward-only RLS/grants/SECURITY DEFINER hardening.
-- This is policy authority, not Prisma structural migration authority. It runs after 0002.
-- SOURCE_REUSE=NONE

CREATE SCHEMA IF NOT EXISTS private;

-- Request-facing roles must not create shadow objects in application schemas.
-- service_role is intentionally not altered here because the Supabase project is
-- shared with other products; #635 only owns ContaGest application authority.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE CREATE ON SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Canonical tenant/profile resolvers. The privileged lookup stays private, uses
-- schema-qualified objects and a closed search_path. Policies that still refer
-- to the historical public names call SECURITY INVOKER compatibility wrappers.
CREATE OR REPLACE FUNCTION private.current_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT up."tenantId"
  FROM public."UserProfile" AS up
  WHERE up."authUserId" = auth.uid()::text
    AND up."status" = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.current_tenant_id() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.current_tenant_id() TO authenticated;

CREATE OR REPLACE FUNCTION private.current_profile_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
  SELECT up."id"
  FROM public."UserProfile" AS up
  WHERE up."authUserId" = auth.uid()::text
    AND up."status" = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.current_profile_id() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.current_profile_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, private, public
AS $$
  SELECT private.current_tenant_id();
$$;

REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, private, public
AS $$
  SELECT private.current_profile_id();
$$;

REVOKE ALL ON FUNCTION public.current_profile_id() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;

-- Harden only SECURITY DEFINER functions that are owned by ContaGest's Prisma
-- history. BudgetWallet/Hipico/platform functions share this database but have
-- separate authorities; the v635 audit inventories them without mutating them.
DO $$
DECLARE
  signature_text text;
  resolved regprocedure;
BEGIN
  FOREACH signature_text IN ARRAY ARRAY[
    'private.enforce_subscription_tenant_limit()',
    'private.enforce_license_subscription_tenant()',
    'private.enforce_subscription_user_limit()',
    'private.sync_license_permissions()'
  ]
  LOOP
    resolved := to_regprocedure(signature_text);
    IF resolved IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER FUNCTION %s SET search_path TO pg_catalog, private, public',
      resolved
    );
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      resolved
    );
  END LOOP;
END
$$;
