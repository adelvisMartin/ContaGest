-- Control Hípico: expose credential state without duplicating passwords or hashes.
ALTER TABLE public.hipico_users
  ADD COLUMN IF NOT EXISTS credential_state text NOT NULL DEFAULT 'unknown'
    CHECK (credential_state IN ('unknown','password_set','recovery_required')),
  ADD COLUMN IF NOT EXISTS credential_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_password_recovery_at timestamptz;

UPDATE public.hipico_users hu
SET credential_state = CASE
      WHEN EXISTS (
        SELECT 1 FROM auth.users au
        WHERE au.id = hu.user_id
          AND nullif(au.encrypted_password, '') IS NOT NULL
      ) THEN 'password_set'
      ELSE 'recovery_required'
    END,
    credential_updated_at = COALESCE(hu.credential_updated_at, now())
WHERE hu.credential_state = 'unknown';

DROP FUNCTION IF EXISTS public.hipico_admin_list_users();
CREATE FUNCTION public.hipico_admin_list_users()
RETURNS TABLE(
  user_id uuid,
  email text,
  display_name text,
  role text,
  status text,
  permissions jsonb,
  workspace_owner_id uuid,
  credential_state text,
  credential_updated_at timestamptz,
  last_password_recovery_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner uuid := public.hipico_workspace_owner();
BEGIN
  IF NOT public.hipico_is_admin() OR v_owner IS NULL THEN
    RAISE EXCEPTION 'HIPICO_ADMIN_REQUIRED' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT hu.user_id, hu.email, hu.display_name, hu.role, hu.status, hu.permissions,
           hu.workspace_owner_id, hu.credential_state, hu.credential_updated_at,
           hu.last_password_recovery_at, hu.last_seen_at, hu.created_at, hu.updated_at
    FROM public.hipico_users hu
    WHERE hu.workspace_owner_id = v_owner
    ORDER BY CASE WHEN hu.user_id = auth.uid() THEN 0 WHEN hu.role = 'admin' THEN 1 ELSE 2 END,
             lower(hu.display_name), lower(hu.email);
END;
$$;
REVOKE ALL ON FUNCTION public.hipico_admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hipico_admin_list_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.hipico_mark_password_changed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'HIPICO_AUTH_REQUIRED' USING errcode = '42501';
  END IF;
  UPDATE public.hipico_users
  SET credential_state = 'password_set', credential_updated_at = now(), updated_at = now()
  WHERE user_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.hipico_mark_password_changed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hipico_mark_password_changed() TO authenticated;

CREATE OR REPLACE FUNCTION public.hipico_admin_mark_recovery_requested(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner uuid := public.hipico_workspace_owner();
BEGIN
  IF NOT public.hipico_is_admin() OR v_owner IS NULL THEN
    RAISE EXCEPTION 'HIPICO_ADMIN_REQUIRED' USING errcode = '42501';
  END IF;
  UPDATE public.hipico_users
  SET credential_state = 'recovery_required', last_password_recovery_at = now(), updated_at = now()
  WHERE user_id = p_user_id AND workspace_owner_id = v_owner;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HIPICO_USER_NOT_FOUND' USING errcode = 'P0002';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.hipico_admin_mark_recovery_requested(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hipico_admin_mark_recovery_requested(uuid) TO authenticated;

COMMENT ON COLUMN public.hipico_users.credential_state IS
  'Non-secret credential status only. Passwords/hashes remain exclusively in Supabase Auth.';
COMMENT ON FUNCTION public.hipico_mark_password_changed() IS
  'Marks credential metadata after Supabase Auth changes a password; stores no password material.';