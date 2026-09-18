\set ON_ERROR_STOP on

-- Manual-only activation for the dedicated Control Hipico backup role.
-- Run from repository root with an owner/DDL connection.
-- Secrets come from the operator environment and are never stored here.
\getenv backup_password HIPICO_BACKUP_PASSWORD
\getenv backup_mode HIPICO_BACKUP_ROLE_MODE

\if :{?backup_password}
\else
  \echo 'HIPICO_BACKUP_PASSWORD is required'
  \quit 4
\endif

\if :{?backup_mode}
\else
  \set backup_mode PRE_ROLLOUT
\endif

SELECT :'backup_mode' IN ('PRE_ROLLOUT','STEADY_STATE') AS backup_mode_valid \gset
\if :backup_mode_valid
\else
  \echo 'HIPICO_BACKUP_ROLE_MODE must be PRE_ROLLOUT or STEADY_STATE'
  \quit 4
\endif

CREATE TEMP TABLE hipico_backup_scope (
  table_name text PRIMARY KEY
);

\copy hipico_backup_scope(table_name) FROM 'ops/backup/hipico-public-tables.txt'

DELETE FROM hipico_backup_scope
WHERE btrim(table_name)='' OR left(btrim(table_name),1)='#';

UPDATE hipico_backup_scope SET table_name=btrim(table_name);

SELECT count(*)=25 AS inventory_count_valid FROM hipico_backup_scope \gset
\if :inventory_count_valid
\else
  \echo 'Expected exactly 25 canonical Hipico backup tables'
  \quit 4
\endif

SELECT coalesce(bool_and(table_name ~ '^hipico_[a-z0-9_]+$'),false) AS inventory_names_valid
FROM hipico_backup_scope
\gset
\if :inventory_names_valid
\else
  \echo 'Unsafe table name in Hipico backup inventory'
  \quit 4
\endif

SELECT
  :'backup_mode'='PRE_ROLLOUT'
  OR NOT EXISTS (
    SELECT 1
    FROM hipico_backup_scope s
    WHERE to_regclass(format('public.%I',s.table_name)) IS NULL
  ) AS target_scope_valid
\gset
\if :target_scope_valid
\else
  \echo 'STEADY_STATE requires all 25 canonical Hipico tables'
  SELECT s.table_name AS missing_table
  FROM hipico_backup_scope s
  WHERE to_regclass(format('public.%I',s.table_name)) IS NULL
  ORDER BY s.table_name;
  \quit 5
\endif

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hipico_backup') THEN
    CREATE ROLE hipico_backup;
  END IF;
END
$$;

ALTER ROLE hipico_backup WITH LOGIN PASSWORD :'backup_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

ALTER ROLE hipico_backup SET statement_timeout='15min';
ALTER ROLE hipico_backup SET lock_timeout='10s';
ALTER ROLE hipico_backup SET idle_in_transaction_session_timeout='60s';
ALTER ROLE hipico_backup SET search_path='public,pg_catalog';

SELECT current_database() AS target_database \gset
GRANT CONNECT ON DATABASE :"target_database" TO hipico_backup;

REVOKE ALL ON SCHEMA public FROM hipico_backup;
GRANT USAGE ON SCHEMA public TO hipico_backup;
REVOKE CREATE ON SCHEMA public FROM hipico_backup;

-- Reset any historical public privileges before re-granting only the canonical scope.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM hipico_backup;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM hipico_backup;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM hipico_backup;

-- Remove any stale backup policy before recreating it only on in-scope RLS tables.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT p.schemaname,p.tablename
    FROM pg_policies p
    WHERE p.schemaname='public'
      AND p.policyname='hipico_backup_read_all'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS hipico_backup_read_all ON %I.%I',
      rec.schemaname,
      rec.tablename
    );
  END LOOP;
END
$$;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT s.table_name,c.relrowsecurity
    FROM hipico_backup_scope s
    JOIN pg_class c
      ON c.oid=to_regclass(format('public.%I',s.table_name))
    JOIN pg_namespace n
      ON n.oid=c.relnamespace
    WHERE n.nspname='public'
    ORDER BY s.table_name
  LOOP
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO hipico_backup',rec.table_name);
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM hipico_backup',
      rec.table_name
    );

    IF rec.relrowsecurity THEN
      EXECUTE format(
        'CREATE POLICY hipico_backup_read_all ON public.%I FOR SELECT TO hipico_backup USING (true)',
        rec.table_name
      );
    END IF;
  END LOOP;
END
$$;

-- Explicitly deny the Supabase auth schema. Backup/restore uses only UUIDs
-- derivable from canonical Hipico tables and never reads auth secrets.
SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='auth') AS auth_schema_exists \gset
\if :auth_schema_exists
  REVOKE ALL ON SCHEMA auth FROM hipico_backup;
  REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth FROM hipico_backup;
  REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth FROM hipico_backup;
  REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA auth FROM hipico_backup;
\endif

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    EXECUTE 'REVOKE service_role FROM hipico_backup';
  END IF;
END
$$;

\echo 'hipico_backup manual provisioning completed.'
\echo 'Run ops/database/verify-hipico-backup-role.sql and the v24 Node verifier before enabling backup secrets.'
