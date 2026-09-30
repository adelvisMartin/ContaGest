\set ON_ERROR_STOP on
\pset pager off

SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
FROM pg_roles
WHERE rolname IN ('contagest_runtime','contagest_backup','contagest_monitor')
ORDER BY rolname;

DO $$
DECLARE
  helper_oid oid := to_regprocedure('private.contagest_runtime_tenant_id()');
  helper_path text;
BEGIN
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('contagest_runtime','contagest_backup','contagest_monitor')) <> 3 THEN
    RAISE EXCEPTION 'Falta uno o más roles de seguridad ContaGest.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN ('contagest_runtime','contagest_backup','contagest_monitor')
      AND (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'Uno o más roles ContaGest violan el contrato de mínimo privilegio.';
  END IF;

  IF has_schema_privilege('contagest_runtime','public','CREATE') THEN
    RAISE EXCEPTION 'contagest_runtime no debe tener CREATE sobre public.';
  END IF;
  IF has_table_privilege('contagest_runtime','public."AuditLog"','TRUNCATE') THEN
    RAISE EXCEPTION 'contagest_runtime no debe tener TRUNCATE.';
  END IF;
  IF has_table_privilege('contagest_backup','public."AuditLog"','UPDATE')
     OR has_table_privilege('contagest_backup','public."AuditLog"','DELETE')
     OR has_table_privilege('contagest_backup','public."AuditLog"','INSERT') THEN
    RAISE EXCEPTION 'contagest_backup debe ser read-only.';
  END IF;
  IF pg_has_role('contagest_runtime','service_role','member')
     OR pg_has_role('contagest_backup','service_role','member')
     OR pg_has_role('contagest_monitor','service_role','member') THEN
    RAISE EXCEPTION 'Ningún rol ContaGest puede heredar service_role.';
  END IF;

  IF helper_oid IS NULL THEN
    RAISE EXCEPTION 'Falta private.contagest_runtime_tenant_id().' ;
  END IF;
  SELECT replace(setting,'search_path=','') INTO helper_path
  FROM unnest(COALESCE((SELECT proconfig FROM pg_proc WHERE oid=helper_oid),ARRAY[]::text[])) AS setting
  WHERE setting LIKE 'search_path=%' LIMIT 1;
  IF helper_path IS DISTINCT FROM 'pg_catalog' THEN
    RAISE EXCEPTION 'contagest_runtime_tenant_id debe fijar search_path=pg_catalog; actual=%', helper_path;
  END IF;
  IF has_function_privilege('PUBLIC',helper_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC no puede ejecutar contagest_runtime_tenant_id.';
  END IF;
  IF NOT has_function_privilege('contagest_runtime',helper_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'contagest_runtime necesita EXECUTE sobre contagest_runtime_tenant_id.';
  END IF;

  -- No context / invalid UUID / stale UUID must all deny by resolving NULL.
  PERFORM set_config('contagest.tenant_id','',true);
  IF private.contagest_runtime_tenant_id() IS NOT NULL THEN
    RAISE EXCEPTION 'Tenant context ausente debe resolver NULL.';
  END IF;
  PERFORM set_config('contagest.tenant_id','not-a-uuid',true);
  IF private.contagest_runtime_tenant_id() IS NOT NULL THEN
    RAISE EXCEPTION 'Tenant context inválido debe resolver NULL.';
  END IF;
  PERFORM set_config('contagest.tenant_id','00000000-0000-4000-8000-000000000001',true);
  IF EXISTS (SELECT 1 FROM public."Tenant" WHERE "id"='00000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'El UUID reservado para prueba stale existe; usa otro valor.';
  END IF;
  IF private.contagest_runtime_tenant_id() IS NOT NULL THEN
    RAISE EXCEPTION 'Tenant context stale debe resolver NULL.';
  END IF;
  PERFORM set_config('contagest.tenant_id','',true);

  -- Legacy runtime all-tenant policy is forbidden everywhere.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND policyname='contagest_runtime_backend_all'
  ) THEN
    RAISE EXCEPTION 'RUNTIME_ALL_TENANT_POLICY: contagest_runtime_backend_all todavía existe.';
  END IF;

  -- No table carrying tenantId may have an unconditional runtime USING/WITH CHECK.
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
    RAISE EXCEPTION 'RUNTIME_ALL_TENANT_POLICY: tabla tenant-owned conserva acceso runtime incondicional.';
  END IF;

  -- Every direct tenant table must have RLS + the canonical runtime policy.
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
        NOT c.relrowsecurity
        OR NOT EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname='public' AND p.tablename=c.relname
            AND p.policyname='contagest_runtime_tenant_scope'
            AND p.roles @> ARRAY['contagest_runtime']::name[]
        )
      )
  ) THEN
    RAISE EXCEPTION 'Falta RLS/policy tenant-aware en una tabla directa tenant-owned.';
  END IF;

  -- Every child that points to a direct tenant table must inherit scope by parent.
  IF EXISTS (
    SELECT 1
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
      )
  ) THEN
    RAISE EXCEPTION 'Falta contagest_runtime_parent_scope en una tabla hija tenant-owned.';
  END IF;

  IF to_regclass('private.contagest_security_metric_snapshot') IS NULL THEN
    RAISE EXCEPTION 'Falta el snapshot privado del monitor.';
  END IF;
  IF NOT has_table_privilege('contagest_monitor','private.contagest_security_metric_snapshot','SELECT,INSERT,UPDATE') THEN
    RAISE EXCEPTION 'contagest_monitor no puede mantener su snapshot privado.';
  END IF;
  IF has_table_privilege('contagest_monitor','private.contagest_security_metric_snapshot','DELETE') THEN
    RAISE EXCEPTION 'contagest_monitor no debe poder borrar el snapshot.';
  END IF;

  -- El rol runtime no debe alcanzar tablas lower_snake_case compartidas con otros productos.
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname ~ '^[a-z]'
      AND has_table_privilege('contagest_runtime', format('%I.%I', n.nspname, c.relname), 'SELECT')
  ) THEN
    RAISE EXCEPTION 'contagest_runtime tiene acceso a una tabla lower_snake_case fuera de su scope.';
  END IF;
END $$;

SELECT
  has_schema_privilege('contagest_runtime','public','USAGE') AS runtime_schema_usage,
  has_schema_privilege('contagest_runtime','public','CREATE') AS runtime_schema_create,
  has_table_privilege('contagest_runtime','public."AuditLog"','SELECT') AS runtime_select,
  has_table_privilege('contagest_runtime','public."AuditLog"','TRUNCATE') AS runtime_truncate,
  has_table_privilege('contagest_backup','public."AuditLog"','SELECT') AS backup_select,
  has_table_privilege('contagest_backup','public."AuditLog"','DELETE') AS backup_delete,
  has_table_privilege('contagest_monitor','private.contagest_security_metric_snapshot','UPDATE') AS monitor_snapshot_update,
  has_table_privilege('contagest_monitor','private.contagest_security_metric_snapshot','DELETE') AS monitor_snapshot_delete;

SELECT p.tablename, p.policyname, p.cmd, p.roles, p.qual, p.with_check
FROM pg_policies p
WHERE p.schemaname='public' AND p.roles @> ARRAY['contagest_runtime']::name[]
ORDER BY p.tablename,p.policyname;

\echo 'Verificación de roles/RLS ContaGest #845: PASS si no hubo excepción.'
