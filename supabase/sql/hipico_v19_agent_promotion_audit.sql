-- Control Hípico — immutable automation transition audit/idempotency (#288/#305)
create table if not exists public.hipico_automation_transitions (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null,
  group_key text not null check(length(group_key) between 3 and 120), group_id text not null check(length(group_id) between 3 and 220),
  request_id text not null check(length(request_id) between 8 and 120), input_signature text not null check(input_signature ~ '^[a-f0-9]{64}$'),
  from_mode text not null check(from_mode in ('DISABLED','SHADOW','ASSISTED','AUTOMATIC_LOW_RISK','AUTOMATIC')),
  to_mode text not null check(to_mode in ('DISABLED','SHADOW','ASSISTED','AUTOMATIC_LOW_RISK','AUTOMATIC')),
  operator_ref text not null check(length(operator_ref) between 1 and 220), owner_approved boolean not null default false,
  decision_allowed boolean not null, decision_reason text not null check(length(decision_reason) between 1 and 120), reason text not null check(length(reason) between 5 and 500),
  metrics jsonb not null default '{}'::jsonb check(jsonb_typeof(metrics)='object'), created_at timestamptz not null default now(),
  foreign key(owner_id,group_key,group_id) references public.hipico_group_automation(owner_id,group_key,group_id) on delete restrict,
  unique(owner_id,group_key,group_id,request_id)
);
create index if not exists hipico_automation_transitions_scope_time_idx on public.hipico_automation_transitions(owner_id,group_key,group_id,created_at desc,id desc);
create or replace function public.hipico_automation_transitions_immutable_guard() returns trigger language plpgsql set search_path = public, pg_temp as $$ begin raise exception 'HIPICO_AUTOMATION_TRANSITIONS_APPEND_ONLY'; end; $$;
drop trigger if exists hipico_automation_transitions_immutable_guard on public.hipico_automation_transitions;
create trigger hipico_automation_transitions_immutable_guard before update or delete on public.hipico_automation_transitions for each row execute function public.hipico_automation_transitions_immutable_guard();
alter table public.hipico_automation_transitions enable row level security;
revoke all on public.hipico_automation_transitions from anon;
revoke insert,update,delete on public.hipico_automation_transitions from authenticated;
grant select on public.hipico_automation_transitions to authenticated;
drop policy if exists hipico_automation_transitions_select_own on public.hipico_automation_transitions;
create policy hipico_automation_transitions_select_own on public.hipico_automation_transitions for select to authenticated using(owner_id=(select auth.uid()));
comment on table public.hipico_automation_transitions is 'Append-only owner/group scoped transition audit. Full AUTOMATIC approval is validated with a distinct owner credential outside model output.';
