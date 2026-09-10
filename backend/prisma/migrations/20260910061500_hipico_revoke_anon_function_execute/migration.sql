-- Explicitly remove anonymous/public EXECUTE from Control Hípico functions.
-- Authenticated access remains only where required by RLS or the PWA RPC surface.

REVOKE EXECUTE ON FUNCTION public.hipico_access_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hipico_workspace_owner() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hipico_can_read_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hipico_can_operate_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hipico_can_admin_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hipico_is_admin() FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.hipico_get_profile() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hipico_get_workspace() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hipico_save_workspace(text,jsonb,bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hipico_append_audit(uuid,text,text,text,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hipico_get_my_access() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hipico_admin_list_users() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hipico_admin_set_user_access(uuid,text,text,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hipico_admin_grant_user_by_email(text,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hipico_recent_shadow_evaluations(integer) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.hipico_sync_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hipico_set_updated_at() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.hipico_access_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_workspace_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_can_read_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_can_operate_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_can_admin_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_is_admin() TO authenticated;

GRANT EXECUTE ON FUNCTION public.hipico_get_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_get_workspace() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_save_workspace(text,jsonb,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_append_audit(uuid,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_get_my_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_admin_set_user_access(uuid,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_admin_grant_user_by_email(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hipico_recent_shadow_evaluations(integer) TO authenticated;
