-- Control Hípico v1.16 — agent/shadow evaluation and promotion gates (#288)
-- No agent table has FK/access to ledger or raw SQL capability.

create extension if not exists pgcrypto;

create table if not exists public.hipico_group_automation (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  group_key text not null check(length(group_key) between 3 and 120),
  group_id text not null check(length(group_id) between 3 and 220),
  mode text not null default 'DISABLED' check(mode in ('DISABLED','SHADOW','ASSISTED','AUTOMATIC_LOW_RISK','AUTOMATIC')),
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,group_key,group_id)
);

create table if not exists public.hipico_agent_evaluations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  group_key text not null,
  group_id text not null,
  message_hash text not null check(message_hash ~ '^[a-f0-9]{64}$'),
  expected_intent text,
  predicted_intent text not null,
  actual_intent text,
  confidence numeric(5,4) not null check(confidence between 0 and 1),
  risk text not null check(risk in ('safe','review','monetary')),
  tool text check(tool is null or tool in ('queryRaceStatus','queryNextRace','queryLastResult','querySchedule','queryScratches','proposeRaceCommand')),
  can_act boolean not null default false,
  model_version text,
  matched boolean,
  high_risk_false_positive boolean not null default false,
  unauthorized_action boolean not null default false,
  conflict boolean not null default false,
  evidence jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence)='object'),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  foreign key(owner_id,group_key,group_id) references public.hipico_group_automation(owner_id,group_key,group_id) on delete cascade
);
create index if not exists hipico_agent_eval_metrics_idx on public.hipico_agent_evaluations(owner_id,group_key,group_id,reviewed_at,created_at);
create index if not exists hipico_agent_eval_hash_idx on public.hipico_agent_evaluations(owner_id,group_key,group_id,message_hash);

alter table public.hipico_group_automation enable row level security;
alter table public.hipico_agent_evaluations enable row level security;
revoke all on public.hipico_group_automation from anon;
revoke all on public.hipico_agent_evaluations from anon;
revoke all on public.hipico_group_automation from authenticated;
revoke all on public.hipico_agent_evaluations from authenticated;

drop policy if exists hipico_group_automation_select_own on public.hipico_group_automation;
create policy hipico_group_automation_select_own on public.hipico_group_automation for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists hipico_agent_evaluations_select_own on public.hipico_agent_evaluations;
create policy hipico_agent_evaluations_select_own on public.hipico_agent_evaluations for select to authenticated using(owner_id=(select auth.uid()));

comment on table public.hipico_agent_evaluations is 'Shadow/promotion evidence only. No direct SQL, shell, admin, settlement or ledger tools are available to the agent.';
