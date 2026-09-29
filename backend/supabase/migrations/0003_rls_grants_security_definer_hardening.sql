-- ContaGest issue #635 · forward-only RLS/grants/SECURITY DEFINER hardening.
-- This is a policy sidecar, not structural migration authority. It is applied after 0002.
-- SOURCE_REUSE=NONE

CREATE SCHEMA IF NOT EXISTS private;

-- Mutable schemas must never be writable by request-facing roles. PUBLIC is a
-- PostgreSQL pseudo-role and is intentionally listed first for auditability.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE CREATE ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Canonical tenant/profile resolvers. The SECURITY DEFINER boundary is kept
-- private, uses schema-qualified objects, has a closed search_path and exposes
-- only the minimum EXECUTE grant required by authenticated RLS policies.
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

ALTER FUNCTION private.current_tenant_id() OWNER TO CURRENT_USER;
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

ALTER FUNCTION private.current_profile_id() OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION private.current_profile_id() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.current_profile_id() TO authenticated;

-- 0002 is retained as historical policy input, therefore these public names
-- remain compatibility wrappers for policies that reference them. They are
-- SECURITY INVOKER and cannot themselves elevate privileges.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, private, public
AS $$
  SELECT private.current_tenant_id();
$$;

ALTER FUNCTION public.current_tenant_id() OWNER TO CURRENT_USER;
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

ALTER FUNCTION public.current_profile_id() OWNER TO CURRENT_USER;
REVOKE ALL ON FUNCTION public.current_profile_id() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Remove that
-- implicit privilege from every ContaGest SECURITY DEFINER function in the
-- application schemas, excluding extension-owned objects. Existing explicit
-- grants to authenticated/service roles are preserved for compatibility; the
-- catalog audit added by #635 classifies any excessive explicit grant.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT
      p.oid::regprocedure AS signature,
      p.proconfig AS config
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend AS d
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
    ORDER BY n.nspname, p.proname, p.oid
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn.signature);

    -- Close search_path for application definers. auth is included only as a
    -- trusted managed schema for legacy functions that use auth helpers
    -- unqualified; request-facing roles cannot CREATE in any preceding schema.
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path TO pg_catalog, private, public, auth',
      fn.signature
    );
  END LOOP;
END
$$;

-- Re-assert the stricter path on the two canonical helpers after the generic
-- pass so the final manifest is deterministic and minimal.
ALTER FUNCTION private.current_tenant_id() SET search_path TO pg_catalog, private, public;
ALTER FUNCTION private.current_profile_id() SET search_path TO pg_catalog, private, public;
