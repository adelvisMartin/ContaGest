-- #116 Control Hípico backend authority hardening.
-- Additive/fail-closed: only touches Hípico tables that already exist.
-- Production clients must use RPCs for sensitive capabilities; direct table fallback is LAB-only in the PWA.

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'hipico_profiles',
    'hipico_workspaces',
    'hipico_audit_events',
    'hipico_shadow_evaluations'
  ] LOOP
    IF to_regclass(format('public.%I', target_table)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target_table);
    END IF;
  END LOOP;
END $$;

-- Owner-scoped policies are installed only when Supabase auth.uid() is available and the expected owner_id column exists.
DO $$
DECLARE
  target_table text;
  target_policy text;
  has_owner boolean;
BEGIN
  IF to_regnamespace('auth') IS NULL THEN
    RETURN;
  END IF;

  FOREACH target_table IN ARRAY ARRAY['hipico_profiles', 'hipico_workspaces', 'hipico_audit_events'] LOOP
    IF to_regclass(format('public.%I', target_table)) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = target_table
        AND a.attname = 'owner_id'
        AND a.attnum > 0
        AND NOT a.attisdropped
    ) INTO has_owner;

    IF NOT has_owner THEN
      CONTINUE;
    END IF;

    target_policy := format('%s_owner_isolation_v116', target_table);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = target_table
        AND policyname = target_policy
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())',
        target_policy,
        target_table
      );
    END IF;
  END LOOP;
END $$;

-- Shadow evaluations may carry owner_id in newer schemas. If present, enforce owner isolation as well.
DO $$
DECLARE
  has_owner boolean;
BEGIN
  IF to_regnamespace('auth') IS NULL OR to_regclass('public.hipico_shadow_evaluations') IS NULL THEN
    RETURN;
  END IF;
  SELECT EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'hipico_shadow_evaluations'
      AND a.attname = 'owner_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) INTO has_owner;
  IF has_owner AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'hipico_shadow_evaluations'
      AND policyname = 'hipico_shadow_evaluations_owner_isolation_v116'
  ) THEN
    EXECUTE 'CREATE POLICY hipico_shadow_evaluations_owner_isolation_v116 ON public.hipico_shadow_evaluations FOR SELECT TO authenticated USING (owner_id = auth.uid())';
  END IF;
END $$;

-- Read-only authoritative RPC for recent shadow evaluations. It is created only when the table exists.
DO $$
BEGIN
  IF to_regclass('public.hipico_shadow_evaluations') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.hipico_recent_shadow_evaluations(p_limit integer DEFAULT 12)
    RETURNS SETOF public.hipico_shadow_evaluations
    LANGUAGE sql
    SECURITY INVOKER
    SET search_path = public, pg_temp
    AS $body$
      SELECT e.*
      FROM public.hipico_shadow_evaluations e
      ORDER BY e.predicted_at DESC
      LIMIT LEAST(30, GREATEST(1, COALESCE(p_limit, 12)))
    $body$
  $fn$;

  EXECUTE 'REVOKE ALL ON FUNCTION public.hipico_recent_shadow_evaluations(integer) FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.hipico_recent_shadow_evaluations(integer) TO authenticated';
  END IF;
END $$;

-- No service-role credential is created or stored here. Service-role remains server-only operational configuration.
