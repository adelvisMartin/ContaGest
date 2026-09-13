-- Control Hípico v1.15 — canonical meeting/race lifecycle (#287)
-- Additive state/audit tables. No settlement or ledger side effect lives here.

create extension if not exists pgcrypto;

create table if not exists public.hipico_meetings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  group_key text not null check (length(group_key) between 3 and 120),
  name text not null check (length(name) between 1 and 220),
  meeting_date timestamptz,
  venue text,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,owner_id,group_key),
  unique(owner_id,group_key,external_ref)
);
create index if not exists hipico_meetings_scope_date_idx on public.hipico_meetings(owner_id,group_key,meeting_date desc);

create table if not exists public.hipico_races (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  group_key text not null,
  meeting_id uuid not null,
  race_number integer not null check (race_number between 1 and 99),
  name text not null check (length(name) between 1 and 220),
  scheduled_at timestamptz,
  external_ref text,
  state text not null default 'DISCOVERED' check (state in (
    'DISCOVERED','ANNOUNCED','OPEN','CLOSING','CLOSED','RUNNING','PROVISIONAL_RESULT','OFFICIAL_RESULT','ARCHIVED',
    'POSTPONED','CANCELLED','SUSPENDED'
  )),
  result_stage text not null default 'none' check (result_stage in ('none','observed','provisional','verified','official')),
  result_data jsonb not null default '{}'::jsonb check (jsonb_typeof(result_data)='object'),
  state_version bigint not null default 0 check (state_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,owner_id,group_key),
  unique(owner_id,group_key,meeting_id,race_number),
  unique(owner_id,group_key,external_ref),
  foreign key(meeting_id,owner_id,group_key) references public.hipico_meetings(id,owner_id,group_key) on delete restrict,
  check (state <> 'OFFICIAL_RESULT' or result_stage='official')
);
create index if not exists hipico_races_scope_state_idx on public.hipico_races(owner_id,group_key,state,scheduled_at);
create index if not exists hipico_races_meeting_idx on public.hipico_races(owner_id,group_key,meeting_id,race_number);

create table if not exists public.hipico_race_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  group_key text not null,
  race_id uuid not null,
  request_id text not null check (length(request_id) between 8 and 120),
  input_signature text not null check (input_signature ~ '^[a-f0-9]{64}$'),
  command text not null check (command in (
    'DISCOVER','ANNOUNCE','OPEN','BEGIN_CLOSING','CLOSE','START','RECORD_PROVISIONAL_RESULT','MARK_OFFICIAL_RESULT','ARCHIVE',
    'POSTPONE','CANCEL','SUSPEND','RESUME'
  )),
  actor_id text not null check (length(actor_id) between 1 and 220),
  actor_type text not null check (actor_type in ('operator','agent','system')),
  correlation_id text not null check (length(correlation_id) between 8 and 120),
  from_state text not null,
  to_state text not null,
  disposition text not null check (disposition in ('applied','rejected')),
  reason text not null,
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence)='array'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object'),
  created_at timestamptz not null default now(),
  foreign key(race_id,owner_id,group_key) references public.hipico_races(id,owner_id,group_key) on delete restrict,
  unique(owner_id,group_key,race_id,request_id)
);
create index if not exists hipico_race_events_history_idx on public.hipico_race_events(owner_id,group_key,race_id,created_at,id);
create index if not exists hipico_race_events_trace_idx on public.hipico_race_events(owner_id,group_key,correlation_id,created_at);

alter table public.hipico_meetings enable row level security;
alter table public.hipico_races enable row level security;
alter table public.hipico_race_events enable row level security;
revoke all on public.hipico_meetings from anon;
revoke all on public.hipico_races from anon;
revoke all on public.hipico_race_events from anon;
revoke all on public.hipico_meetings from authenticated;
revoke all on public.hipico_races from authenticated;
revoke all on public.hipico_race_events from authenticated;

drop policy if exists hipico_meetings_select_own on public.hipico_meetings;
create policy hipico_meetings_select_own on public.hipico_meetings for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists hipico_races_select_own on public.hipico_races;
create policy hipico_races_select_own on public.hipico_races for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists hipico_race_events_select_own on public.hipico_race_events;
create policy hipico_race_events_select_own on public.hipico_race_events for select to authenticated using(owner_id=(select auth.uid()));

comment on table public.hipico_race_events is 'Append-only command/audit trail. CLOSED is not settlement; result authority is modeled separately.';
