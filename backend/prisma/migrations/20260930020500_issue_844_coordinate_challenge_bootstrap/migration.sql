-- ContaGest issue #844 · coordinate challenge bootstrap authority.
-- Resolves only an opaque server-issued MFA challenge into its tenant/profile identity.
-- SOURCE_REUSE=NONE

CREATE OR REPLACE FUNCTION private.contagest_bootstrap_coordinate_challenge_identity(
  p_challenge_id text
)
RETURNS TABLE (
  tenant_id text,
  user_profile_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    ch."tenantId" AS tenant_id,
    ch."userId" AS user_profile_id
  FROM public."CoordinateChallenge" AS ch
  WHERE ch."id" = p_challenge_id
  LIMIT 1;
$$;

ALTER FUNCTION private.contagest_bootstrap_coordinate_challenge_identity(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION private.contagest_bootstrap_coordinate_challenge_identity(text) FROM PUBLIC;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION private.contagest_bootstrap_coordinate_challenge_identity(text) FROM %I',
        role_name
      );
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'contagest_runtime') THEN
    GRANT USAGE ON SCHEMA private TO contagest_runtime;
    GRANT EXECUTE ON FUNCTION private.contagest_bootstrap_coordinate_challenge_identity(text) TO contagest_runtime;
  END IF;
END
$$;
