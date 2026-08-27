\set ON_ERROR_STOP on

-- Ejecutar SOLO con credencial DDL/owner por conexión directa.
-- Uso:
-- psql "$DIRECT_DATABASE_URL" \
--   --set=runtime_password='...' \
--   --set=backup_password='...' \
--   --set=monitor_password='...' \
--   --file ops/database/provision-security-roles.sql

\if :{?runtime_password}
\else
  \echo 'Falta --set=runtime_password'
  \quit
\endif
\if :{?backup_password}
\else
  \echo 'Falta --set=backup_password'
  \quit
\endif
\if :{?monitor_password}
\else
  \echo 'Falta --set=monitor_password'
  \quit
\endif

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='contagest_runtime') THEN
    CREATE ROLE contagest_runtime;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='contagest_backup') THEN
    CREATE ROLE contagest_backup;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='contagest_monitor') THEN
    CREATE ROLE contagest_monitor;
  END IF;
END $$;

ALTER ROLE contagest_runtime WITH LOGIN PASSWORD :'runtime_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT;
ALTER ROLE contagest_backup WITH LOGIN PASSWORD :'backup_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT;
ALTER ROLE contagest_monitor WITH LOGIN PASSWORD :'monitor_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT;

ALTER ROLE contagest_runtime SET statement_timeout='30s';
ALTER ROLE contagest_runtime SET lock_timeout='5s';
ALTER ROLE contagest_runtime SET idle_in_transaction_session_timeout='15s';
ALTER ROLE contagest_runtime SET search_path='public,pg_catalog';
ALTER ROLE contagest_backup SET statement_timeout='15min';
ALTER ROLE contagest_backup SET search_path='public,pg_catalog';
ALTER ROLE contagest_monitor SET statement_timeout='15s';
ALTER ROLE contagest_monitor SET search_path='public,pg_catalog';

SELECT current_database() AS target_database \gset
GRANT CONNECT ON DATABASE :"target_database" TO contagest_runtime, contagest_backup, contagest_monitor;
GRANT USAGE ON SCHEMA public TO contagest_runtime, contagest_backup, contagest_monitor;
REVOKE CREATE ON SCHEMA public FROM contagest_runtime, contagest_backup, contagest_monitor;

-- Runtime: DML sin DDL/TRUNCATE/roles. El scope se limita al esquema public de la app.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO contagest_runtime;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM contagest_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO contagest_runtime;

-- Backup: solo lectura. No DELETE/UPDATE/INSERT/TRUNCATE ni DDL.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO contagest_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO contagest_backup;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM contagest_backup;

-- Monitor: auditoría y estadísticas, sin acceso de escritura.
GRANT pg_read_all_stats TO contagest_monitor;
GRANT SELECT ON TABLE public."AuditLog" TO contagest_monitor;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM contagest_monitor;

-- El backend actual aplica tenant/RBAC en la capa de aplicación. Para que el rol dedicado
-- no necesite BYPASSRLS ni heredar service_role, se crean políticas SOLO para este rol y
-- SOLO en public. Esto mantiene fuera de alcance auth/storage y futuros esquemas.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS contagest_runtime_backend_all ON public.%I', rec.relname);
    EXECUTE format(
      'CREATE POLICY contagest_runtime_backend_all ON public.%I FOR ALL TO contagest_runtime USING (true) WITH CHECK (true)',
      rec.relname
    );
    EXECUTE format('DROP POLICY IF EXISTS contagest_backup_read_all ON public.%I', rec.relname);
    EXECUTE format(
      'CREATE POLICY contagest_backup_read_all ON public.%I FOR SELECT TO contagest_backup USING (true)',
      rec.relname
    );
  END LOOP;
END $$;

-- Monitor solo necesita AuditLog bajo RLS.
DROP POLICY IF EXISTS contagest_monitor_audit_read ON public."AuditLog";
CREATE POLICY contagest_monitor_audit_read ON public."AuditLog"
  FOR SELECT TO contagest_monitor USING (true);

-- Nunca otorgar membresía de service_role/postgres a estos roles.
REVOKE service_role FROM contagest_runtime, contagest_backup, contagest_monitor;

\echo 'Roles de seguridad ContaGest provisionados. Ejecuta verify-security-roles.sql antes de rotar Vercel.'
