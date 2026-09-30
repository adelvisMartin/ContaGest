\set ON_ERROR_STOP on
\pset pager off

-- #720 Production Security Convergence verifier.
-- Read-only catalog gate. It does not inspect business rows or emit credentials/PII.
-- Run only against the intended production project after fixing the exact repository SHA.

DO $$
DECLARE
  stale_count integer;
  missing_runtime_children integer;
BEGIN
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('contagest_runtime','contagest_backup','contagest_monitor')) <> 3 THEN
    RAISE EXCEPTION 'V720_SECURITY_ROLES_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN ('contagest_runtime','contagest_backup','contagest_monitor')
      AND (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'V720_ROLE_LEAST_PRIVILEGE_VIOLATION';
  END IF;

  IF has_schema_privilege('contagest_runtime','public','CREATE')
     OR has_schema_privilege('contagest_runtime','private','CREATE') THEN
    RAISE EXCEPTION 'V720_RUNTIME_SCHEMA_CREATE';
  END IF;

  IF pg_has_role('contagest_runtime','service_role','member') THEN
    RAISE EXCEPTION 'V720_RUNTIME_SERVICE_ROLE_MEMBERSHIP';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','private') AND pg_get_userbyid(c.relowner)='contagest_runtime'
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','private') AND pg_get_userbyid(p.proowner)='contagest_runtime'
  ) THEN
    RAISE EXCEPTION 'V720_RUNTIME_OBJECT_OWNERSHIP';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname='contagest_runtime_backend_all'
  ) THEN
    RAISE EXCEPTION 'V720_LEGACY_RUNTIME_ALL_TENANT_POLICY';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies p
    JOIN pg_class c ON c.relname=p.tablename
    JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname=p.schemaname
    WHERE p.schemaname='public'
      AND p.roles @> ARRAY['contagest_runtime']::name[]
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid=c.oid AND a.attname='tenantId' AND a.attnum>0 AND NOT a.attisdropped
      )
      AND (
        lower(regexp_replace(COALESCE(p.qual,''),'[()[:space:]]','','g'))='true'
        OR lower(regexp_replace(COALESCE(p.with_check,''),'[()[:space:]]','','g'))='true'
      )
  ) THEN
    RAISE EXCEPTION 'V720_RUNTIME_ALL_TENANT_POLICY';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname ~ '^[A-Z]'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid=c.oid AND a.attname='tenantId' AND a.attnum>0 AND NOT a.attisdropped
      )
      AND (
        NOT c.relrowsecurity OR NOT EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname='public' AND p.tablename=c.relname
            AND p.policyname='contagest_runtime_tenant_scope'
            AND p.roles @> ARRAY['contagest_runtime']::name[]
        )
      )
  ) THEN
    RAISE EXCEPTION 'V720_TENANT_RUNTIME_POLICY_MISSING';
  END IF;

  SELECT count(*) INTO missing_runtime_children
  FROM pg_class child
  JOIN pg_namespace n ON n.oid=child.relnamespace
  WHERE n.nspname='public' AND child.relkind IN ('r','p') AND child.relname ~ '^[A-Z]'
    AND NOT EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid=child.oid AND a.attname='tenantId' AND a.attnum>0 AND NOT a.attisdropped
    )
    AND EXISTS (
      SELECT 1 FROM pg_constraint fk
      JOIN pg_class parent ON parent.oid=fk.confrelid
      WHERE fk.conrelid=child.oid AND fk.contype='f'
        AND EXISTS (
          SELECT 1 FROM pg_attribute pa
          WHERE pa.attrelid=parent.oid AND pa.attname='tenantId' AND pa.attnum>0 AND NOT pa.attisdropped
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname='public' AND p.tablename=child.relname
        AND p.policyname='contagest_runtime_parent_scope'
        AND p.roles @> ARRAY['contagest_runtime']::name[]
    );
  IF missing_runtime_children <> 0 THEN
    RAISE EXCEPTION 'V720_CHILD_RUNTIME_POLICY_MISSING:%', missing_runtime_children;
  END IF;

  WITH targets(name) AS (VALUES
    ('DataLegalHold'),('DataLifecycleEvidence'),('DataLifecycleJob'),('DataRetentionPolicyVersion'),('DataStorageObject'),
    ('FinancialFxBankAccountMap'),('FinancialFxDocumentSnapshot'),('FinancialFxEvent'),('FinancialFxLedgerLineSnapshot'),('FinancialFxPolicy'),
    ('FiscalCloseEvidence'),('FiscalDocumentRuleSnapshot'),('FiscalRuleVersion'),('FiscalSequence')
  )
  SELECT count(*) INTO stale_count
  FROM targets
  WHERE has_table_privilege('anon',format('public.%I',name),'SELECT')
     OR has_table_privilege('anon',format('public.%I',name),'INSERT')
     OR has_table_privilege('anon',format('public.%I',name),'UPDATE')
     OR has_table_privilege('anon',format('public.%I',name),'DELETE')
     OR has_table_privilege('authenticated',format('public.%I',name),'SELECT')
     OR has_table_privilege('authenticated',format('public.%I',name),'INSERT')
     OR has_table_privilege('authenticated',format('public.%I',name),'UPDATE')
     OR has_table_privilege('authenticated',format('public.%I',name),'DELETE');
  IF stale_count <> 0 THEN
    RAISE EXCEPTION 'V720_STALE_BROWSER_GRANTS:%', stale_count;
  END IF;

  IF to_regprocedure('private.contagest_runtime_tenant_id()') IS NULL
     OR NOT has_function_privilege('contagest_runtime',to_regprocedure('private.contagest_runtime_tenant_id()'),'EXECUTE') THEN
    RAISE EXCEPTION 'V720_RUNTIME_HELPER_MISSING_OR_DENIED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','private')
      AND (p.proname IN ('current_tenant_id','current_profile_id','enforce_subscription_tenant_limit','enforce_license_subscription_tenant','enforce_subscription_user_limit','sync_license_permissions') OR p.proname LIKE 'contagest_%')
      AND p.prosecdef
      AND (p.proconfig IS NULL OR NOT (p.proconfig @> ARRAY['search_path=pg_catalog']::text[]))
  ) THEN
    RAISE EXCEPTION 'V720_UNSAFE_SECURITY_DEFINER_SEARCH_PATH';
  END IF;
END $$;

SELECT
  'V720_PRODUCTION_DB_SECURITY_CONVERGED' AS verdict,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname ~ '^[A-Z]') AS application_tables_checked,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname ~ '^[A-Z]' AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenantId' AND a.attnum>0 AND NOT a.attisdropped)) AS direct_tenant_tables_checked;
