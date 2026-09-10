-- Control Hípico: authoritative application access/roles linked to Supabase Auth.
-- Authentication remains in auth.users; this table controls product authorization only.

CREATE TABLE IF NOT EXISTS public.hipico_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL DEFAULT 'Operador Hípico',
  role text NOT NULL DEFAULT 'operator' CHECK (role IN ('admin','operator','viewer','auditor')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','disabled')),
  permissions jsonb NOT NULL DEFAULT '["hipico:read","hipico:operate"]'::jsonb,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hipico_users_email_unique ON public.hipico_users (lower(email));
CREATE INDEX IF NOT EXISTS hipico_users_role_status_idx ON public.hipico_users (role, status);

CREATE OR REPLACE FUNCTION public.hipico_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT hu.role = 'admin' AND hu.status = 'active'
    FROM public.hipico_users hu
    WHERE hu.user_id = auth.uid()
  ), false);
$$;

REVOKE ALL ON FUNCTION public.hipico_is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.hipico_is_admin() TO authenticated;

ALTER TABLE public.hipico_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hipico_users_select_self_or_admin ON public.hipico_users;
CREATE POLICY hipico_users_select_self_or_admin
ON public.hipico_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.hipico_is_admin());

DROP POLICY IF EXISTS hipico_users_insert_admin ON public.hipico_users;
CREATE POLICY hipico_users_insert_admin
ON public.hipico_users
FOR INSERT
TO authenticated
WITH CHECK (public.hipico_is_admin());

DROP POLICY IF EXISTS hipico_users_update_admin ON public.hipico_users;
CREATE POLICY hipico_users_update_admin
ON public.hipico_users
FOR UPDATE
TO authenticated
USING (public.hipico_is_admin())
WITH CHECK (public.hipico_is_admin());

DROP POLICY IF EXISTS hipico_users_delete_admin ON public.hipico_users;
CREATE POLICY hipico_users_delete_admin
ON public.hipico_users
FOR DELETE
TO authenticated
USING (public.hipico_is_admin());

GRANT SELECT ON public.hipico_users TO authenticated;

INSERT INTO public.hipico_users (user_id, email, display_name, role, status, permissions)
SELECT p.owner_id,
       lower(u.email),
       p.display_name,
       CASE WHEN p.role IN ('admin','operator','viewer','auditor') THEN p.role ELSE 'operator' END,
       'active',
       CASE
         WHEN p.role = 'admin' THEN '["hipico:*"]'::jsonb
         WHEN p.role = 'auditor' THEN '["hipico:read","hipico:audit"]'::jsonb
         WHEN p.role = 'viewer' THEN '["hipico:read"]'::jsonb
         ELSE '["hipico:read","hipico:operate"]'::jsonb
       END
FROM public.hipico_profiles p
JOIN auth.users u ON u.id = p.owner_id
WHERE u.email IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  email = excluded.email,
  display_name = excluded.display_name,
  role = excluded.role,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.hipico_sync_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_app text;
  v_name text;
