-- Control Hípico: independent report link capabilities.
-- No data migration, settlement changes or automatic issuance.
BEGIN;

CREATE TABLE IF NOT EXISTS public.hipico_report_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  group_key TEXT NOT NULL CHECK (length(group_key) BETWEEN 1 AND 120),
  audience TEXT NOT NULL CHECK (audience IN ('participant','group')),
  participant_code TEXT,
  token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hipico_report_link_audience_scope CHECK (
    (audience='participant' AND participant_code IS NOT NULL AND length(participant_code) BETWEEN 1 AND 120)
    OR (audience='group' AND participant_code IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS hipico_report_share_owner_idx
  ON public.hipico_report_share_links(owner_id, group_key, created_at DESC);
CREATE INDEX IF NOT EXISTS hipico_report_share_expiry_idx
  ON public.hipico_report_share_links(expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.hipico_report_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hipico_report_share_links FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.hipico_report_share_links FROM PUBLIC;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','contagest_backup','contagest_monitor'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE public.hipico_report_share_links FROM %I', role_name);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='contagest_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.hipico_report_share_links TO contagest_runtime;
    DROP POLICY IF EXISTS hipico_report_share_runtime_owner ON public.hipico_report_share_links;
    CREATE POLICY hipico_report_share_runtime_owner ON public.hipico_report_share_links
      FOR ALL TO contagest_runtime
      USING (owner_id::text = nullif(current_setting('hipico.report_owner_id', true), ''))
      WITH CHECK (owner_id::text = nullif(current_setting('hipico.report_owner_id', true), ''));
  END IF;
END
$$;

COMMIT;
