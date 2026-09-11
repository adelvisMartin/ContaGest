-- Control Hípico v1.13 — durable audit idempotency.
-- Additive/replay-safe hardening for the ACK -> local-outbox-delete window.
-- Historical duplicate rows are preserved; at most one canonical row per existing
-- payload.id is bound to the new idempotency key so the migration never deletes data.

alter table public.hipico_audit_events
  add column if not exists idempotency_key text;

with ranked as (
  select
    id,
    nullif(trim(payload ->> 'id'), '') as candidate,
    row_number() over (
      partition by owner_id, nullif(trim(payload ->> 'id'), '')
      order by id
    ) as ordinal
  from public.hipico_audit_events
  where nullif(trim(payload ->> 'id'), '') is not null
)
update public.hipico_audit_events audit
set idempotency_key = ranked.candidate
from ranked
where audit.id = ranked.id
  and ranked.ordinal = 1
  and audit.idempotency_key is null;

create unique index if not exists hipico_audit_owner_idempotency_unique
  on public.hipico_audit_events(owner_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.hipico_append_audit(
  p_workspace_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_key text := nullif(trim(coalesce(p_payload ->> 'id', '')), '');
  v_action text := coalesce(nullif(trim(p_action), ''), 'unknown');
  v_entity_type text := coalesce(nullif(trim(p_entity_type), ''), 'unknown');
  v_entity_id text := nullif(trim(p_entity_id), '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_existing public.hipico_audit_events;
begin
  if v_uid is null then
    raise exception 'HIPICO_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_workspace_id is not null and not exists (
    select 1 from public.hipico_workspaces
    where id = p_workspace_id and owner_id = v_uid
  ) then
    raise exception 'HIPICO_WORKSPACE_FORBIDDEN' using errcode = '42501';
  end if;

  if v_key is null then
    insert into public.hipico_audit_events(
      owner_id, workspace_id, action, entity_type, entity_id, payload, idempotency_key
    ) values (
      v_uid, p_workspace_id, v_action, v_entity_type, v_entity_id, v_payload, null
    ) returning id into v_id;
    return v_id;
  end if;

  insert into public.hipico_audit_events(
    owner_id, workspace_id, action, entity_type, entity_id, payload, idempotency_key
  ) values (
    v_uid, p_workspace_id, v_action, v_entity_type, v_entity_id, v_payload, v_key
  )
  on conflict (owner_id, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  select * into v_existing
  from public.hipico_audit_events
  where owner_id = v_uid and idempotency_key = v_key
  limit 1;

  if not found then
    raise exception 'HIPICO_AUDIT_IDEMPOTENCY_ROW_MISSING' using errcode = '40001';
  end if;

  if v_existing.workspace_id is distinct from p_workspace_id
     or v_existing.action is distinct from v_action
     or v_existing.entity_type is distinct from v_entity_type
     or v_existing.entity_id is distinct from v_entity_id
     or v_existing.payload is distinct from v_payload then
    raise exception 'HIPICO_AUDIT_REPLAY_MISMATCH' using errcode = '23505';
  end if;

  return v_existing.id;
end;
$$;

revoke all on function public.hipico_append_audit(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.hipico_append_audit(uuid, text, text, text, jsonb) to authenticated;

comment on index public.hipico_audit_owner_idempotency_unique
  is 'Deduplicates durable Control Hípico audit delivery by owner + stable local event id.';
comment on function public.hipico_append_audit(uuid, text, text, text, jsonb)
  is 'Owner-scoped idempotent audit append. Same event id + same payload returns the original row; mismatched replay fails closed.';
