CREATE OR REPLACE FUNCTION public.hipico_recent_shadow_evaluations(p_limit integer DEFAULT 12)
RETURNS SETOF public.hipico_shadow_evaluations
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner uuid := public.hipico_workspace_owner();
  v_limit integer := least(30, greatest(1, coalesce(p_limit, 12)));
BEGIN
  IF v_owner IS NULL OR public.hipico_access_role() NOT IN ('admin','operator','viewer','auditor') THEN
    RAISE EXCEPTION 'HIPICO_ACCESS_REQUIRED' USING errcode = '42501';
  END IF;

  RETURN QUERY
    SELECT e.*
    FROM public.hipico_shadow_evaluations e
    WHERE e.owner_id = v_owner
    ORDER BY e.predicted_at DESC, e.created_at DESC
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.hipico_recent_shadow_evaluations(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.hipico_recent_shadow_evaluations(integer) TO authenticated;
