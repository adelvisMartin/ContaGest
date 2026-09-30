-- ContaGest #845 · runtime RLS policy cutover.
-- Forward-only sidecar. Historical migrations stay immutable.
-- SOURCE_REUSE=NONE

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

-- Canonical transaction-scoped tenant authority. Invalid, missing, suspended or
-- stale tenant context returns NULL so every tenant-owned policy fails closed.
CREATE OR REPLACE FUNCTION private.contagest_runtime_tenant_id()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  raw_value text := pg_catalog.btrim(pg_catalog.current_setting('contagest.tenant_id', true));
  canonical_value text;
BEGIN
  IF raw_value IS NULL OR raw_value = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    canonical_value := (raw_value::pg_catalog.uuid)::text;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM public."Tenant" AS t
    WHERE t."id" = canonical_value
      AND t."status"::text IN ('active', 'trial')
  ) THEN
    RETURN NULL;
  END IF;

  RETURN canonical_value;
END;
$$;

CREATE OR REPLACE FUNCTION private.contagest_runtime_is_platform_tenant()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."Tenant" AS t
    WHERE t."id" = private.contagest_runtime_tenant_id()
      AND t."rif" = '00000000'
      AND t."status"::text IN ('active', 'trial')
  );
$$;

CREATE OR REPLACE FUNCTION private.contagest_runtime_account_user_visible(p_account_user_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT private.contagest_runtime_is_platform_tenant()
    OR EXISTS (
      SELECT 1
      FROM public."TenantMembership" AS tm
      WHERE tm."accountUserId" = p_account_user_id
        AND tm."tenantId" = private.contagest_runtime_tenant_id()
        AND tm."status" = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION private.contagest_runtime_subscription_visible(p_subscription_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT private.contagest_runtime_is_platform_tenant()
    OR EXISTS (
      SELECT 1
      FROM public."SubscriptionTenant" AS st
      WHERE st."subscriptionId" = p_subscription_id
        AND st."tenantId" = private.contagest_runtime_tenant_id()
        AND st."status" = 'active'
    );
$$;

-- Narrow cross-tenant identity-plane read: the supplied source profile must first
-- belong to the currently bound tenant. It exposes only memberships belonging to
-- the same explicitly linked AccountUser; it is not a generic tenant enumerator.
CREATE OR REPLACE FUNCTION private.contagest_runtime_list_accessible_tenants(p_source_profile_id text)
RETURNS TABLE (
  "membershipId" text,
  "tenantId" text,
  "userProfileId" text,
  "roleLabel" text,
  "rif" text,
  "name" text,
  "legalName" text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH source_identity AS (
    SELECT tm."accountUserId"
    FROM public."UserProfile" AS up
    JOIN public."TenantMembership" AS tm
      ON tm."userProfileId" = up."id"
     AND tm."tenantId" = up."tenantId"
    JOIN public."AccountUser" AS au ON au."id" = tm."accountUserId"
    WHERE up."id" = p_source_profile_id
      AND up."tenantId" = private.contagest_runtime_tenant_id()
      AND up."status"::text = 'active'
      AND tm."status" = 'active'
      AND au."status" = 'active'
    LIMIT 1
  )
  SELECT tm."id", tm."tenantId", tm."userProfileId", tm."roleLabel",
         t."rif", t."name", t."legalName"
  FROM source_identity AS source
  JOIN public."TenantMembership" AS tm ON tm."accountUserId" = source."accountUserId"
  JOIN public."Tenant" AS t ON t."id" = tm."tenantId"
  JOIN public."UserProfile" AS up
    ON up."id" = tm."userProfileId" AND up."tenantId" = tm."tenantId"
  WHERE tm."status" = 'active'
    AND up."status"::text = 'active'
    AND t."status"::text IN ('active', 'trial')
  ORDER BY tm."isDefault" DESC, t."name" ASC;
$$;

CREATE OR REPLACE FUNCTION private.contagest_runtime_resolve_tenant_switch(
  p_source_profile_id text,
  p_target_tenant_id text
)
RETURNS TABLE (
  "membershipId" text,
  "tenantId" text,
  "userProfileId" text,
  "email" text,
  "fullName" text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH source_identity AS (
    SELECT tm."accountUserId"
    FROM public."UserProfile" AS up
    JOIN public."TenantMembership" AS tm
      ON tm."userProfileId" = up."id"
     AND tm."tenantId" = up."tenantId"
    JOIN public."AccountUser" AS au ON au."id" = tm."accountUserId"
    WHERE up."id" = p_source_profile_id
      AND up."tenantId" = private.contagest_runtime_tenant_id()
      AND up."status"::text = 'active'
      AND tm."status" = 'active'
      AND au."status" = 'active'
    LIMIT 1
  )
  SELECT tm."id", tm."tenantId", tm."userProfileId", up."email", up."fullName"
  FROM source_identity AS source
  JOIN public."TenantMembership" AS tm ON tm."accountUserId" = source."accountUserId"
  JOIN public."Tenant" AS t ON t."id" = tm."tenantId"
  JOIN public."UserProfile" AS up
    ON up."id" = tm."userProfileId" AND up."tenantId" = tm."tenantId"
  WHERE tm."tenantId" = p_target_tenant_id
    AND tm."status" = 'active'
    AND up."status"::text = 'active'
    AND t."status"::text IN ('active', 'trial')
  LIMIT 1;
$$;

ALTER FUNCTION private.contagest_runtime_tenant_id() OWNER TO postgres;
ALTER FUNCTION private.contagest_runtime_is_platform_tenant() OWNER TO postgres;
ALTER FUNCTION private.contagest_runtime_account_user_visible(text) OWNER TO postgres;
ALTER FUNCTION private.contagest_runtime_subscription_visible(text) OWNER TO postgres;
ALTER FUNCTION private.contagest_runtime_list_accessible_tenants(text) OWNER TO postgres;
ALTER FUNCTION private.contagest_runtime_resolve_tenant_switch(text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION private.contagest_runtime_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.contagest_runtime_is_platform_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.contagest_runtime_account_user_visible(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.contagest_runtime_subscription_visible(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.contagest_runtime_list_accessible_tenants(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.contagest_runtime_resolve_tenant_switch(text, text) FROM PUBLIC;

DO $$
DECLARE
  role_name text;
  signature text;
  signatures constant text[] := ARRAY[
    'private.contagest_runtime_tenant_id()',
    'private.contagest_runtime_is_platform_tenant()',
    'private.contagest_runtime_account_user_visible(text)',
    'private.contagest_runtime_subscription_visible(text)',
    'private.contagest_runtime_list_accessible_tenants(text)',
    'private.contagest_runtime_resolve_tenant_switch(text,text)'
  ];
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','contagest_backup','contagest_monitor'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      FOREACH signature IN ARRAY signatures LOOP
        EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM %I', signature, role_name);
      END LOOP;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'contagest_runtime') THEN
    RAISE EXCEPTION 'V845_RUNTIME_ROLE_REQUIRED';
  END IF;

  GRANT USAGE ON SCHEMA private TO contagest_runtime;
  GRANT EXECUTE ON FUNCTION private.contagest_runtime_tenant_id() TO contagest_runtime;
  GRANT EXECUTE ON FUNCTION private.contagest_runtime_is_platform_tenant() TO contagest_runtime;
  GRANT EXECUTE ON FUNCTION private.contagest_runtime_account_user_visible(text) TO contagest_runtime;
  GRANT EXECUTE ON FUNCTION private.contagest_runtime_subscription_visible(text) TO contagest_runtime;
  GRANT EXECUTE ON FUNCTION private.contagest_runtime_list_accessible_tenants(text) TO contagest_runtime;
  GRANT EXECUTE ON FUNCTION private.contagest_runtime_resolve_tenant_switch(text, text) TO contagest_runtime;

  -- #844 may have been migrated before contagest_runtime was provisioned.
  FOREACH signature IN ARRAY ARRAY[
    'private.contagest_bootstrap_login_identity(text,text)',
    'private.contagest_bootstrap_supabase_identity(text)',
    'private.contagest_bootstrap_register_tenant(text,text,text,text,text,text,text)'
  ] LOOP
    IF pg_catalog.to_regprocedure(signature) IS NOT NULL THEN
      EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO contagest_runtime', signature);
    END IF;
  END LOOP;
END
$$;

-- Remove the historical runtime all-tenant policy and every prior v845 policy
-- before rebuilding. This makes repeated provisioning deterministic/idempotent.
DO $$
DECLARE
  rec record;
  policy_name text;
BEGIN
  FOR rec IN
    SELECT c.relname
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relname ~ '^[A-Z]'
  LOOP
    FOREACH policy_name IN ARRAY ARRAY[
      'contagest_runtime_backend_all',
      'contagest_runtime_tenant_scope',
      'contagest_runtime_parent_scope',
      'contagest_runtime_platform_scope',
      'contagest_runtime_shared_select',
      'contagest_runtime_shared_insert',
      'contagest_runtime_shared_update',
      'contagest_runtime_shared_delete',
      'contagest_runtime_bootstrap_scope'
    ] LOOP
      EXECUTE pg_catalog.format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, rec.relname);
    END LOOP;
  END LOOP;
END
$$;

-- PLATFORM_TENANT_TABLES_V845: these tenant-owned objects are the explicit data
-- plane used by the existing platform.manage subscription/user provisioning flow.
-- Customer tenants never satisfy the platform predicate.
DO $$
DECLARE
  rec record;
  predicate text;
  platform_tenant_tables_v845 constant text[] := ARRAY[
    'UserProfile','Role','TenantMembership','LicenseKey','LicenseActivation','SubscriptionTenant'
  ];
BEGIN
  FOR rec IN
    SELECT DISTINCT c.relname
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute AS a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','p')
      AND c.relname ~ '^[A-Z]'
      AND a.attname = 'tenantId'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY c.relname
  LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rec.relname);
    predicate := '"tenantId" = private.contagest_runtime_tenant_id()';
    IF rec.relname = ANY(platform_tenant_tables_v845) THEN
      predicate := '(' || predicate || ' OR private.contagest_runtime_is_platform_tenant())';
    END IF;
    EXECUTE pg_catalog.format(
      'CREATE POLICY contagest_runtime_tenant_scope ON public.%I FOR ALL TO contagest_runtime USING (%s) WITH CHECK (%s)',
      rec.relname, predicate, predicate
    );
  END LOOP;
END
$$;

-- Tenant is the root object and therefore has id rather than tenantId. Customer
-- runtime may read/update only itself. Creation is owned by #844 bootstrap; the
-- internal platform tenant retains explicit administrative authority.
DO $$
BEGIN
  IF pg_catalog.to_regclass('public."Tenant"') IS NOT NULL THEN
    ALTER TABLE public."Tenant" ENABLE ROW LEVEL SECURITY;
    CREATE POLICY contagest_runtime_tenant_scope ON public."Tenant"
      FOR SELECT TO contagest_runtime
      USING ("id" = private.contagest_runtime_tenant_id() OR private.contagest_runtime_is_platform_tenant());
    CREATE POLICY contagest_runtime_shared_update ON public."Tenant"
      FOR UPDATE TO contagest_runtime
      USING ("id" = private.contagest_runtime_tenant_id() OR private.contagest_runtime_is_platform_tenant())
      WITH CHECK ("id" = private.contagest_runtime_tenant_id() OR private.contagest_runtime_is_platform_tenant());
    CREATE POLICY contagest_runtime_platform_scope ON public."Tenant"
      FOR INSERT TO contagest_runtime
      WITH CHECK (private.contagest_runtime_is_platform_tenant());
    CREATE POLICY contagest_runtime_shared_delete ON public."Tenant"
      FOR DELETE TO contagest_runtime
      USING (private.contagest_runtime_is_platform_tenant());
  END IF;
END
$$;

-- Child tables without tenantId inherit tenant identity from every FK parent that
-- itself has tenantId. Nullable FKs are allowed to be NULL but, when populated,
-- the referenced parent must belong to the bound tenant. Multiple tenant parents
-- are ANDed, preventing cross-tenant relation pivots.
DO $$
DECLARE
  child_rec record;
  fk_rec record;
  predicate text;
  part text;
  platform_children_v845 constant text[] := ARRAY['RolePermission','UserRole'];
BEGIN
  FOR child_rec IN
    SELECT c.oid, c.relname
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','p')
      AND c.relname ~ '^[A-Z]'
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute AS a
        WHERE a.attrelid = c.oid AND a.attname = 'tenantId' AND a.attnum > 0 AND NOT a.attisdropped
      )
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS fk
        JOIN pg_catalog.pg_class AS parent ON parent.oid = fk.confrelid
        WHERE fk.conrelid = c.oid
          AND fk.contype = 'f'
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_attribute AS pa
            WHERE pa.attrelid = parent.oid AND pa.attname = 'tenantId' AND pa.attnum > 0 AND NOT pa.attisdropped
          )
      )
    ORDER BY c.relname
  LOOP
    predicate := NULL;
    FOR fk_rec IN
      SELECT
        parent.relname AS parent_name,
        (
          SELECT pg_catalog.string_agg(
            pg_catalog.format('p.%I = %I.%I', parent_attr.attname, child_rec.relname, child_attr.attname),
            ' AND ' ORDER BY positions.i
          )
          FROM pg_catalog.generate_subscripts(fk.conkey, 1) AS positions(i)
          JOIN pg_catalog.pg_attribute AS child_attr
            ON child_attr.attrelid = fk.conrelid AND child_attr.attnum = fk.conkey[positions.i]
          JOIN pg_catalog.pg_attribute AS parent_attr
            ON parent_attr.attrelid = fk.confrelid AND parent_attr.attnum = fk.confkey[positions.i]
        ) AS join_predicate,
        (
          SELECT pg_catalog.string_agg(
            pg_catalog.format('%I.%I IS NULL', child_rec.relname, child_attr.attname),
            ' OR ' ORDER BY positions.i
          )
          FROM pg_catalog.generate_subscripts(fk.conkey, 1) AS positions(i)
          JOIN pg_catalog.pg_attribute AS child_attr
            ON child_attr.attrelid = fk.conrelid AND child_attr.attnum = fk.conkey[positions.i]
          WHERE NOT child_attr.attnotnull
        ) AS nullable_predicate
      FROM pg_catalog.pg_constraint AS fk
      JOIN pg_catalog.pg_class AS parent ON parent.oid = fk.confrelid
      WHERE fk.conrelid = child_rec.oid
        AND fk.contype = 'f'
        AND EXISTS (
          SELECT 1 FROM pg_catalog.pg_attribute AS pa
          WHERE pa.attrelid = parent.oid AND pa.attname = 'tenantId' AND pa.attnum > 0 AND NOT pa.attisdropped
        )
      ORDER BY parent.relname, fk.oid
    LOOP
      part := pg_catalog.format(
        'EXISTS (SELECT 1 FROM public.%I AS p WHERE %s AND p."tenantId" = private.contagest_runtime_tenant_id())',
        fk_rec.parent_name,
        fk_rec.join_predicate
      );
      IF fk_rec.nullable_predicate IS NOT NULL THEN
        part := '((' || fk_rec.nullable_predicate || ') OR ' || part || ')';
      END IF;
      predicate := CASE WHEN predicate IS NULL THEN part ELSE predicate || ' AND ' || part END;
    END LOOP;

    IF predicate IS NOT NULL THEN
      IF child_rec.relname = ANY(platform_children_v845) THEN
        predicate := '((' || predicate || ') OR private.contagest_runtime_is_platform_tenant())';
      END IF;
      EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', child_rec.relname);
      EXECUTE pg_catalog.format(
        'CREATE POLICY contagest_runtime_parent_scope ON public.%I FOR ALL TO contagest_runtime USING (%s) WITH CHECK (%s)',
        child_rec.relname, predicate, predicate
      );
    END IF;
  END LOOP;
END
$$;

-- SHARED_CATALOG_V845. Objects without tenantId are never granted a blanket
-- tenant bypass implicitly; every shared/global behavior is named here.
DO $$
BEGIN
  IF pg_catalog.to_regclass('public."Permission"') IS NOT NULL THEN
    ALTER TABLE public."Permission" ENABLE ROW LEVEL SECURITY;
    CREATE POLICY contagest_runtime_shared_select ON public."Permission"
      FOR SELECT TO contagest_runtime USING (private.contagest_runtime_tenant_id() IS NOT NULL);
    CREATE POLICY contagest_runtime_shared_insert ON public."Permission"
      FOR INSERT TO contagest_runtime WITH CHECK (private.contagest_runtime_tenant_id() IS NOT NULL);
    CREATE POLICY contagest_runtime_shared_update ON public."Permission"
      FOR UPDATE TO contagest_runtime
      USING (private.contagest_runtime_tenant_id() IS NOT NULL)
      WITH CHECK (private.contagest_runtime_tenant_id() IS NOT NULL);
  END IF;

  IF pg_catalog.to_regclass('public."AccountUser"') IS NOT NULL THEN
    ALTER TABLE public."AccountUser" ENABLE ROW LEVEL SECURITY;
    CREATE POLICY contagest_runtime_shared_select ON public."AccountUser"
      FOR SELECT TO contagest_runtime
      USING (private.contagest_runtime_account_user_visible("id"));
    CREATE POLICY contagest_runtime_shared_insert ON public."AccountUser"
      FOR INSERT TO contagest_runtime
      WITH CHECK (private.contagest_runtime_tenant_id() IS NOT NULL);
    CREATE POLICY contagest_runtime_shared_update ON public."AccountUser"
      FOR UPDATE TO contagest_runtime
      USING (private.contagest_runtime_account_user_visible("id"))
      WITH CHECK (private.contagest_runtime_account_user_visible("id"));
  END IF;

  -- Pre-auth throttle is deliberately global/operational: no tenant context exists
  -- yet. This explicit exception contains no tenant-owned data and is versioned here.
  IF pg_catalog.to_regclass('public."AuthLoginAttempt"') IS NOT NULL THEN
    ALTER TABLE public."AuthLoginAttempt" ENABLE ROW LEVEL SECURITY;
    CREATE POLICY contagest_runtime_bootstrap_scope ON public."AuthLoginAttempt"
      FOR SELECT TO contagest_runtime USING (true);
    CREATE POLICY contagest_runtime_shared_insert ON public."AuthLoginAttempt"
      FOR INSERT TO contagest_runtime WITH CHECK (true);
    CREATE POLICY contagest_runtime_shared_delete ON public."AuthLoginAttempt"
      FOR DELETE TO contagest_runtime USING (true);
  END IF;
END
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['CustomerAccount','SalesAgent','SubscriptionPayment','Commission'] LOOP
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE pg_catalog.format(
        'CREATE POLICY contagest_runtime_platform_scope ON public.%I FOR ALL TO contagest_runtime USING (private.contagest_runtime_is_platform_tenant()) WITH CHECK (private.contagest_runtime_is_platform_tenant())',
        table_name
      );
    END IF;
  END LOOP;

  IF pg_catalog.to_regclass('public."Subscription"') IS NOT NULL THEN
    ALTER TABLE public."Subscription" ENABLE ROW LEVEL SECURITY;
    CREATE POLICY contagest_runtime_shared_select ON public."Subscription"
      FOR SELECT TO contagest_runtime
      USING (private.contagest_runtime_subscription_visible("id"));
    CREATE POLICY contagest_runtime_platform_scope ON public."Subscription"
      FOR ALL TO contagest_runtime
      USING (private.contagest_runtime_is_platform_tenant())
      WITH CHECK (private.contagest_runtime_is_platform_tenant());
  END IF;

  IF pg_catalog.to_regclass('public."ModuleEntitlement"') IS NOT NULL THEN
    ALTER TABLE public."ModuleEntitlement" ENABLE ROW LEVEL SECURITY;
    CREATE POLICY contagest_runtime_shared_select ON public."ModuleEntitlement"
      FOR SELECT TO contagest_runtime
      USING (private.contagest_runtime_subscription_visible("subscriptionId"));
    CREATE POLICY contagest_runtime_platform_scope ON public."ModuleEntitlement"
      FOR ALL TO contagest_runtime
      USING (private.contagest_runtime_is_platform_tenant())
      WITH CHECK (private.contagest_runtime_is_platform_tenant());
  END IF;
END
$$;

-- Fail closed for any PascalCase table that has neither tenantId, a FK path to a
-- tenant-owned parent, nor an explicit shared/global classification above.
DO $$
DECLARE
  rec record;
  shared_catalog_v845 constant text[] := ARRAY[
    'Tenant','Permission','AccountUser','AuthLoginAttempt','CustomerAccount','SalesAgent',
    'Subscription','ModuleEntitlement','SubscriptionPayment','Commission'
  ];
BEGIN
  FOR rec IN
    SELECT c.oid, c.relname
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','p')
      AND c.relname ~ '^[A-Z]'
      AND c.relname <> ALL(shared_catalog_v845)
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute AS a
        WHERE a.attrelid = c.oid AND a.attname = 'tenantId' AND a.attnum > 0 AND NOT a.attisdropped
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS fk
        JOIN pg_catalog.pg_class AS parent ON parent.oid = fk.confrelid
        WHERE fk.conrelid = c.oid AND fk.contype = 'f'
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_attribute AS pa
            WHERE pa.attrelid = parent.oid AND pa.attname = 'tenantId' AND pa.attnum > 0 AND NOT pa.attisdropped
          )
      )
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM contagest_runtime', rec.relname);
  END LOOP;
END
$$;
