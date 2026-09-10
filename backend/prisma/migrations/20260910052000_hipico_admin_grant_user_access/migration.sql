-- Allow an active Control Hípico admin to grant application access to an
-- already-existing Supabase Auth identity by email. No password/auth secret
-- is exposed and auth.users remains the authentication authority.

CREATE OR REPLACE FUNCTION public.hipico_admin_grant_user_by_email(
  p_email text,
  p_display_name text DEFAULT NULL,
  p_role text DEFAULT 'operator'
)
RETURNS public.hipico_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_auth auth.users;
  v_row public.hipico_users;
BEGIN
  IF NOT public.hipico_is_admin() THEN
    RAISE EXCEPTION 'HIPICO_ADMIN_REQUIRED' USING errcode = '42501';
  END IF;
  IF p_role NOT IN ('admin','operator','viewer','auditor') THEN
    RAISE EXCEPTION 'HIPICO_INVALID_ROLE' USING errcode = '22023';
  END IF;
  IF nullif(trim(p_email), '') IS NULL THEN
    RAISE EXCEPTION 'HIPICO_EMAIL_REQUIRED' USING errcode = '22023';
  END IF;

  SELECT * INTO v_auth
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;

  IF v_auth.id IS NULL THEN
    RAISE EXCEPTION 'HIPICO_AUTH_USER_NOT_FOUND' USING errcode = 'P0002';
  END IF;

  INSERT INTO public.hipico_users (
    user_id, email, display_name, role, status, permissions, created_by
  ) VALUES (
    v_auth.id,
    lower(v_auth.email),
    coalesce(nullif(trim(p_display_name), ''), nullif(v_auth.raw_user_meta_data ->> 'name', ''), split_part(v_auth.email, '@', 1)),
    p_role,
    'active',
    CASE
      WHEN p_role = 'admin' THEN '["hipico:*"]'::jsonb
      WHEN p_role = 'auditor' THEN '["hipico:read","hipico:audit"]'::jsonb
      WHEN p_role = 'viewer' THEN '["hipico:read"]'::jsonb
      ELSE '["hipico:read","hipico:operate"]'::jsonb
    END,
    auth.uid()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = excluded.email,
    display_name = excluded.display_name,
    role = excluded.role,
    status = 'active',
    permissions = excluded.permissions,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.hipico_admin_grant_user_by_email(text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.hipico_admin_grant_user_by_email(text,text,text) TO authenticated;
