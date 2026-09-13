-- Control Hípico v1.16 — Agent/Shadow evaluation and promotion gates (#288)
-- Evidence/promotion only. The agent receives no ledger, settlement, shell, SQL
-- execution or direct production-write capability.

create extension if not exists pgcrypto;

create table if not exists public.hipico_group_automation (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  group_key text not null check(length(group_key) between 3 and 120),
  group_id text not null check(length(group_id) between 3 and 220),
  mode text not null default 'DISABLED'
    check(mode in ('DISABLED','SHADOW','ASSISTED','AUTOMATIC_LOW_RISK','AUTOMATIC')),
  updated_by text check(updated_by is null or length(updated_by) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, group_key, group_id)
);

create table if not exists public.hipico_agent_evaluations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  group_key text not null check(length(group_key) between 3 and 120),
  group_id text not null check(length(group_id) between 3 and 220),
  message_hash text not null check(message_hash ~ '^[a-f0-9]{64}$'),
  expected_intent text check(expected_intent is null or length(expected_intent) <= 120),
  predicted_intent text not null check(length(predicted_intent) between 1 and 120),
  actual_intent text check(actual_intent is null or length(actual_intent) between 1 and 120),
  confidence numeric(5,4) not null check(confidence between 0 and 1),
  risk text not null check(risk in ('safe','review','monetary')),
  tool text check(tool is null or tool in (
    'queryRaceStatus','queryNextRace','queryLastResult','querySchedule','queryScratches','proposeRaceCommand'
  )),
  can_act boolean not null default false,
  model_version text check(model_version is null or length(model_version) <= 120),
  matched boolean,
  high_risk_false_positive boolean not null default false,
  unauthorized_action boolean not null default false,
  conflict boolean not null default false,
  evidence jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence) = 'object'),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text check(reviewed_by is null or length(reviewed_by) between 1 and 120),
  foreign key(owner_id, group_key, group_id)
    references public.hipico_group_automation(owner_id, group_key, group_id)
    on delete cascade,
  check((reviewed_at is null and reviewed_by is null and actual_intent is null)
    or (reviewed_at is not null and reviewed_by is not null and actual_intent is not null))
);

create table if not exists public.hipico_automation_transition_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  group_key text not null check(length(group_key) between 3 and 120),
  group_id text not null check(length(group_id) between 3 and 220),
  idempotency_key text not null check(length(idempotency_key) between 8 and 120),
  previous_mode text not null
    check(previous_mode in ('DISABLED','SHADOW','ASSISTED','AUTOMATIC_LOW_RISK','AUTOMATIC')),
  target_mode text not null
    check(target_mode in ('DISABLED','SHADOW','ASSISTED','AUTOMATIC_LOW_RISK','AUTOMATIC')),
  owner_approved boolean not null default false,
  actor_ref text not null check(length(actor_ref) between 1 and 120),
  decision jsonb not null check(jsonb_typeof(decision) = 'object'),
  metrics jsonb not null check(jsonb_typeof(metrics) = 'object'),
  created_at timestamptz not null default now(),
  unique(owner_id, group_key, group_id, idempotency_key),
  foreign key(owner_id, group_key, group_id)
    references public.hipico_group_automation(owner_id, group_key, group_id)
    on delete cascade
);

create index if not exists hipico_agent_eval_metrics_idx
  on public.hipico_agent_evaluations(owner_id, group_key, group_id, reviewed_at, created_at);
create index if not exists hipico_agent_eval_hash_idx
  on public.hipico_agent_evaluations(owner_id, group_key, group_id, message_hash);
create index if not exists hipico_automation_transition_scope_idx
  on public.hipico_automation_transition_events(owner_id, group_key, group_id, created_at desc);

alter table public.hipico_group_automation enable row level security;
alter table public.hipico_agent_evaluations enable row level security;
alter table public.hipico_automation_transition_events enable row level security;

revoke all on public.hipico_group_automation from anon;
revoke all on public.hipico_agent_evaluations from anon;
revoke all on public.hipico_automation_transition_events from anon;
revoke all on public.hipico_group_automation from authenticated;
revoke all on public.hipico_agent_evaluations from authenticated;
revoke all on public.hipico_automation_transition_events from authenticated;

drop policy if exists hipico_group_automation_select_own on public.hipico_group_automation;
create policy hipico_group_automation_select_own
  on public.hipico_group_automation for select to authenticated
  using(owner_id = (select auth.uid()));

drop policy if exists hipico_agent_evaluations_select_own on public.hipico_agent_evaluations;
create policy hipico_agent_evaluations_select_own
  on public.hipico_agent_evaluations for select to authenticated
  using(owner_id = (select auth.uid()));

drop policy if exists hipico_automation_transition_events_select_own on public.hipico_automation_transition_events;
create policy hipico_automation_transition_events_select_own
  on public.hipico_automation_transition_events for select to authenticated
  using(owner_id = (select auth.uid()));

comment on table public.hipico_group_automation is
  'Per-owner/group promotion state. Upward promotion is controlled by server-side measured gates.';
comment on table public.hipico_agent_evaluations is
  'Shadow/promotion evidence only. No direct SQL, shell, admin, settlement or ledger tools are available to the agent.';
comment on table public.hipico_automation_transition_events is
  'Immutable idempotency and audit ledger for accepted automation mode transitions.';
