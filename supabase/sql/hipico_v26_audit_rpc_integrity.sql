-- Control Hípico v26 — client audit append integrity.
-- Additive/replay-safe hardening for the PWA -> PostgreSQL audit boundary.
-- Client-synchronized rows are advisory evidence only and never financial authority.

alter table public.hipico_audit_events
  add column if not exists source text,
  add column if not exists authority text;

-- Preserve historical meaning instead of retroactively declaring legacy rows authoritative.
update public.hipico_audit_events
set source = 'legacy'
where source is null;
update public.hipico_audit_events
set authority = 'legacy'
where authority is null;

alter table public.hipico_audit_events
  alter column source set default 'server',
  alter column source set not null,
  alter column authority set default 'authoritative',
  alter column authority set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hipico_audit_events'::regclass
      and conname = 'hipico_audit_events_source_check'
  ) then
    alter table public.hipico_audit_events
      add constraint hipico_audit_events_source_check
      check (source in ('legacy','client_sync','server'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hipico_audit_events'::regclass
      and conname = 'hipico_audit_events_authority_check'
  ) then
    alter table public.hipico_audit_events
      add constraint hipico_audit_events_authority_check
      check (authority in ('legacy','advisory','authoritative'));
  end if;
end $$;

create or replace function public.hipico_append_audit(
  p_workspace_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_workspace_id uuid;
  v_id bigint;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_entity_type text := lower(trim(coalesce(p_entity_type, '')));
  v_entity_id text := nullif(trim(coalesce(p_entity_id, '')), '');
  v_expected_entity text;
  v_input_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_payload jsonb;
  v_client_payload jsonb;
  v_key text;
  v_group_id text;
  v_message text;
  v_created_at text;
  v_existing public.hipico_audit_events;
begin
  if v_uid is null then
    raise exception 'HIPICO_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select lower(profile.role) into v_role
  from public.hipico_profiles profile
  where profile.owner_id = v_uid;

  if v_role is null or v_role not in ('admin','operator') then
    raise exception 'HIPICO_AUDIT_ROLE_FORBIDDEN' using errcode = '42501';
  end if;

  if p_workspace_id is null then
    select workspace.id into v_workspace_id
    from public.hipico_workspaces workspace
    where workspace.owner_id = v_uid
    order by workspace.updated_at desc
    limit 1;
  else
    select workspace.id into v_workspace_id
    from public.hipico_workspaces workspace
    where workspace.id = p_workspace_id
      and workspace.owner_id = v_uid;
  end if;

  if v_workspace_id is null then
    raise exception 'HIPICO_WORKSPACE_FORBIDDEN' using errcode = '42501';
  end if;

  if v_action !~ '^[a-z][a-z0-9_]{1,79}$' then
    raise exception 'HIPICO_AUDIT_ACTION_FORBIDDEN' using errcode = '22023';
  end if;
  if v_entity_type !~ '^[a-z][a-z0-9_]{1,79}$' then
    raise exception 'HIPICO_AUDIT_ENTITY_MISMATCH' using errcode = '22023';
  end if;
  if v_entity_id is null or length(v_entity_id) > 180 or v_entity_id ~ '[[:cntrl:]]' then
    raise exception 'HIPICO_AUDIT_ENTITY_ID_INVALID' using errcode = '22023';
  end if;

  -- BEGIN PWA AUDIT CATALOG
  select catalog.entity_type into v_expected_entity
  from (values
    ('advanced_created','advanced'),
    ('advanced_deleted','advanced'),
    ('advanced_group_cleared','advanced'),
    ('advanced_imported','advanced'),
    ('advanced_loaded','race'),
    ('bet_cancelled','bet'),
    ('bet_created_multi','bet'),
    ('bet_duplicated','bet'),
    ('board_from_whatsapp','race'),
    ('board_updated','race'),
    ('day_closed','day'),
    ('group_created','group'),
    ('movement_posted','movement'),
    ('participant_created','participant'),
    ('participant_updated','participant'),
    ('polla_created','polla'),
    ('polla_entry_added','polla'),
    ('polla_updated','polla'),
    ('race_closed','race'),
    ('race_created','race'),
    ('race_locked','race'),
    ('race_settled','race'),
    ('race_unlocked','race'),
    ('rate_added','rate'),
    ('settings_updated','workspace'),
    ('settlement_reopened','race'),
    ('week_closed','week'),
    ('whatsapp_imported','race')
  ) as catalog(action_name, entity_type)
  where catalog.action_name = v_action;
  -- END PWA AUDIT CATALOG

  if v_expected_entity is null then
    raise exception 'HIPICO_AUDIT_ACTION_FORBIDDEN' using errcode = '22023';
  end if;
  if v_expected_entity <> v_entity_type then
    raise exception 'HIPICO_AUDIT_ENTITY_MISMATCH' using errcode = '22023';
  end if;

  if jsonb_typeof(v_input_payload) <> 'object' then
    raise exception 'HIPICO_AUDIT_PAYLOAD_INVALID' using errcode = '22023';
  end if;
  if octet_length(v_input_payload::text) > 65536 then
    raise exception 'HIPICO_AUDIT_PAYLOAD_TOO_LARGE' using errcode = '22023';
  end if;

  v_key := nullif(trim(coalesce(v_input_payload ->> 'id', '')), '');
  if v_key is null or length(v_key) > 120 or v_key !~ '^audit-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception 'HIPICO_AUDIT_EVENT_ID_INVALID' using errcode = '22023';
  end if;

  v_group_id := nullif(trim(coalesce(v_input_payload ->> 'groupId', '')), '');
  if v_group_id is not null and (length(v_group_id) > 180 or v_group_id ~ '[[:cntrl:]]') then
    raise exception 'HIPICO_AUDIT_GROUP_ID_INVALID' using errcode = '22023';
  end if;

  v_message := coalesce(v_input_payload ->> 'message', '');
  if length(v_message) > 1000 or v_message ~ '[\u0000]' then
    raise exception 'HIPICO_AUDIT_MESSAGE_INVALID' using errcode = '22023';
  end if;

  v_created_at := nullif(trim(coalesce(v_input_payload ->> 'createdAt', '')), '');
  if v_created_at is not null and length(v_created_at) > 64 then
    raise exception 'HIPICO_AUDIT_CREATED_AT_INVALID' using errcode = '22023';
  end if;

  if v_input_payload ? 'payload' and jsonb_typeof(v_input_payload -> 'payload') <> 'object' then
    raise exception 'HIPICO_AUDIT_PAYLOAD_INVALID' using errcode = '22023';
  end if;
  v_client_payload := coalesce(v_input_payload -> 'payload', '{}'::jsonb)
    - 'actorUserId' - 'actorRole' - 'source' - 'authority'
    - 'financialAuthority' - 'settlementAuthority';

  -- Security-sensitive semantics are always server-owned. Client values with these
  -- names are discarded and replaced with canonical evidence metadata.
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'id', v_key,
    'groupId', v_group_id,
    'action', v_action,
    'entityType', v_entity_type,
    'entityId', v_entity_id,
    'message', v_message,
    'payload', v_client_payload,
    'createdAt', v_created_at,
    'actorUserId', v_uid::text,
    'actorRole', v_role,
    'source', 'client_sync',
    'authority', 'advisory',
    'financialAuthority', false,
    'settlementAuthority', false
  ));

  insert into public.hipico_audit_events(
    owner_id, workspace_id, action, entity_type, entity_id, payload, idempotency_key, source, authority
  ) values (
    v_uid, v_workspace_id, v_action, v_entity_type, v_entity_id, v_payload, v_key, 'client_sync', 'advisory'
  )
  on conflict (owner_id, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  select * into v_existing
  from public.hipico_audit_events audit
  where audit.owner_id = v_uid
    and audit.idempotency_key = v_key
  limit 1;

  if not found then
    raise exception 'HIPICO_AUDIT_IDEMPOTENCY_ROW_MISSING' using errcode = '40001';
  end if;

  if v_existing.workspace_id is distinct from v_workspace_id
     or v_existing.action is distinct from v_action
     or v_existing.entity_type is distinct from v_entity_type
     or v_existing.entity_id is distinct from v_entity_id
     or v_existing.payload is distinct from v_payload
     or v_existing.source is distinct from 'client_sync'
     or v_existing.authority is distinct from 'advisory' then
    raise exception 'HIPICO_AUDIT_REPLAY_MISMATCH' using errcode = '23505';
  end if;

  return v_existing.id;
end;
$$;

-- Authenticated clients may read their own rows through RLS, but all client writes
-- must cross the hardened append RPC. The sequence is not a direct-write capability.
revoke insert, update, delete on table public.hipico_audit_events from authenticated;
grant select on table public.hipico_audit_events to authenticated;
revoke usage, select on sequence public.hipico_audit_events_id_seq from authenticated;

revoke all on function public.hipico_append_audit(uuid, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.hipico_append_audit(uuid, text, text, text, jsonb)
  to authenticated, service_role;

comment on column public.hipico_audit_events.source
  is 'Origin of audit evidence. PWA synchronization is client_sync; historical pre-v26 rows remain legacy.';
comment on column public.hipico_audit_events.authority
  is 'Authority level of evidence. PWA client_sync events are advisory and never financial/settlement authority.';
comment on function public.hipico_append_audit(uuid, text, text, text, jsonb)
  is 'Hardened owner-scoped PWA audit append. SECURITY DEFINER is bounded by role, workspace, exact action/entity catalog, payload limits, server-owned actor/provenance and idempotent replay checks.';
