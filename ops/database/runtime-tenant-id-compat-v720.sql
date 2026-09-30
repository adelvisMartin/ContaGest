-- ContaGest #720 · production runtime tenant-id compatibility.
-- Forward-only sidecar applied AFTER runtime-rls-policy-v845.sql.
--
-- Tenant.id is a TEXT primary key with modern @default(uuid()), but production can
-- legitimately contain pre-UUID tenant ids. The runtime identity remains server-derived:
-- this helper accepts only a bounded identifier shape and then requires an exact active
-- Tenant row. No request-provided value becomes authority by shape alone.

CREATE OR REPLACE FUNCTION private.contagest_runtime_tenant_id()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  raw_value text := pg_catalog.btrim(pg_catalog.current_setting('contagest.tenant_id', true));
BEGIN
  IF raw_value IS NULL OR raw_value = '' THEN
    RETURN NULL;
  END IF;

  -- UUID-looking identifiers must be canonical version/variant UUIDs. Otherwise
  -- they are rejected instead of falling through as a legacy slug.
  IF raw_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND raw_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;

  -- Covers canonical UUIDs plus the bounded legacy slug form observed in the
  -- authoritative production Tenant table. Reject whitespace, path separators,
  -- control characters and overlong identifiers before catalog access.
  IF raw_value !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public."Tenant" AS t
    WHERE t."id" = raw_value
      AND t."status"::text IN ('active', 'trial')
  ) THEN
    RETURN NULL;
  END IF;

  RETURN raw_value;
END;
$$;

ALTER FUNCTION private.contagest_runtime_tenant_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.contagest_runtime_tenant_id() FROM PUBLIC;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','contagest_backup','contagest_monitor'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON FUNCTION private.contagest_runtime_tenant_id() FROM %I',
        role_name
      );
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='contagest_runtime') THEN
    RAISE EXCEPTION 'V720_RUNTIME_ROLE_REQUIRED';
  END IF;

  GRANT USAGE ON SCHEMA private TO contagest_runtime;
  GRANT EXECUTE ON FUNCTION private.contagest_runtime_tenant_id() TO contagest_runtime;
END
$$;
