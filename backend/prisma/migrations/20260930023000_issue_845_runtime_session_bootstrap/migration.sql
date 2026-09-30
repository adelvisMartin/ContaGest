-- #845 companion bootstrap for refresh/logout after runtime RLS becomes fail-closed.
-- The refresh hash is a high-entropy server-issued secret; callers receive only the
-- one matching session identity needed to bind #843 tenant context.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.contagest_runtime_refresh_session_identity(p_refresh_hash text)
RETURNS TABLE (
  session_id text,
  user_id text,
  tenant_id text,
  refresh_hash text,
  csrf_hash text,
  status text,
  rotation_counter integer,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT s."id", s."userId", s."tenantId", s."refreshHash", s."csrfHash",
         s."status", s."rotationCounter", s."expiresAt"
  FROM public."UserSession" AS s
  JOIN public."Tenant" AS t ON t."id" = s."tenantId"
  WHERE s."refreshHash" = p_refresh_hash
    AND s."status" = 'active'
    AND t."status"::text IN ('active','trial')
  LIMIT 1;
$$;

ALTER FUNCTION private.contagest_runtime_refresh_session_identity(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.contagest_runtime_refresh_session_identity(text) FROM PUBLIC;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','contagest_backup','contagest_monitor'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON FUNCTION private.contagest_runtime_refresh_session_identity(text) FROM %I',
        role_name
      );
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='contagest_runtime') THEN
    GRANT USAGE ON SCHEMA private TO contagest_runtime;
    GRANT EXECUTE ON FUNCTION private.contagest_runtime_refresh_session_identity(text) TO contagest_runtime;
  END IF;
END
$$;
