\set ON_ERROR_STOP on
\pset pager off

SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
FROM pg_roles
WHERE rolname IN ('contagest_runtime','contagest_backup','contagest_monitor')
ORDER BY rolname;

DO $$
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

SELECT c.relname AS table_name,
       has_table_privilege('contagest_runtime', format('%I.%I', n.nspname, c.relname), 'SELECT') AS runtime_select
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p')
ORDER BY c.relname;

\echo 'Verificación de roles ContaGest: PASS si no hubo excepción.'
