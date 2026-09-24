\set ON_ERROR_STOP on

DO $guard$
DECLARE
  db_name text := current_database();
BEGIN
  IF db_name !~ '(_e2e|_drill|_restore)$' THEN
    RAISE EXCEPTION 'Refusing Supabase compatibility stubs in non-ephemeral database: %', db_name;
  END IF;
END
$guard$;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator NOLOGIN; END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  encrypted_password text,
  raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Minimal stubs used only so versioned migrations can be replayed on vanilla PostgreSQL.
-- They deliberately return an unauthenticated context and are NOT Supabase Auth replacements.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $fn$ SELECT NULL::uuid $fn$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $fn$ SELECT '{}'::jsonb $fn$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $fn$ SELECT NULL::text $fn$;

REVOKE ALL ON SCHEMA auth FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, authenticator;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role, authenticator;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role, authenticator;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role, authenticator;

-- Historical Hípico trigger prerequisite referenced by Prisma role migrations.
-- Production owns its real Supabase history; this compatibility function exists only
-- inside the disposable bootstrap and preserves the expected updated_at semantics.
CREATE OR REPLACE FUNCTION public.hipico_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

-- Minimal Supabase Storage compatibility surface required only for migration replay.
-- It is deliberately not a replacement for Supabase Storage.
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS storage_objects_bucket_name_idx
  ON storage.objects(bucket_id, name);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN btrim(name, '/') = '' THEN ARRAY[]::text[]
    ELSE string_to_array(btrim(name, '/'), '/')
  END
$fn$;

REVOKE ALL ON SCHEMA storage FROM PUBLIC;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role, authenticator;
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role, authenticator;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO anon, authenticated, service_role, authenticator;

\echo 'Supabase compatibility stubs prepared for ephemeral database only.'

-- ContaGest's earliest Prisma migrations are deltas over this historical SQL-first baseline.
\ir ../../supabase/sql/contagest_full_bootstrap_v8_5.sql

\echo 'Historical ContaGest v8.5 baseline prepared for ephemeral database only.'

-- Control Hípico historically had a SQL-first baseline before later Prisma deltas.
-- Reuse the canonical, documented chain rather than copying individual table shapes.
\ir ../../supabase/sql/hipico_v12_operations.sql
\ir ../../supabase/sql/hipico_v12_shadow_validation.sql
\ir ../../supabase/sql/hipico_v13_workspace_sync_security.sql

\echo 'Historical Control Hípico v1.13 baseline prepared for ephemeral database only.'
