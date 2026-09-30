\set ON_ERROR_STOP on

-- Ejecutar SOLO con credencial DDL/owner por conexión directa.
-- Los passwords deben llegar desde un secret manager/entorno, nunca desde el repositorio.
\getenv runtime_password CONTAGEST_RUNTIME_PASSWORD
\getenv backup_password CONTAGEST_BACKUP_PASSWORD
\getenv monitor_password CONTAGEST_MONITOR_PASSWORD

\if :{?runtime_password}
\else
  \echo 'Falta CONTAGEST_RUNTIME_PASSWORD'
  \quit
\endif
\if :{?backup_password}
\else
  \echo 'Falta CONTAGEST_BACKUP_PASSWORD'
  \quit
\endif
\if :{?monitor_password}
\else
  \echo 'Falta CONTAGEST_MONITOR_PASSWORD'
  \quit
\endif

-- Managed PostgreSQL (including Supabase) may grant CREATEROLE without real
-- SUPERUSER. New roles therefore start with PostgreSQL's least-privilege defaults;
-- we verify those attributes instead of issuing ALTER ROLE ... NOSUPERUSER, which
-- managed owners are not allowed to execute even when the role is already non-super.
DO $$
DECLARE
  role_name text;
  attrs record;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['contagest_runtime','contagest_backup','contagest_monitor'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('CREATE ROLE %I',role_name);
    END IF;

    SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
      INTO attrs
    FROM pg_roles WHERE rolname=role_name;

    IF attrs.rolsuper OR attrs.rolcreatedb OR attrs.rolcreaterole OR attrs.rolreplication OR attrs.rolbypassrls THEN
      RAISE EXCEPTION 'CONTAGEST_ROLE_LEAST_PRIVILEGE_FAILED:%',role_name;
    END IF;
  END LOOP;
END $$;

ALTER ROLE contagest_runtime WITH LOGIN PASSWORD :'runtime_password' INHERIT;
ALTER ROLE contagest_backup WITH LOGIN PASSWORD :'backup_password' INHERIT;
ALTER ROLE contagest_monitor WITH LOGIN PASSWORD :'monitor_password' INHERIT;

ALTER ROLE contagest_runtime SET statement_timeout='30s';
ALTER ROLE contagest_runtime SET lock_timeout='5s';
ALTER ROLE contagest_runtime SET idle_in_transaction_session_timeout='15s';
ALTER ROLE contagest_runtime SET search_path='pg_catalog,public';
ALTER ROLE contagest_backup SET statement_timeout='15min';
ALTER ROLE contagest_backup SET search_path='pg_catalog,public';
ALTER ROLE contagest_monitor SET statement_timeout='15s';
ALTER ROLE contagest_monitor SET search_path='pg_catalog,private,public';

SELECT current_database() AS target_database \gset
GRANT CONNECT ON DATABASE :"target_database" TO contagest_runtime, contagest_backup, contagest_monitor;
GRANT USAGE ON SCHEMA public TO contagest_runtime, contagest_backup, contagest_monitor;
REVOKE CREATE ON SCHEMA public FROM contagest_runtime, contagest_backup, contagest_monitor;

-- #845 is the single forward-only runtime RLS authority. It removes the former
-- contagest_runtime_backend_all policy and installs fail-closed tenant/shared rules.
\ir runtime-rls-policy-v845.sql

-- #720 preserves the same signed/server-derived tenant authority while supporting
-- bounded legacy TEXT tenant ids already present in production. It must run after
-- #845 because it intentionally narrows only the tenant-id resolver implementation.
\ir runtime-tenant-id-compat-v720.sql

-- Fresh databases may apply migrations before security roles exist. Restore the
-- narrow session/MFA bootstrap grants after the runtime role is provisioned.
DO $$
BEGIN
  IF to_regprocedure('private.contagest_runtime_refresh_session_identity(text)') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA private TO contagest_runtime;
    GRANT EXECUTE ON FUNCTION private.contagest_runtime_refresh_session_identity(text) TO contagest_runtime;
  END IF;
  IF to_regprocedure('private.contagest_bootstrap_coordinate_challenge_identity(text)') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA private TO contagest_runtime;
    GRANT EXECUTE ON FUNCTION private.contagest_bootstrap_coordinate_challenge_identity(text) TO contagest_runtime;
  END IF;
END $$;

-- Scope contractual: PascalCase public tables are ContaGest application objects.
-- Runtime receives DML only when RLS is enabled. Unknown non-RLS application
-- tables therefore fail closed instead of silently gaining unrestricted DML.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT c.relname, c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relkind IN ('r','p')
      AND c.relname ~ '^[A-Z]'
    ORDER BY c.relname
  LOOP
    IF rec.relrowsecurity THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO contagest_runtime', rec.relname);
      EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM contagest_runtime', rec.relname);
    ELSE
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM contagest_runtime', rec.relname);
    END IF;

    EXECUTE format('GRANT SELECT ON TABLE public.%I TO contagest_backup', rec.relname);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM contagest_backup', rec.relname);

    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM contagest_monitor', rec.relname);

    IF rec.relrowsecurity THEN
      EXECUTE format('DROP POLICY IF EXISTS contagest_backup_read_all ON public.%I', rec.relname);
      EXECUTE format(
        'CREATE POLICY contagest_backup_read_all ON public.%I FOR SELECT TO contagest_backup USING (true)',
        rec.relname
      );
    END IF;
  END LOOP;
END $$;

-- Secuencias Prisma: runtime las usa para compatibilidad; backup solo puede leerlas.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='S'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO contagest_runtime', rec.relname);
    EXECUTE format('GRANT SELECT ON SEQUENCE public.%I TO contagest_backup', rec.relname);
  END LOOP;
END $$;

-- Monitor: estadísticas cuando el owner administrado puede delegarlas, más AuditLog.
-- Supabase managed postgres no siempre posee ADMIN OPTION sobre pg_read_all_stats;
-- esa limitación no debe abortar el aprovisionamiento de runtime/backup/monitor.
DO $$
DECLARE can_grant_stats boolean;
BEGIN
  SELECT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname=current_user),false)
    OR EXISTS (
      SELECT 1
      FROM pg_auth_members m
      JOIN pg_roles parent ON parent.oid=m.roleid
      JOIN pg_roles member ON member.oid=m.member
      WHERE parent.rolname='pg_read_all_stats'
        AND member.rolname=current_user
        AND m.admin_option
    )
  INTO can_grant_stats;

  IF can_grant_stats THEN
    GRANT pg_read_all_stats TO contagest_monitor;
  ELSE
    RAISE NOTICE 'pg_read_all_stats not grantable by managed owner; continuing with explicit monitoring grants';
  END IF;
