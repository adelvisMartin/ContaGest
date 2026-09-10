-- Control Hípico shared workspace authorization.
-- One authenticated identity can be attached to one authoritative workspace owner.
-- admin/operator may operate; viewer/auditor are read-only at the database boundary.

ALTER TABLE public.hipico_users
  ADD COLUMN IF NOT EXISTS workspace_owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.hipico_users
SET workspace_owner_id = user_id
WHERE workspace_owner_id IS NULL;

UPDATE public.hipico_users child
SET workspace_owner_id = COALESCE(parent.workspace_owner_id, parent.user_id)
FROM public.hipico_users parent
WHERE child.created_by = parent.user_id
  AND child.user_id <> parent.user_id;

ALTER TABLE public.hipico_users
  ALTER COLUMN workspace_owner_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS hipico_users_workspace_owner_idx
  ON public.hipico_users (workspace_owner_id, role, status);

CREATE OR REPLACE FUNCTION public.hipico_workspace_owner()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT hu.workspace_owner_id
  FROM public.hipico_users hu
  WHERE hu.user_id = auth.uid()
    AND hu.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.hipico_access_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT hu.role
  FROM public.hipico_users hu
  WHERE hu.user_id = auth.uid()
    AND hu.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.hipico_can_read_owner(p_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    p_owner = public.hipico_workspace_owner()
    AND public.hipico_access_role() IN ('admin','operator','viewer','auditor'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.hipico_can_operate_owner(p_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    p_owner = public.hipico_workspace_owner()
    AND public.hipico_access_role() IN ('admin','operator'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.hipico_can_admin_owner(p_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    p_owner = public.hipico_workspace_owner()
    AND public.hipico_access_role() = 'admin',
    false
  );
$$;

REVOKE ALL ON FUNCTION public.hipico_workspace_owner() FROM public;
REVOKE ALL ON FUNCTION public.hipico_access_role() FROM public;
REVOKE ALL ON FUNCTION public.hipico_can_read_owner(uuid) FROM public;
REVOKE ALL ON FUNCTION public.hipico_can_operate_owner(uuid) FROM public;
REVOKE ALL ON FUNCTION public.hipico_can_admin_owner(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.hipico_workspace_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_access_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_can_read_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_can_operate_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_can_admin_owner(uuid) TO authenticated;

DROP POLICY IF EXISTS hipico_users_select_self_or_admin ON public.hipico_users;
CREATE POLICY hipico_users_select_self_or_admin ON public.hipico_users FOR SELECT TO authenticated
USING (user_id = auth.uid() OR (public.hipico_is_admin() AND workspace_owner_id = public.hipico_workspace_owner()));

DROP POLICY IF EXISTS hipico_users_insert_admin ON public.hipico_users;
CREATE POLICY hipico_users_insert_admin ON public.hipico_users FOR INSERT TO authenticated
WITH CHECK (public.hipico_is_admin() AND workspace_owner_id = public.hipico_workspace_owner());

DROP POLICY IF EXISTS hipico_users_update_admin ON public.hipico_users;
CREATE POLICY hipico_users_update_admin ON public.hipico_users FOR UPDATE TO authenticated
USING (public.hipico_is_admin() AND workspace_owner_id = public.hipico_workspace_owner())
WITH CHECK (public.hipico_is_admin() AND workspace_owner_id = public.hipico_workspace_owner());

DROP POLICY IF EXISTS hipico_users_delete_admin ON public.hipico_users;
CREATE POLICY hipico_users_delete_admin ON public.hipico_users FOR DELETE TO authenticated
USING (public.hipico_is_admin() AND workspace_owner_id = public.hipico_workspace_owner());

DROP POLICY IF EXISTS hipico_profiles_insert_own ON public.hipico_profiles;
CREATE POLICY hipico_profiles_insert_own ON public.hipico_profiles FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid() AND role = public.hipico_access_role());

DROP POLICY IF EXISTS hipico_profiles_update_own ON public.hipico_profiles;
CREATE POLICY hipico_profiles_update_own ON public.hipico_profiles FOR UPDATE TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid() AND role = public.hipico_access_role());

DROP POLICY IF EXISTS hipico_workspaces_select_own ON public.hipico_workspaces;
DROP POLICY IF EXISTS hipico_workspaces_select_scope ON public.hipico_workspaces;
CREATE POLICY hipico_workspaces_select_scope ON public.hipico_workspaces FOR SELECT TO authenticated
USING (public.hipico_can_read_owner(owner_id));

DROP POLICY IF EXISTS hipico_workspaces_insert_own ON public.hipico_workspaces;
DROP POLICY IF EXISTS hipico_workspaces_insert_scope ON public.hipico_workspaces;
CREATE POLICY hipico_workspaces_insert_scope ON public.hipico_workspaces FOR INSERT TO authenticated
WITH CHECK (public.hipico_can_operate_owner(owner_id));

DROP POLICY IF EXISTS hipico_workspaces_update_own ON public.hipico_workspaces;
DROP POLICY IF EXISTS hipico_workspaces_update_scope ON public.hipico_workspaces;
CREATE POLICY hipico_workspaces_update_scope ON public.hipico_workspaces FOR UPDATE TO authenticated
USING (public.hipico_can_operate_owner(owner_id)) WITH CHECK (public.hipico_can_operate_owner(owner_id));

DROP POLICY IF EXISTS hipico_workspaces_delete_own ON public.hipico_workspaces;
DROP POLICY IF EXISTS hipico_workspaces_delete_scope ON public.hipico_workspaces;
CREATE POLICY hipico_workspaces_delete_scope ON public.hipico_workspaces FOR DELETE TO authenticated
USING (public.hipico_can_admin_owner(owner_id));

DROP POLICY IF EXISTS hipico_audit_select_own ON public.hipico_audit_events;
DROP POLICY IF EXISTS hipico_audit_select_scope ON public.hipico_audit_events;
CREATE POLICY hipico_audit_select_scope ON public.hipico_audit_events FOR SELECT TO authenticated
USING (public.hipico_can_read_owner(owner_id));

DROP POLICY IF EXISTS hipico_audit_insert_own ON public.hipico_audit_events;
DROP POLICY IF EXISTS hipico_audit_insert_scope ON public.hipico_audit_events;
CREATE POLICY hipico_audit_insert_scope ON public.hipico_audit_events FOR INSERT TO authenticated
WITH CHECK (public.hipico_can_read_owner(owner_id));

DROP POLICY IF EXISTS hipico_bot_channels_select_own ON public.hipico_bot_channels;
DROP POLICY IF EXISTS hipico_bot_channels_insert_own ON public.hipico_bot_channels;
DROP POLICY IF EXISTS hipico_bot_channels_update_own ON public.hipico_bot_channels;
DROP POLICY IF EXISTS hipico_bot_channels_delete_own ON public.hipico_bot_channels;
CREATE POLICY hipico_bot_channels_select_scope ON public.hipico_bot_channels FOR SELECT TO authenticated USING (public.hipico_can_read_owner(owner_id));
CREATE POLICY hipico_bot_channels_insert_scope ON public.hipico_bot_channels FOR INSERT TO authenticated WITH CHECK (public.hipico_can_operate_owner(owner_id));
CREATE POLICY hipico_bot_channels_update_scope ON public.hipico_bot_channels FOR UPDATE TO authenticated USING (public.hipico_can_operate_owner(owner_id)) WITH CHECK (public.hipico_can_operate_owner(owner_id));
CREATE POLICY hipico_bot_channels_delete_scope ON public.hipico_bot_channels FOR DELETE TO authenticated USING (public.hipico_can_admin_owner(owner_id));

DROP POLICY IF EXISTS hipico_ledger_entries_select_own ON public.hipico_ledger_entries;
DROP POLICY IF EXISTS hipico_ledger_entries_insert_own ON public.hipico_ledger_entries;
CREATE POLICY hipico_ledger_entries_select_scope ON public.hipico_ledger_entries FOR SELECT TO authenticated USING (public.hipico_can_read_owner(owner_id));
CREATE POLICY hipico_ledger_entries_insert_scope ON public.hipico_ledger_entries FOR INSERT TO authenticated WITH CHECK (public.hipico_can_operate_owner(owner_id));

DROP POLICY IF EXISTS hipico_messages_select_own ON public.hipico_messages;
DROP POLICY IF EXISTS hipico_messages_insert_own ON public.hipico_messages;
DROP POLICY IF EXISTS hipico_messages_update_own ON public.hipico_messages;
CREATE POLICY hipico_messages_select_scope ON public.hipico_messages FOR SELECT TO authenticated USING (public.hipico_can_read_owner(owner_id));
CREATE POLICY hipico_messages_insert_scope ON public.hipico_messages FOR INSERT TO authenticated WITH CHECK (public.hipico_can_operate_owner(owner_id));
CREATE POLICY hipico_messages_update_scope ON public.hipico_messages FOR UPDATE TO authenticated USING (public.hipico_can_operate_owner(owner_id)) WITH CHECK (public.hipico_can_operate_owner(owner_id));

DROP POLICY IF EXISTS hipico_operation_events_select_own ON public.hipico_operation_events;
DROP POLICY IF EXISTS hipico_operation_events_insert_own ON public.hipico_operation_events;
DROP POLICY IF EXISTS hipico_operation_events_update_own ON public.hipico_operation_events;
CREATE POLICY hipico_operation_events_select_scope ON public.hipico_operation_events FOR SELECT TO authenticated USING (public.hipico_can_read_owner(owner_id));
CREATE POLICY hipico_operation_events_insert_scope ON public.hipico_operation_events FOR INSERT TO authenticated WITH CHECK (public.hipico_can_operate_owner(owner_id));
CREATE POLICY hipico_operation_events_update_scope ON public.hipico_operation_events FOR UPDATE TO authenticated USING (public.hipico_can_operate_owner(owner_id)) WITH CHECK (public.hipico_can_operate_owner(owner_id));

DROP POLICY IF EXISTS hipico_outbox_select_own ON public.hipico_outbox;
DROP POLICY IF EXISTS hipico_outbox_insert_own ON public.hipico_outbox;
DROP POLICY IF EXISTS hipico_outbox_update_own ON public.hipico_outbox;
CREATE POLICY hipico_outbox_select_scope ON public.hipico_outbox FOR SELECT TO authenticated USING (public.hipico_can_read_owner(owner_id));
CREATE POLICY hipico_outbox_insert_scope ON public.hipico_outbox FOR INSERT TO authenticated WITH CHECK (public.hipico_can_operate_owner(owner_id));
CREATE POLICY hipico_outbox_update_scope ON public.hipico_outbox FOR UPDATE TO authenticated USING (public.hipico_can_operate_owner(owner_id)) WITH CHECK (public.hipico_can_operate_owner(owner_id));

DROP POLICY IF EXISTS hipico_reconciliations_select_own ON public.hipico_reconciliations;
DROP POLICY IF EXISTS hipico_reconciliations_insert_own ON public.hipico_reconciliations;
DROP POLICY IF EXISTS hipico_reconciliations_update_own ON public.hipico_reconciliations;
CREATE POLICY hipico_reconciliations_select_scope ON public.hipico_reconciliations FOR SELECT TO authenticated USING (public.hipico_can_read_owner(owner_id));
CREATE POLICY hipico_reconciliations_insert_scope ON public.hipico_reconciliations FOR INSERT TO authenticated WITH CHECK (public.hipico_can_operate_owner(owner_id));
CREATE POLICY hipico_reconciliations_update_scope ON public.hipico_reconciliations FOR UPDATE TO authenticated USING (public.hipico_can_operate_owner(owner_id)) WITH CHECK (public.hipico_can_operate_owner(owner_id));

DROP POLICY IF EXISTS hipico_shadow_eval_select_own ON public.hipico_shadow_evaluations;
DROP POLICY IF EXISTS hipico_shadow_eval_insert_own ON public.hipico_shadow_evaluations;
DROP POLICY IF EXISTS hipico_shadow_eval_update_own ON public.hipico_shadow_evaluations;
CREATE POLICY hipico_shadow_eval_select_scope ON public.hipico_shadow_evaluations FOR SELECT TO authenticated USING (public.hipico_can_read_owner(owner_id));
CREATE POLICY hipico_shadow_eval_insert_scope ON public.hipico_shadow_evaluations FOR INSERT TO authenticated WITH CHECK (public.hipico_can_operate_owner(owner_id));
CREATE POLICY hipico_shadow_eval_update_scope ON public.hipico_shadow_evaluations FOR UPDATE TO authenticated USING (public.hipico_can_operate_owner(owner_id)) WITH CHECK (public.hipico_can_operate_owner(owner_id));

CREATE OR REPLACE FUNCTION public.hipico_sync_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.hipico_users
  SET email = lower(coalesce(new.email, email)),
      display_name = coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), display_name),
      updated_at = now()
  WHERE user_id = new.id;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.hipico_get_profile()
RETURNS public.hipico_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_access public.hipico_users;
  v_profile public.hipico_profiles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'HIPICO_AUTH_REQUIRED' USING errcode = '42501'; END IF;
  SELECT * INTO v_access FROM public.hipico_users WHERE user_id = v_uid AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'HIPICO_ACCESS_REQUIRED' USING errcode = '42501'; END IF;
  SELECT * INTO v_profile FROM public.hipico_profiles WHERE owner_id = v_uid;
  IF NOT FOUND THEN
    INSERT INTO public.hipico_profiles (owner_id, display_name, role)
    VALUES (v_uid, v_access.display_name, v_access.role) RETURNING * INTO v_profile;
  ELSIF v_profile.role IS DISTINCT FROM v_access.role OR v_profile.display_name IS DISTINCT FROM v_access.display_name THEN
    UPDATE public.hipico_profiles SET role = v_access.role, display_name = v_access.display_name, updated_at = now()
    WHERE owner_id = v_uid RETURNING * INTO v_profile;
  END IF;
  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.hipico_get_workspace()
RETURNS SETOF public.hipico_workspaces
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_owner uuid := public.hipico_workspace_owner();
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'HIPICO_ACCESS_REQUIRED' USING errcode = '42501'; END IF;
  RETURN QUERY SELECT w.* FROM public.hipico_workspaces w WHERE w.owner_id = v_owner ORDER BY w.updated_at DESC LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.hipico_save_workspace(p_name text, p_state jsonb, p_expected_version bigint DEFAULT 0)
RETURNS public.hipico_workspaces
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid := public.hipico_workspace_owner();
  v_role text := public.hipico_access_role();
  v_row public.hipico_workspaces;
  v_expected bigint := greatest(coalesce(p_expected_version, 0), 0);
BEGIN
  IF v_uid IS NULL OR v_owner IS NULL THEN RAISE EXCEPTION 'HIPICO_ACCESS_REQUIRED' USING errcode = '42501'; END IF;
  IF v_role NOT IN ('admin','operator') THEN RAISE EXCEPTION 'HIPICO_READ_ONLY_ROLE' USING errcode = '42501'; END IF;
  IF p_state IS NULL OR jsonb_typeof(p_state) <> 'object' THEN RAISE EXCEPTION 'HIPICO_INVALID_STATE' USING errcode = '22023'; END IF;
  SELECT * INTO v_row FROM public.hipico_workspaces WHERE owner_id = v_owner FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.hipico_workspaces (owner_id, name, state, version, created_at, updated_at)
    VALUES (v_owner, coalesce(nullif(trim(p_name), ''), 'Control Hípico'), p_state, 1, now(), now())
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;
  IF v_expected > 0 AND v_row.version <> v_expected THEN
    RAISE EXCEPTION 'HIPICO_VERSION_CONFLICT expected %, current %', v_expected, v_row.version USING errcode = '40001';
  END IF;
  UPDATE public.hipico_workspaces
  SET name = coalesce(nullif(trim(p_name), ''), name), state = p_state, version = version + 1, updated_at = now()
  WHERE id = v_row.id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.hipico_append_audit(p_workspace_id uuid, p_action text, p_entity_type text, p_entity_id text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid := public.hipico_workspace_owner();
  v_role text := public.hipico_access_role();
  v_id bigint;
BEGIN
  IF v_uid IS NULL OR v_owner IS NULL THEN RAISE EXCEPTION 'HIPICO_ACCESS_REQUIRED' USING errcode = '42501'; END IF;
  IF p_workspace_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.hipico_workspaces WHERE id = p_workspace_id AND owner_id = v_owner) THEN
    RAISE EXCEPTION 'HIPICO_WORKSPACE_FORBIDDEN' USING errcode = '42501';
  END IF;
  INSERT INTO public.hipico_audit_events (owner_id, workspace_id, action, entity_type, entity_id, payload)
  VALUES (v_owner, p_workspace_id, coalesce(nullif(trim(p_action), ''), 'unknown'), coalesce(nullif(trim(p_entity_type), ''), 'unknown'), nullif(trim(p_entity_id), ''), coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('actorUserId', v_uid::text, 'actorRole', v_role))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS public.hipico_get_my_access();
CREATE FUNCTION public.hipico_get_my_access()
RETURNS TABLE (user_id uuid,email text,display_name text,role text,status text,permissions jsonb,workspace_owner_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
  SELECT hu.user_id,hu.email,hu.display_name,hu.role,hu.status,hu.permissions,hu.workspace_owner_id
  FROM public.hipico_users hu WHERE hu.user_id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.hipico_get_my_access() TO authenticated;

DROP FUNCTION IF EXISTS public.hipico_admin_list_users();
CREATE FUNCTION public.hipico_admin_list_users()
RETURNS TABLE (user_id uuid,email text,display_name text,role text,status text,permissions jsonb,workspace_owner_id uuid,last_seen_at timestamptz,created_at timestamptz,updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_owner uuid := public.hipico_workspace_owner();
BEGIN
  IF NOT public.hipico_is_admin() OR v_owner IS NULL THEN RAISE EXCEPTION 'HIPICO_ADMIN_REQUIRED' USING errcode = '42501'; END IF;
  RETURN QUERY SELECT hu.user_id,hu.email,hu.display_name,hu.role,hu.status,hu.permissions,hu.workspace_owner_id,hu.last_seen_at,hu.created_at,hu.updated_at
  FROM public.hipico_users hu WHERE hu.workspace_owner_id = v_owner
  ORDER BY CASE WHEN hu.user_id = auth.uid() THEN 0 WHEN hu.role = 'admin' THEN 1 ELSE 2 END, lower(hu.display_name), lower(hu.email);
END;
$$;
GRANT EXECUTE ON FUNCTION public.hipico_admin_list_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.hipico_admin_set_user_access(p_user_id uuid,p_role text,p_status text DEFAULT 'active',p_permissions jsonb DEFAULT NULL)
RETURNS public.hipico_users
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_owner uuid := public.hipico_workspace_owner(); v_row public.hipico_users;
BEGIN
  IF NOT public.hipico_is_admin() OR v_owner IS NULL THEN RAISE EXCEPTION 'HIPICO_ADMIN_REQUIRED' USING errcode = '42501'; END IF;
  IF p_role NOT IN ('admin','operator','viewer','auditor') THEN RAISE EXCEPTION 'HIPICO_INVALID_ROLE' USING errcode = '22023'; END IF;
  IF p_status NOT IN ('active','suspended','disabled') THEN RAISE EXCEPTION 'HIPICO_INVALID_STATUS' USING errcode = '22023'; END IF;
  IF p_user_id = auth.uid() AND (p_role <> 'admin' OR p_status <> 'active') THEN RAISE EXCEPTION 'HIPICO_CANNOT_DEMOTE_SELF' USING errcode = '22023'; END IF;
  UPDATE public.hipico_users
  SET role=p_role,status=p_status,permissions=coalesce(p_permissions,CASE WHEN p_role='admin' THEN '["hipico:*"]'::jsonb WHEN p_role='auditor' THEN '["hipico:read","hipico:audit"]'::jsonb WHEN p_role='viewer' THEN '["hipico:read"]'::jsonb ELSE '["hipico:read","hipico:operate"]'::jsonb END),updated_at=now()
  WHERE user_id=p_user_id AND workspace_owner_id=v_owner RETURNING * INTO v_row;
  IF v_row.user_id IS NULL THEN RAISE EXCEPTION 'HIPICO_USER_NOT_FOUND' USING errcode = 'P0002'; END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.hipico_admin_grant_user_by_email(p_email text,p_display_name text DEFAULT NULL,p_role text DEFAULT 'operator')
RETURNS public.hipico_users
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $$
DECLARE v_owner uuid := public.hipico_workspace_owner(); v_auth auth.users; v_existing public.hipico_users; v_row public.hipico_users;
BEGIN
  IF NOT public.hipico_is_admin() OR v_owner IS NULL THEN RAISE EXCEPTION 'HIPICO_ADMIN_REQUIRED' USING errcode = '42501'; END IF;
  IF p_role NOT IN ('admin','operator','viewer','auditor') THEN RAISE EXCEPTION 'HIPICO_INVALID_ROLE' USING errcode = '22023'; END IF;
  IF nullif(trim(p_email),'') IS NULL THEN RAISE EXCEPTION 'HIPICO_EMAIL_REQUIRED' USING errcode = '22023'; END IF;
  SELECT * INTO v_auth FROM auth.users WHERE lower(email)=lower(trim(p_email)) LIMIT 1;
  IF v_auth.id IS NULL THEN RAISE EXCEPTION 'HIPICO_AUTH_USER_NOT_FOUND' USING errcode = 'P0002'; END IF;
  SELECT * INTO v_existing FROM public.hipico_users WHERE user_id=v_auth.id;
  IF FOUND AND v_existing.workspace_owner_id <> v_owner THEN RAISE EXCEPTION 'HIPICO_USER_ALREADY_ASSIGNED' USING errcode = '23505'; END IF;
  INSERT INTO public.hipico_users (user_id,email,display_name,role,status,permissions,created_by,workspace_owner_id)
  VALUES (v_auth.id,lower(v_auth.email),coalesce(nullif(trim(p_display_name),''),nullif(v_auth.raw_user_meta_data->>'name',''),split_part(v_auth.email,'@',1)),p_role,'active',CASE WHEN p_role='admin' THEN '["hipico:*"]'::jsonb WHEN p_role='auditor' THEN '["hipico:read","hipico:audit"]'::jsonb WHEN p_role='viewer' THEN '["hipico:read"]'::jsonb ELSE '["hipico:read","hipico:operate"]'::jsonb END,auth.uid(),v_owner)
  ON CONFLICT (user_id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,role=excluded.role,status='active',permissions=excluded.permissions,workspace_owner_id=excluded.workspace_owner_id,updated_at=now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.hipico_admin_set_user_access(uuid,text,text,jsonb) FROM public;
REVOKE ALL ON FUNCTION public.hipico_admin_grant_user_by_email(text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.hipico_admin_set_user_access(uuid,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_admin_grant_user_by_email(text,text,text) TO authenticated;
