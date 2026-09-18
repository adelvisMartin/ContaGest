\set ON_ERROR_STOP on

-- Manual-only baseline for Control Hípico backup credentials.
-- Execute with a direct DDL/owner connection. Password comes from environment only.
\getenv backup_password HIPICO_BACKUP_PASSWORD
\if :{?backup_password}
\else
  \echo 'HIPICO_BACKUP_PASSWORD is required'
  \quit
\endif

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hipico_backup') THEN
    CREATE ROLE hipico_backup;
  END IF;
END $$;

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

-- Reset public object privileges before the inventory-driven shell grants SELECT.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM hipico_backup;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM hipico_backup;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM hipico_backup;

-- The backup role never needs Supabase Auth objects. UUIDs are derived from Hípico tables.
REVOKE ALL ON SCHEMA auth FROM hipico_backup;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth FROM hipico_backup;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth FROM hipico_backup;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA auth FROM hipico_backup;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    REVOKE service_role FROM hipico_backup;
  END IF;
END $$;