END $$;

GRANT SELECT ON TABLE public."AuditLog" TO contagest_monitor;
DROP POLICY IF EXISTS contagest_monitor_audit_read ON public."AuditLog";
CREATE POLICY contagest_monitor_audit_read ON public."AuditLog"
  FOR SELECT TO contagest_monitor USING (true);

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO contagest_monitor;
CREATE TABLE IF NOT EXISTS private.contagest_security_metric_snapshot (
  table_name text PRIMARY KEY,
  updated_rows bigint NOT NULL DEFAULT 0 CHECK (updated_rows >= 0),
  deleted_rows bigint NOT NULL DEFAULT 0 CHECK (deleted_rows >= 0),
  captured_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.contagest_security_metric_snapshot FROM PUBLIC, anon, authenticated, service_role, contagest_runtime, contagest_backup;
GRANT SELECT, INSERT, UPDATE ON TABLE private.contagest_security_metric_snapshot TO contagest_monitor;

-- Nunca otorgar herencia de roles que eludan RLS ni privilegios de plataforma Supabase.
REVOKE service_role FROM contagest_runtime, contagest_backup, contagest_monitor;

\echo 'Roles + RLS runtime tenant-aware #845/#720 provisionados. Ejecuta verify-security-roles.sql antes de rotar el runtime.'
\echo 'Tras cada migración que añada tablas Prisma, vuelve a ejecutar este script con passwords rotados/seguros.'
