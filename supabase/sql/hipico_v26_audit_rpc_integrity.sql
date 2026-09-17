-- Control Hípico v26 — audit RPC integrity hardening (#361).
-- Additive/replay-safe. Preserves the public RPC signature while making all
-- client-synchronized audit semantics advisory and server-owned.

alter table public.hipico_audit_events
  add column if not exists idempotency_key text,
  add column if not exists source text,
  add column if not exists authority text;

-- Preserve historical evidence without pretending its origin/authority was known.
update public.hipico_audit_events
set source = 'legacy'
where source is null;

update public.hipico_audit_events
set authority = 'legacy'
where authority is null;

alter table public.hipico_audit_events
  alter column source set default 'server',
  alter column source set not null,
  alter column authority set default 'system',
  alter column authority set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.hipico_audit_events'::regclass
      and conname='hipico_audit_events_source_check'
  ) then
    alter table public.hipico_audit_events
      add constraint hipico_audit_events_source_check
      check (source in ('legacy','client_sync','server'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.hipico_audit_events'::regclass
      and conname='hipico_audit_events_authority_check'
  ) then
    alter table public.hipico_audit_events
      add constraint hipico_audit_events_authority_check
      check (authority in ('legacy','advisory','system'));
  end if;
end
$$;

-- Backfill only one canonical historical row per owner/event id. Never delete
-- historical duplicates; conflicting history remains evidence.
with ranked as (
  select
    id,
    nullif(trim(payload ->> 'id'),'') as candidate,
    row_number() over (
      partition by owner_id, nullif(trim(payload ->> 'id'),'')
      order by id
    ) as ordinal
  from public.hipico_audit_events
  where idempotency_key is null
    and nullif(trim(payload ->> 'id'),'') is not null
)
update public.hipico_audit_events audit
set idempotency_key=ranked.candidate
from ranked
where audit.id=ranked.id
  and ranked.ordinal=1
  and audit.idempotency_key is null;

create unique index if not exists hipico_audit_owner_idempotency_unique
  on public.hipico_audit_events(owner_id,idempotency_key)
  where idempotency_key is not null;

create or replace function public.hipico_audit_idempotency_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text := coalesce(
    nullif(trim(new.idempotency_key),''),
    nullif(trim(coalesce(new.payload ->> 'id','')),'')
  );
  v_existing public.hipico_audit_events;
begin
  new.idempotency_key:=v_key;
  if v_key is null then
    return new;
  end if;

  select * into v_existing
  from public.hipico_audit_events
  where owner_id=new.owner_id and idempotency_key=v_key
  limit 1;

  if not found then
    return new;
  end if;

  if v_existing.workspace_id is distinct from new.workspace_id
     or v_existing.action is distinct from new.action
     or v_existing.entity_type is distinct from new.entity_type
     or v_existing.entity_id is distinct from new.entity_id
     or v_existing.payload is distinct from new.payload
     or v_existing.source is distinct from new.source
     or v_existing.authority is distinct from new.authority then
    raise exception 'HIPICO_AUDIT_REPLAY_MISMATCH' using errcode='23505';
  end if;

  return null;
end;
$$;

drop trigger if exists hipico_audit_idempotency_guard on public.hipico_audit_events;
create trigger hipico_audit_idempotency_guard
before insert on public.hipico_audit_events
for each row execute function public.hipico_audit_idempotency_guard();

-- Recursive sanitizer: client data cannot retain authority-looking keys at any
-- depth. This helper is not exposed through the Data API.
create or replace function public.hipico_audit_strip_reserved(p_value jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select case jsonb_typeof(p_value)
    when 'object' then coalesce((
      select jsonb_object_agg(e.key, public.hipico_audit_strip_reserved(e.value))
      from jsonb_each(p_value) as e(key,value)
      where e.key <> all(array[
        'actorUserId','actorRole','source','authority','financialAuthority',
        'settlementAuthority','workspaceOwnerId','ownerId'
      ])
    ), '{}'::jsonb)
    when 'array' then coalesce((
      select jsonb_agg(public.hipico_audit_strip_reserved(a.value) order by a.ordinality)
      from jsonb_array_elements(p_value) with ordinality as a(value,ordinality)
    ), '[]'::jsonb)
    else p_value
  end
$$;

revoke all on function public.hipico_audit_strip_reserved(jsonb) from public, anon, authenticated;

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
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_role text;
  v_id bigint;
  v_action text := nullif(trim(p_action),'');
  v_entity_type text := nullif(trim(p_entity_type),'');
  v_entity_id text := nullif(trim(p_entity_id),'');
  v_expected_entity text;
  v_raw_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_payload jsonb;
  v_key text;
  v_existing public.hipico_audit_events;
begin
  if v_uid is null then
    raise exception 'HIPICO_AUTH_REQUIRED' using errcode='42501';
  end if;

  select hu.workspace_owner_id,hu.role
    into v_owner,v_role
  from public.hipico_users hu
  where hu.user_id=v_uid
    and hu.status='active'
  limit 1;

  if v_owner is null or v_role is null then
    raise exception 'HIPICO_ACCESS_REQUIRED' using errcode='42501';
  end if;
  if v_role not in ('admin','operator') then
    raise exception 'HIPICO_AUDIT_ROLE_FORBIDDEN' using errcode='42501';
  end if;

  if v_action is null or length(v_action)>80 then
    raise exception 'HIPICO_AUDIT_ACTION_INVALID' using errcode='22023';
  end if;
  if v_entity_type is null or length(v_entity_type)>80 then
    raise exception 'HIPICO_AUDIT_ENTITY_INVALID' using errcode='22023';
  end if;
  if v_entity_id is not null and length(v_entity_id)>180 then
    raise exception 'HIPICO_AUDIT_ENTITY_ID_INVALID' using errcode='22023';
  end if;
  if jsonb_typeof(v_raw_payload) <> 'object' then
    raise exception 'HIPICO_AUDIT_PAYLOAD_INVALID' using errcode='22023';
  end if;
  if pg_column_size(v_raw_payload) > 16384 then
    raise exception 'HIPICO_AUDIT_PAYLOAD_TOO_LARGE' using errcode='22023';
  end if;

  v_key:=nullif(trim(coalesce(v_raw_payload ->> 'id','')),'');
  if v_key is null then
    raise exception 'HIPICO_AUDIT_EVENT_ID_REQUIRED' using errcode='22023';
  end if;
  if length(v_key)>180 then
    raise exception 'HIPICO_AUDIT_EVENT_ID_INVALID' using errcode='22023';
  end if;

  v_expected_entity:=case v_action
    when 'race_locked' then 'race'
    when 'race_unlocked' then 'race'
    when 'bet_duplicated' then 'bet'
    when 'bet_cancelled' then 'bet'
    when 'settlement_reopened' then 'race'
    when 'race_closed' then 'race'
    when 'advanced_group_cleared' then 'advanced'
    when 'advanced_deleted' then 'advanced'
    when 'race_created' then 'race'
    when 'participant_updated' then 'participant'
    when 'participant_created' then 'participant'
    when 'board_updated' then 'race'
    when 'advanced_created' then 'advanced'
    when 'advanced_imported' then 'advanced'
    when 'movement_posted' then 'movement'
    when 'settings_updated' then 'workspace'
    when 'group_created' then 'group'
    when 'rate_added' then 'rate'
    when 'polla_created' then 'polla'
    when 'polla_entry_added' then 'polla'
    when 'polla_updated' then 'polla'
    when 'whatsapp_imported' then 'race'
    when 'board_from_whatsapp' then 'race'
    when 'bet_created_multi' then 'bet'
    when 'race_settled' then 'race'
    when 'advanced_loaded' then 'race'
    when 'day_closed' then 'day'
    when 'week_closed' then 'week'
    else null
  end;

  if v_expected_entity is null then
    raise exception 'HIPICO_AUDIT_ACTION_INVALID' using errcode='22023';
  end if;
  if v_entity_type is distinct from v_expected_entity then
    raise exception 'HIPICO_AUDIT_ENTITY_MISMATCH' using errcode='22023';
  end if;

  if p_workspace_id is not null and not exists (
    select 1
    from public.hipico_workspaces w
    where w.id=p_workspace_id
      and w.owner_id=v_owner
  ) then
    raise exception 'HIPICO_WORKSPACE_FORBIDDEN' using errcode='42501';
  end if;

  v_payload:=public.hipico_audit_strip_reserved(v_raw_payload)
    - 'action' - 'entityType' - 'entityId'
    || jsonb_build_object(
      'id',v_key,
      'action',v_action,
      'entityType',v_entity_type,
      'entityId',v_entity_id,
      'actorUserId',v_uid::text,
      'actorRole',v_role,
      'source','client_sync',
      'authority','advisory',
      'financialAuthority',false,
      'settlementAuthority',false
    );

  insert into public.hipico_audit_events(
    owner_id,workspace_id,action,entity_type,entity_id,payload,idempotency_key,source,authority
  ) values (
    v_owner,p_workspace_id,v_action,v_entity_type,v_entity_id,v_payload,v_key,'client_sync','advisory'
  )
  on conflict (owner_id,idempotency_key)
    where idempotency_key is not null
  do nothing
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  select * into v_existing
  from public.hipico_audit_events
  where owner_id=v_owner
    and idempotency_key=v_key
  limit 1;

  if not found then
    raise exception 'HIPICO_AUDIT_IDEMPOTENCY_ROW_MISSING' using errcode='40001';
  end if;

  if v_existing.workspace_id is distinct from p_workspace_id
     or v_existing.action is distinct from v_action
     or v_existing.entity_type is distinct from v_entity_type
     or v_existing.entity_id is distinct from v_entity_id
     or v_existing.payload is distinct from v_payload
     or v_existing.source is distinct from 'client_sync'
     or v_existing.authority is distinct from 'advisory' then
    raise exception 'HIPICO_AUDIT_REPLAY_MISMATCH' using errcode='23505';
  end if;

  return v_existing.id;
end;
$$;

-- SECURITY DEFINER functions are executable by PUBLIC by default in PostgreSQL.
-- Make the public RPC explicit: authenticated clients and server service role only.
revoke all on function public.hipico_append_audit(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.hipico_append_audit(uuid, text, text, text, jsonb) to authenticated, service_role;

-- The table itself is not a client mutation API. LAB fallback is environment-only
-- and must not become a production bypass around the hardened RPC.
revoke insert, update, delete on table public.hipico_audit_events from anon, authenticated;

comment on column public.hipico_audit_events.source
  is 'Origin of audit evidence. client_sync rows are produced by the hardened PWA append RPC; legacy preserves pre-v26 history.';
comment on column public.hipico_audit_events.authority
  is 'Audit-evidence authority only. client_sync is advisory and never grants financial or settlement authority.';
comment on function public.hipico_append_audit(uuid, text, text, text, jsonb)
  is 'Owner-scoped, role-gated, catalog-bound client audit append. Server owns actor/provenance; client_sync evidence is advisory.';
comment on function public.hipico_audit_strip_reserved(jsonb)
  is 'Internal recursive sanitizer for client audit payloads. Execution is revoked from public client roles.';
