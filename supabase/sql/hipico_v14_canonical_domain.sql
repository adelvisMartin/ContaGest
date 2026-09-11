-- Hípico Control v1.14 — canonical domain persistence.
-- Additive/replay-safe schema for the backend canonical domain reducer.
-- The state machine remains in TypeScript (hipico-domain-state.ts); SQL provides
-- durable isolation, idempotency and audit storage without duplicating business rules.

create table if not exists public.hipico_domain_aggregates (
  owner_id uuid not null,
  group_key text not null check (length(btrim(group_key)) between 1 and 120),
  aggregate_kind text not null check (aggregate_kind in ('race','day')),
  aggregate_key text not null check (length(btrim(aggregate_key)) between 1 and 180),
  status text not null default 'PREPARING' check (status in (
    'PREPARING','OPEN','CLOSED','RESULT_RECEIVED','SETTLEMENT_READY','SETTLED','BALANCED','PUBLISHED','ARCHIVED','CLOSING'
  )),
  state_version bigint not null default 0 check (state_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, group_key, aggregate_kind, aggregate_key)
);

create table if not exists public.hipico_domain_events (
  id text primary key check (length(btrim(id)) between 1 and 180),
  owner_id uuid not null,
  group_key text not null check (length(btrim(group_key)) between 1 and 120),
  aggregate_kind text not null check (aggregate_kind in ('race','day')),
  aggregate_key text not null check (length(btrim(aggregate_key)) between 1 and 180),
  source_message_id text,
  source_message_key text not null check (length(btrim(source_message_key)) between 1 and 320),
  event_type text not null check (event_type in (
    'PLAN_RECORDED','RACE_OPENED','BET_RECORDED','RACE_CLOSED','RESULT_RECORDED',
    'SETTLEMENT_READY','SETTLEMENT_RECORDED','BALANCE_CONFIRMED','RACE_PUBLISHED','RACE_ARCHIVED',
    'DAY_OPENED','DAY_CLOSING','DAY_CLOSED','DAY_ARCHIVED','CORRECTION','REVERSAL','AMBIGUOUS','UNKNOWN'
  )),
  disposition text not null check (disposition in ('applied','evidence_only','review','rejected')),
  previous_state text not null,
  next_state text not null,
  reason text not null,
  original_event_id text references public.hipico_domain_events(id) on delete restrict,
  raw_message text,
  normalized_payload jsonb,
  actor_ref text,
  source text not null default 'system',
  parser_version text,
  schema_version integer not null default 1 check (schema_version >= 1),
  event_timestamp timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint hipico_domain_events_aggregate_fk
    foreign key (owner_id, group_key, aggregate_kind, aggregate_key)
    references public.hipico_domain_aggregates(owner_id, group_key, aggregate_kind, aggregate_key)
    on delete restrict,
  constraint hipico_domain_events_source_identity_unique
    unique (owner_id, group_key, aggregate_kind, aggregate_key, source_message_key)
);

create index if not exists hipico_domain_events_aggregate_time_idx
  on public.hipico_domain_events(owner_id, group_key, aggregate_kind, aggregate_key, event_timestamp desc, id desc);
create index if not exists hipico_domain_events_original_idx
  on public.hipico_domain_events(owner_id, group_key, aggregate_kind, aggregate_key, original_event_id)
  where original_event_id is not null;
create index if not exists hipico_domain_events_type_idx
  on public.hipico_domain_events(owner_id, group_key, event_type, event_timestamp desc);

alter table public.hipico_domain_aggregates enable row level security;
alter table public.hipico_domain_events enable row level security;

-- Browser/Supabase sessions may inspect only their own tenant rows. Canonical
-- mutations themselves are backend/operator-token controlled and do not rely on
-- direct browser grants to these tables.
drop policy if exists hipico_domain_aggregates_select_own on public.hipico_domain_aggregates;
create policy hipico_domain_aggregates_select_own
  on public.hipico_domain_aggregates for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists hipico_domain_events_select_own on public.hipico_domain_events;
create policy hipico_domain_events_select_own
  on public.hipico_domain_events for select to authenticated
  using (owner_id = (select auth.uid()));

revoke insert, update, delete on public.hipico_domain_aggregates from anon, authenticated;
revoke insert, update, delete on public.hipico_domain_events from anon, authenticated;
