-- #851 Session Surface Hardening
-- Persist only HMAC hashes of consumed app-owned refresh/CSRF credentials so a replay
-- can be mapped back to its server session family without storing any raw secret.

CREATE TABLE IF NOT EXISTS public."UserSessionRefreshReuse" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sessionId" text NOT NULL REFERENCES public."UserSession"("id") ON DELETE CASCADE,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "refreshHash" text NOT NULL,
  "csrfHash" text NOT NULL,
  "rotationCounter" integer NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "consumedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UserSessionRefreshReuse_refresh_unique" UNIQUE ("refreshHash"),
  CONSTRAINT "UserSessionRefreshReuse_rotation_unique" UNIQUE ("sessionId", "rotationCounter")
);

CREATE INDEX IF NOT EXISTS "UserSessionRefreshReuse_tenant_session_idx"
  ON public."UserSessionRefreshReuse" ("tenantId", "sessionId", "expiresAt");
CREATE INDEX IF NOT EXISTS "UserSessionRefreshReuse_expiry_idx"
  ON public."UserSessionRefreshReuse" ("expiresAt");

ALTER TABLE public."UserSessionRefreshReuse" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."UserSessionRefreshReuse" FROM PUBLIC;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','contagest_backup','contagest_monitor'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE public."UserSessionRefreshReuse" FROM %I', role_name);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."UserSessionRefreshReuse" TO service_role;
    DROP POLICY IF EXISTS "UserSessionRefreshReuse_service_role_all" ON public."UserSessionRefreshReuse";
    CREATE POLICY "UserSessionRefreshReuse_service_role_all"
      ON public."UserSessionRefreshReuse" FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='contagest_runtime') THEN
    GRANT SELECT, INSERT, DELETE ON TABLE public."UserSessionRefreshReuse" TO contagest_runtime;
    DROP POLICY IF EXISTS "UserSessionRefreshReuse_runtime_tenant" ON public."UserSessionRefreshReuse";
    CREATE POLICY "UserSessionRefreshReuse_runtime_tenant"
      ON public."UserSessionRefreshReuse" FOR ALL TO contagest_runtime
      USING ("tenantId" = nullif(current_setting('contagest.tenant_id', true), ''))
      WITH CHECK ("tenantId" = nullif(current_setting('contagest.tenant_id', true), ''));
  END IF;
END
$$;

-- Return either the current refresh credential or a still-live consumed credential.
-- Reused credentials return the historical CSRF hash that belonged to that exact
-- rotation, allowing the application to verify the double-submit pair before it
-- revokes the family (avoids a refresh-secret-only DoS primitive).
DROP FUNCTION IF EXISTS private.contagest_runtime_refresh_session_identity(text);
CREATE FUNCTION private.contagest_runtime_refresh_session_identity(p_refresh_hash text)
RETURNS TABLE (
  session_id text,
  user_id text,
  tenant_id text,
  refresh_hash text,
  csrf_hash text,
  status text,
  rotation_counter integer,
  expires_at timestamptz,
  refresh_state text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT s."id", s."userId", s."tenantId", s."refreshHash", s."csrfHash",
         s."status", s."rotationCounter", s."expiresAt", 'current'::text
  FROM public."UserSession" AS s
  JOIN public."Tenant" AS t ON t."id" = s."tenantId"
  WHERE s."refreshHash" = p_refresh_hash
    AND s."status" = 'active'
    AND t."status"::text IN ('active','trial')

  UNION ALL

  SELECT s."id", s."userId", s."tenantId", h."refreshHash", h."csrfHash",
         s."status", h."rotationCounter", h."expiresAt", 'reused'::text
  FROM public."UserSessionRefreshReuse" AS h
  JOIN public."UserSession" AS s ON s."id" = h."sessionId" AND s."tenantId" = h."tenantId"
  JOIN public."Tenant" AS t ON t."id" = s."tenantId"
  WHERE h."refreshHash" = p_refresh_hash
    AND h."expiresAt" > now()
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
