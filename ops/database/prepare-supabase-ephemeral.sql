\set ON_ERROR_STOP on

DO $$
DECLARE
  db_name text := current_database();
BEGIN
  IF db_name !~ '(_e2e|_drill|_restore)$' THEN
    RAISE EXCEPTION 'Refusing Supabase compatibility stubs in non-ephemeral database: %', db_name;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

-- Minimal stubs used only so versioned migrations can be replayed on vanilla PostgreSQL.
-- They deliberately return an unauthenticated context and are NOT Supabase Auth replacements.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULL::uuid $$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$ SELECT '{}'::jsonb $$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$ SELECT NULL::text $$;

REVOKE ALL ON SCHEMA auth FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, authenticator;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role, authenticator;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role, authenticator;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role, authenticator;

\echo 'Supabase compatibility stubs prepared for ephemeral database only.'

-- The Prisma history starts from the deployed v8.5 schema baseline; it is a delta
-- history, not a zero-to-current schema. Ephemeral CI databases must recreate that
-- exact baseline before replaying versioned migrations. This include is reachable
-- only after the database-name fail-closed guard above succeeds.
\ir ../../supabase/sql/contagest_full_bootstrap_v8_5.sql

\echo 'ContaGest v8.5 schema baseline prepared; versioned migrations may now replay.'
