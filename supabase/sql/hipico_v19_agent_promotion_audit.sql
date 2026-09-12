-- Control Hípico v1.19 — automation promotion audit/idempotency (#288/#290)

alter table public.hipico_agent_evaluations
  drop constraint if exists hipico_agent_evaluations_tool_check;
alter table public.hipico_agent_evaluations
  add constraint hipico_agent_evaluations_tool_check check(tool is null or tool in (
    'queryRaceStatus','queryNextRace','queryLastResult','querySchedule','queryScratches','queryRunners','queryOdds',
    'queryScheduledTime','queryOfficiality','queryMeetingStatus','proposeRaceCommand'
  ));

create table if not exists public.hipico_automation_transitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  group_key text not null check(length(group_key) between 3 and 120),
  group_id text not null check(length(group_id) between 3 and 220),
  request_id text not null check(length(request_id) between 8 and 120),
  input_signature text not null check(input_signature ~ '^[a-f0-9]{64}$'),
  from_mode text not null check(from_mode in ('DISABLED','SHADOW','ASSISTED','AUTOMATIC_LOW_RISK','AUTOMATIC')),
  to_mode text not null check(to_mode in ('DISABLED','SHADOW','ASSISTED','AUTOMATIC_LOW_RISK','AUTOMATIC')),
  operator_id text not null check(length(operator_id) between 1 and 220),
  owner_approved boolean not null default false,
  decision_reason text not null,
  metrics jsonb not null default '{}'::jsonb check(jsonb_typeof(metrics)='object'),
  created_at timestamptz not null default now(),
  foreign key(owner_id,group_key,group_id) references public.hipico_group_automation(owner_id,group_key,group_id) on delete restrict,
  unique(owner_id,group_key,group_id,request_id)
);

create index if not exists hipico_automation_transitions_scope_time_idx
  on public.hipico_automation_transitions(owner_id,group_key,group_id,created_at desc,id desc);

alter table public.hipico_automation_transitions enable row level security;
revoke all on public.hipico_automation_transitions from anon;
revoke all on public.hipico_automation_transitions from authenticated;

drop policy if exists hipico_automation_transitions_select_own on public.hipico_automation_transitions;
create policy hipico_automation_transitions_select_own
  on public.hipico_automation_transitions for select to authenticated
  using(owner_id=(select auth.uid()));

comment on table public.hipico_automation_transitions is
  'Append-only, owner/group scoped promotion/demotion audit with request-id idempotency. Full automatic owner approval is validated outside model output.';
