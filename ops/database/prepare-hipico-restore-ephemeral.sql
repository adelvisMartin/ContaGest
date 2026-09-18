\set ON_ERROR_STOP on

\ir prepare-supabase-ephemeral.sql

DO $$
DECLARE
  db_name text := current_database();
BEGIN
  IF db_name !~ '(_drill|_restore)$' THEN
    RAISE EXCEPTION 'Refusing Hípico restore prep in non-ephemeral database: %', db_name;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE auth.users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE auth.users TO service_role;

COMMENT ON TABLE auth.users IS
  'Ephemeral restore-drill identity stub. UUID and synthetic email only; never production credential material.';

\echo 'Hípico restore identity stubs prepared for disposable database only.'
