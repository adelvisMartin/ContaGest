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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='contagest_runtime') THEN CREATE ROLE contagest_runtime; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='contagest_backup') THEN CREATE ROLE contagest_backup; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='contagest_monitor') THEN CREATE ROLE contagest_monitor; END IF;
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
ALTER ROLE contagest_monitor SET search_path='public,private,pg_catalog';

SELECT current_database() AS target_database \gset
GRANT CONNECT ON DATABASE :"target_database" TO contagest_runtime, contagest_backup, contagest_monitor;
GRANT USAGE ON SCHEMA public TO contagest_runtime, contagest_backup, contagest_monitor;
REVOKE CREATE ON SCHEMA public FROM contagest_runtime, contagest_backup, contagest_monitor;

-- Scope contractual: las tablas gestionadas por Prisma/ContaGest usan nombres PascalCase.
-- El proyecto Supabase contiene además tablas lower_snake_case de productos auxiliares;
-- esos objetos NO se conceden a los roles del backend ContaGest.
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
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO contagest_runtime', rec.relname);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM contagest_runtime', rec.relname);

    EXECUTE format('GRANT SELECT ON TABLE public.%I TO contagest_backup', rec.relname);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM contagest_backup', rec.relname);

    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM contagest_monitor', rec.relname);

    IF rec.relrowsecurity THEN
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

-- Monitor: estadísticas + AuditLog. Su única escritura permitida es el snapshot interno
-- usado para calcular deltas entre ejecuciones y evitar alertas repetidas.
GRANT pg_read_all_stats TO contagest_monitor;
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

\echo 'Roles de seguridad ContaGest provisionados. Ejecuta verify-security-roles.sql antes de rotar Vercel.'
\echo 'Tras cada migración que añada tablas Prisma, vuelve a ejecutar este script con passwords rotados/seguros.'
