-- Control Hípico performance hardening for shared-role access paths.

CREATE INDEX IF NOT EXISTS hipico_ledger_reversal_idx
  ON public.hipico_ledger_entries (reversal_of);
CREATE INDEX IF NOT EXISTS hipico_messages_channel_idx
  ON public.hipico_messages (channel_id);
CREATE INDEX IF NOT EXISTS hipico_operation_events_source_message_idx
  ON public.hipico_operation_events (source_message_id);
CREATE INDEX IF NOT EXISTS hipico_outbox_source_event_idx
  ON public.hipico_outbox (source_event_id);
CREATE INDEX IF NOT EXISTS hipico_reconciliations_source_message_idx
  ON public.hipico_reconciliations (source_message_id);
CREATE INDEX IF NOT EXISTS hipico_shadow_source_message_idx
  ON public.hipico_shadow_evaluations (source_message_id);
CREATE INDEX IF NOT EXISTS hipico_shadow_observed_message_idx
  ON public.hipico_shadow_evaluations (observed_message_id);
CREATE INDEX IF NOT EXISTS hipico_users_created_by_idx
  ON public.hipico_users (created_by);

DROP POLICY IF EXISTS hipico_users_select_self_or_admin ON public.hipico_users;
CREATE POLICY hipico_users_select_self_or_admin
ON public.hipico_users
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (public.hipico_is_admin() AND workspace_owner_id = public.hipico_workspace_owner())
);

DROP POLICY IF EXISTS hipico_profiles_insert_own ON public.hipico_profiles;
CREATE POLICY hipico_profiles_insert_own
ON public.hipico_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = (SELECT auth.uid())
  AND role = public.hipico_access_role()
);

DROP POLICY IF EXISTS hipico_profiles_update_own ON public.hipico_profiles;
CREATE POLICY hipico_profiles_update_own
ON public.hipico_profiles
FOR UPDATE
TO authenticated
USING (owner_id = (SELECT auth.uid()))
WITH CHECK (
  owner_id = (SELECT auth.uid())
  AND role = public.hipico_access_role()
);
