-- ContaGest issue #844 · auth bootstrap authority.
-- Narrow pre-tenant identity resolution only. Runtime tenant RLS cutover belongs to #845.
-- SOURCE_REUSE=NONE

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.contagest_bootstrap_login_identity(
  p_tenant_rif text,
  p_email text
)
RETURNS TABLE (
  tenant_id text,
  user_profile_id text,
  password_hash text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    t."id" AS tenant_id,
    u."id" AS user_profile_id,
    u."passwordHash" AS password_hash
  FROM public."Tenant" AS t
  JOIN public."UserProfile" AS u
    ON u."tenantId" = t."id"
  WHERE upper(btrim(t."rif")) = upper(btrim(p_tenant_rif))
    AND lower(btrim(u."email")) = lower(btrim(p_email))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.contagest_bootstrap_supabase_identity(
  p_auth_user_id text
)
RETURNS TABLE (
  tenant_id text,
  user_profile_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    u."tenantId" AS tenant_id,
    u."id" AS user_profile_id
  FROM public."UserProfile" AS u
  JOIN public."Tenant" AS t
    ON t."id" = u."tenantId"
  WHERE u."authUserId" = p_auth_user_id
    AND u."status"::text = 'active'
    AND t."status"::text = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.contagest_bootstrap_register_tenant(
  p_tenant_rif text,
  p_tenant_name text,
  p_legal_name text,
  p_plan text,
  p_email text,
  p_full_name text,
  p_password_hash text
)
RETURNS TABLE (
  tenant_id text,
  user_profile_id text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_rif text := upper(btrim(p_tenant_rif));
  v_email text := lower(btrim(p_email));
  v_tenant_id text;
  v_user_id text;
  v_account_user_id text;
  v_role_id text;
  v_permission_id text;
  v_permission_key text;
  v_permission_keys constant text[] := ARRAY[
    'admin.manage',
    'clients.manage',
    'inventory.manage',
    'sales.manage',
    'sales.view',
    'purchases.manage',
    'reports.view',
    'modules.manage',
    'payroll.manage',
    'banking.manage',
    'taxes.export',
    'health.manage',
    'gym.manage',
    'communications.manage'
  ];
BEGIN
  IF v_rif = ''
     OR v_email = ''
     OR btrim(COALESCE(p_tenant_name, '')) = ''
     OR btrim(COALESCE(p_full_name, '')) = ''
     OR btrim(COALESCE(p_password_hash, '')) = '' THEN
    RAISE EXCEPTION 'CONTAGEST_BOOTSTRAP_REGISTRATION_INVALID'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize only registrations competing for the same normalized RIF. The
  -- transaction-scoped advisory lock is released automatically on success/error.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('contagest:bootstrap-register:' || v_rif, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public."Tenant" AS t
    WHERE upper(btrim(t."rif")) = v_rif
  ) THEN
    RAISE EXCEPTION 'CONTAGEST_BOOTSTRAP_REGISTRATION_CONFLICT'
      USING ERRCODE = '23505';
  END IF;

  v_tenant_id := pg_catalog.gen_random_uuid()::text;
  v_user_id := pg_catalog.gen_random_uuid()::text;
  v_account_user_id := pg_catalog.gen_random_uuid()::text;
  v_role_id := pg_catalog.gen_random_uuid()::text;

  INSERT INTO public."Tenant" (
    "id", "rif", "name", "legalName", "plan", "status", "settings", "createdAt", "updatedAt"
  ) VALUES (
    v_tenant_id,
    v_rif,
    btrim(p_tenant_name),
    COALESCE(NULLIF(btrim(p_legal_name), ''), btrim(p_tenant_name)),
    COALESCE(NULLIF(btrim(p_plan), ''), 'enterprise'),
    'active',
    '{}'::pg_catalog.jsonb,
    pg_catalog.now(),
    pg_catalog.now()
  );

  INSERT INTO public."UserProfile" (
    "id", "tenantId", "email", "fullName", "passwordHash", "status", "createdAt", "updatedAt"
  ) VALUES (
    v_user_id,
    v_tenant_id,
    v_email,
    btrim(p_full_name),
    p_password_hash,
    'active',
    pg_catalog.now(),
    pg_catalog.now()
  );

  FOREACH v_permission_key IN ARRAY v_permission_keys LOOP
    INSERT INTO public."Permission" ("id", "key", "description")
    VALUES (
      pg_catalog.gen_random_uuid()::text,
      v_permission_key,
      'Permiso ' || v_permission_key
    )
    ON CONFLICT ("key") DO NOTHING;
  END LOOP;

  INSERT INTO public."Role" (
    "id", "tenantId", "name", "description", "system", "createdAt", "updatedAt"
  ) VALUES (
    v_role_id,
    v_tenant_id,
    'Administrador',
    'Rol administrador de ContaGest.',
    true,
    pg_catalog.now(),
    pg_catalog.now()
  );

  FOR v_permission_id IN
    SELECT p."id"
    FROM public."Permission" AS p
    WHERE p."key" = ANY(v_permission_keys)
  LOOP
    INSERT INTO public."RolePermission" ("roleId", "permissionId")
    VALUES (v_role_id, v_permission_id)
    ON CONFLICT ("roleId", "permissionId") DO NOTHING;
  END LOOP;

  INSERT INTO public."UserRole" ("userId", "roleId")
  VALUES (v_user_id, v_role_id);

  INSERT INTO public."AccountUser" (
    "id", "email", "fullName", "status", "createdAt", "updatedAt"
  ) VALUES (
    v_account_user_id,
    v_email,
    btrim(p_full_name),
    'active',
    pg_catalog.now(),
    pg_catalog.now()
  );

  INSERT INTO public."TenantMembership" (
    "id", "accountUserId", "tenantId", "userProfileId", "roleLabel", "status", "isDefault", "createdAt", "updatedAt"
  ) VALUES (
    pg_catalog.gen_random_uuid()::text,
    v_account_user_id,
    v_tenant_id,
    v_user_id,
    'Administrador',
    'active',
    false,
    pg_catalog.now(),
    pg_catalog.now()
  );

  tenant_id := v_tenant_id;
  user_profile_id := v_user_id;
  RETURN NEXT;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'CONTAGEST_BOOTSTRAP_REGISTRATION_CONFLICT'
      USING ERRCODE = '23505';
END;
$$;

ALTER FUNCTION private.contagest_bootstrap_login_identity(text, text) OWNER TO postgres;
ALTER FUNCTION private.contagest_bootstrap_supabase_identity(text) OWNER TO postgres;
ALTER FUNCTION private.contagest_bootstrap_register_tenant(text, text, text, text, text, text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION private.contagest_bootstrap_login_identity(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.contagest_bootstrap_supabase_identity(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.contagest_bootstrap_register_tenant(text, text, text, text, text, text, text) FROM PUBLIC;

-- Runtime provisioning is owned by the #739/#845 rollout. If the role already
-- exists, grant only the minimum callable surface. If it does not, remain
-- fail-closed instead of creating a credential-bearing database role here.
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION private.contagest_bootstrap_login_identity(text, text) FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION private.contagest_bootstrap_supabase_identity(text) FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION private.contagest_bootstrap_register_tenant(text, text, text, text, text, text, text) FROM %I',
        role_name
      );
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'contagest_runtime') THEN
    GRANT USAGE ON SCHEMA private TO contagest_runtime;
    GRANT EXECUTE ON FUNCTION private.contagest_bootstrap_login_identity(text, text) TO contagest_runtime;
    GRANT EXECUTE ON FUNCTION private.contagest_bootstrap_supabase_identity(text) TO contagest_runtime;
    GRANT EXECUTE ON FUNCTION private.contagest_bootstrap_register_tenant(text, text, text, text, text, text, text) TO contagest_runtime;
  END IF;
END
$$;