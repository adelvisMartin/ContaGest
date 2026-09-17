-- Control Hípico v14 / #361 — client audit RPC integrity hardening.
-- The browser may describe a local mutation, but it never becomes authoritative
-- financial/security evidence merely because the caller is authenticated.

ALTER TABLE public.hipico_audit_events
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS actor_role text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS authority text NOT NULL DEFAULT 'legacy';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.hipico_audit_events'::regclass
      AND conname = 'hipico_audit_source_check'
  ) THEN
    ALTER TABLE public.hipico_audit_events
      ADD CONSTRAINT hipico_audit_source_check
      CHECK (source IN ('legacy','client_sync','server'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.hipico_audit_events'::regclass
      AND conname = 'hipico_audit_authority_check'
  ) THEN
    ALTER TABLE public.hipico_audit_events
      ADD CONSTRAINT hipico_audit_authority_check
      CHECK (authority IN ('legacy','advisory','authoritative'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.hipico_audit_events'::regclass
      AND conname = 'hipico_audit_actor_role_check'
  ) THEN
    ALTER TABLE public.hipico_audit_events
      ADD CONSTRAINT hipico_audit_actor_role_check
      CHECK (actor_role IS NULL OR actor_role IN ('admin','operator','viewer','auditor','service'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.hipico_audit_idempotency_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text := coalesce(
    nullif(trim(new.idempotency_key), ''),
    nullif(trim(coalesce(new.payload ->> 'id', '')), '')
  );
  v_existing public.hipico_audit_events;
BEGIN
  new.idempotency_key := v_key;
  IF v_key IS NULL THEN
    RETURN new;
  END IF;

  SELECT * INTO v_existing
  FROM public.hipico_audit_events
  WHERE owner_id = new.owner_id AND idempotency_key = v_key
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN new;
  END IF;

  -- Compatibility for an event created before v14 and retried by the same
  -- browser after deployment. Core identity must still match; only the payload
  -- representation is allowed to move from legacy -> canonical advisory.
  IF v_existing.source = 'legacy'
     AND v_existing.authority = 'legacy'
     AND new.source = 'client_sync'
     AND new.authority = 'advisory'
     AND v_existing.workspace_id IS NOT DISTINCT FROM new.workspace_id
     AND v_existing.action IS NOT DISTINCT FROM new.action
     AND v_existing.entity_type IS NOT DISTINCT FROM new.entity_type
     AND v_existing.entity_id IS NOT DISTINCT FROM new.entity_id THEN
    RETURN NULL;
  END IF;

  IF v_existing.workspace_id IS DISTINCT FROM new.workspace_id
     OR v_existing.action IS DISTINCT FROM new.action
     OR v_existing.entity_type IS DISTINCT FROM new.entity_type
     OR v_existing.entity_id IS DISTINCT FROM new.entity_id
     OR v_existing.payload IS DISTINCT FROM new.payload
     OR v_existing.actor_user_id IS DISTINCT FROM new.actor_user_id
     OR v_existing.actor_role IS DISTINCT FROM new.actor_role
     OR v_existing.source IS DISTINCT FROM new.source
     OR v_existing.authority IS DISTINCT FROM new.authority THEN
    RAISE EXCEPTION 'HIPICO_AUDIT_REPLAY_MISMATCH' USING errcode = '23505';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.hipico_append_audit(
  p_workspace_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid := public.hipico_workspace_owner();
  v_role text := public.hipico_access_role();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_entity_type text := lower(trim(coalesce(p_entity_type, '')));
  v_entity_id text := nullif(trim(p_entity_id), '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_key text := nullif(trim(coalesce(p_payload ->> 'id', '')), '');
  v_expected_entity text;
  v_details jsonb := '{}'::jsonb;
  v_canonical_payload jsonb;
  v_id bigint;
  v_existing public.hipico_audit_events;
BEGIN
  IF v_uid IS NULL OR v_owner IS NULL THEN
    RAISE EXCEPTION 'HIPICO_ACCESS_REQUIRED' USING errcode = '42501';
  END IF;
  IF v_role NOT IN ('admin','operator') THEN
    RAISE EXCEPTION 'HIPICO_READ_ONLY_ROLE' USING errcode = '42501';
  END IF;
  IF p_workspace_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hipico_workspaces
    WHERE id = p_workspace_id AND owner_id = v_owner
  ) THEN
    RAISE EXCEPTION 'HIPICO_WORKSPACE_FORBIDDEN' USING errcode = '42501';
  END IF;

  IF jsonb_typeof(v_payload) <> 'object' THEN
    RAISE EXCEPTION 'HIPICO_AUDIT_PAYLOAD_INVALID' USING errcode = '22023';
  END IF;
  IF octet_length(v_payload::text) > 32768 THEN
    RAISE EXCEPTION 'HIPICO_AUDIT_PAYLOAD_TOO_LARGE' USING errcode = '22023';
  END IF;
  IF v_key IS NULL OR length(v_key) > 180 THEN
    RAISE EXCEPTION 'HIPICO_AUDIT_EVENT_ID_INVALID' USING errcode = '22023';
  END IF;
  IF length(v_action) > 80 OR length(v_entity_type) > 80
     OR coalesce(length(v_entity_id), 0) > 240 THEN
    RAISE EXCEPTION 'HIPICO_AUDIT_IDENTITY_INVALID' USING errcode = '22023';
  END IF;
  IF length(coalesce(v_payload ->> 'message', '')) > 2000
     OR length(coalesce(v_payload ->> 'groupId', '')) > 180
     OR length(coalesce(v_payload ->> 'createdAt', '')) > 80 THEN
    RAISE EXCEPTION 'HIPICO_AUDIT_PAYLOAD_INVALID' USING errcode = '22023';
  END IF;

  v_expected_entity := CASE
    WHEN v_action IN (
      'race_locked','race_unlocked','race_created','race_settled','race_closed',
      'settlement_reopened','board_updated','board_from_whatsapp','whatsapp_imported',
      'advanced_loaded'
    ) THEN 'race'
    WHEN v_action IN ('bet_created','bet_created_multi','bet_duplicated','bet_cancelled') THEN 'bet'
    WHEN v_action IN ('participant_created','participant_updated') THEN 'participant'
    WHEN v_action IN ('advanced_created','advanced_imported','advanced_group_cleared','advanced_deleted') THEN 'advanced'
    WHEN v_action = 'movement_posted' THEN 'movement'
    WHEN v_action = 'settings_updated' THEN 'workspace'
    WHEN v_action = 'group_created' THEN 'group'
    WHEN v_action = 'rate_added' THEN 'rate'
    WHEN v_action IN ('polla_created','polla_entry_added','polla_updated') THEN 'polla'
    WHEN v_action = 'day_closed' THEN 'day'
    WHEN v_action = 'week_closed' THEN 'week'
    ELSE NULL
  END;

  IF v_expected_entity IS NULL THEN
    RAISE EXCEPTION 'HIPICO_AUDIT_ACTION_NOT_ALLOWED' USING errcode = '22023';
  END IF;
  IF v_entity_type <> v_expected_entity THEN
    RAISE EXCEPTION 'HIPICO_AUDIT_ENTITY_MISMATCH' USING errcode = '22023';
  END IF;

  IF jsonb_typeof(v_payload -> 'payload') = 'object' THEN
    v_details := (v_payload -> 'payload') - ARRAY[
      'actorUserId','actorRole','source','authority','financialAuthority','settlementAuthority'
    ]::text[];
  END IF;

  v_canonical_payload := jsonb_strip_nulls(jsonb_build_object(
    'id', v_key,
    'groupId', nullif(trim(v_payload ->> 'groupId'), ''),
    'action', v_action,
    'entityType', v_entity_type,
    'entityId', v_entity_id,
    'message', nullif(v_payload ->> 'message', ''),
    'payload', v_details,
    'clientCreatedAt', nullif(trim(v_payload ->> 'createdAt'), ''),
    'actorUserId', v_uid::text,
    'actorRole', v_role,
    'source', 'client_sync',
    'authority', 'advisory',
    'financialAuthority', false
  ));

  INSERT INTO public.hipico_audit_events(
    owner_id, workspace_id, action, entity_type, entity_id, payload, idempotency_key,
    actor_user_id, actor_role, source, authority
  ) VALUES (
    v_owner, p_workspace_id, v_action, v_entity_type, v_entity_id, v_canonical_payload, v_key,
    v_uid, v_role, 'client_sync', 'advisory'
  )
  ON CONFLICT (owner_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT * INTO v_existing
  FROM public.hipico_audit_events
  WHERE owner_id = v_owner AND idempotency_key = v_key
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HIPICO_AUDIT_IDEMPOTENCY_ROW_MISSING' USING errcode = '40001';
  END IF;

  IF v_existing.source = 'legacy'
     AND v_existing.authority = 'legacy'
     AND v_existing.workspace_id IS NOT DISTINCT FROM p_workspace_id
     AND v_existing.action = v_action
     AND v_existing.entity_type = v_entity_type
     AND v_existing.entity_id IS NOT DISTINCT FROM v_entity_id THEN
    RETURN v_existing.id;
  END IF;

  IF v_existing.workspace_id IS DISTINCT FROM p_workspace_id
     OR v_existing.action IS DISTINCT FROM v_action
     OR v_existing.entity_type IS DISTINCT FROM v_entity_type
     OR v_existing.entity_id IS DISTINCT FROM v_entity_id
     OR v_existing.payload IS DISTINCT FROM v_canonical_payload
     OR v_existing.actor_user_id IS DISTINCT FROM v_uid
     OR v_existing.actor_role IS DISTINCT FROM v_role
     OR v_existing.source IS DISTINCT FROM 'client_sync'
     OR v_existing.authority IS DISTINCT FROM 'advisory' THEN
    RAISE EXCEPTION 'HIPICO_AUDIT_REPLAY_MISMATCH' USING errcode = '23505';
  END IF;

  RETURN v_existing.id;
END;
$$;

-- The client never needs direct table mutation or sequence access. All durable
-- append authority stays behind the scoped RPC above.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.hipico_audit_events FROM anon, authenticated;
REVOKE USAGE, SELECT ON SEQUENCE public.hipico_audit_events_id_seq FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.hipico_append_audit(uuid, text, text, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hipico_append_audit(uuid, text, text, text, jsonb) TO authenticated, service_role;

COMMENT ON COLUMN public.hipico_audit_events.source
  IS 'Origin of the audit row. client_sync is browser supplied and must not be treated as server authority.';
COMMENT ON COLUMN public.hipico_audit_events.authority
  IS 'Trust classification. Browser-synchronized audit is advisory; authoritative is reserved for server-owned evidence.';
COMMENT ON FUNCTION public.hipico_append_audit(uuid, text, text, text, jsonb)
  IS 'Scoped idempotent browser audit append: admin/operator only, allowlisted action/entity pairs, bounded canonical payload, server-owned actor, client_sync/advisory authority, financialAuthority=false.';