BEGIN
  v_app := coalesce(new.raw_app_meta_data ->> 'app', new.raw_user_meta_data ->> 'app', '');
  IF v_app <> 'hipico-control' THEN
    RETURN new;
  END IF;

  v_name := coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, 'Operador Hípico'), '@', 1));

  INSERT INTO public.hipico_users (user_id, email, display_name, role, status, permissions)
  VALUES (
    new.id,
    lower(coalesce(new.email, new.id::text || '@invalid.local')),
    v_name,
    CASE WHEN coalesce(new.raw_app_meta_data ->> 'role', new.raw_user_meta_data ->> 'role') IN ('admin','operator','viewer','auditor')
      THEN coalesce(new.raw_app_meta_data ->> 'role', new.raw_user_meta_data ->> 'role')
      ELSE 'operator'
    END,
    'active',
    CASE
      WHEN coalesce(new.raw_app_meta_data ->> 'role', new.raw_user_meta_data ->> 'role') = 'admin' THEN '["hipico:*"]'::jsonb
      ELSE '["hipico:read","hipico:operate"]'::jsonb
    END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = excluded.email,
    display_name = coalesce(nullif(public.hipico_users.display_name, ''), excluded.display_name),
    updated_at = now();

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.hipico_sync_auth_user() FROM public;

DROP TRIGGER IF EXISTS hipico_sync_auth_user_trigger ON auth.users;
CREATE TRIGGER hipico_sync_auth_user_trigger
AFTER INSERT OR UPDATE OF email, raw_app_meta_data, raw_user_meta_data
ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.hipico_sync_auth_user();

DROP TRIGGER IF EXISTS hipico_users_set_updated_at ON public.hipico_users;
CREATE TRIGGER hipico_users_set_updated_at
BEFORE UPDATE ON public.hipico_users
FOR EACH ROW EXECUTE FUNCTION public.hipico_set_updated_at();

CREATE OR REPLACE FUNCTION public.hipico_get_my_access()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  role text,
  status text,
  permissions jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT hu.user_id, hu.email, hu.display_name, hu.role, hu.status, hu.permissions
  FROM public.hipico_users hu
  WHERE hu.user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.hipico_get_my_access() TO authenticated;

CREATE OR REPLACE FUNCTION public.hipico_admin_list_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  role text,
  status text,
  permissions jsonb,
  last_seen_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.hipico_is_admin() THEN
    RAISE EXCEPTION 'HIPICO_ADMIN_REQUIRED' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT hu.user_id, hu.email, hu.display_name, hu.role, hu.status, hu.permissions, hu.last_seen_at, hu.created_at, hu.updated_at
    FROM public.hipico_users hu
    ORDER BY CASE WHEN hu.role = 'admin' THEN 0 ELSE 1 END, lower(hu.display_name), lower(hu.email);
END;
$$;

REVOKE ALL ON FUNCTION public.hipico_admin_list_users() FROM public;
GRANT EXECUTE ON FUNCTION public.hipico_admin_list_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.hipico_admin_set_user_access(
  p_user_id uuid,
  p_role text,
  p_status text DEFAULT 'active',
  p_permissions jsonb DEFAULT NULL
)
RETURNS public.hipico_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.hipico_users;
BEGIN
  IF NOT public.hipico_is_admin() THEN
    RAISE EXCEPTION 'HIPICO_ADMIN_REQUIRED' USING errcode = '42501';
  END IF;
  IF p_role NOT IN ('admin','operator','viewer','auditor') THEN
    RAISE EXCEPTION 'HIPICO_INVALID_ROLE' USING errcode = '22023';
  END IF;
  IF p_status NOT IN ('active','suspended','disabled') THEN
    RAISE EXCEPTION 'HIPICO_INVALID_STATUS' USING errcode = '22023';
  END IF;
  IF p_user_id = auth.uid() AND (p_role <> 'admin' OR p_status <> 'active') THEN
    RAISE EXCEPTION 'HIPICO_CANNOT_DEMOTE_SELF' USING errcode = '22023';
  END IF;

  UPDATE public.hipico_users
  SET role = p_role,
      status = p_status,
      permissions = coalesce(
        p_permissions,
        CASE
          WHEN p_role = 'admin' THEN '["hipico:*"]'::jsonb
          WHEN p_role = 'auditor' THEN '["hipico:read","hipico:audit"]'::jsonb
          WHEN p_role = 'viewer' THEN '["hipico:read"]'::jsonb
          ELSE '["hipico:read","hipico:operate"]'::jsonb
        END
      ),
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING * INTO v_row;

  IF v_row.user_id IS NULL THEN
    RAISE EXCEPTION 'HIPICO_USER_NOT_FOUND' USING errcode = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.hipico_admin_set_user_access(uuid,text,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.hipico_admin_set_user_access(uuid,text,text,jsonb) TO authenticated;
