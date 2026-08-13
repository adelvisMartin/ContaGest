-- Hípico Control v1.12 — Shadow validation.
-- Stores what the automation would have done beside what trusted operators actually did.
-- Additive only; no legacy tables are removed or rewritten.

create table if not exists public.hipico_shadow_evaluations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  source_group_key text not null,
  lab_group_key text,
  source_message_id uuid references public.hipico_messages(id) on delete set null,
  source_external_message_id text,
  scenario_key text,
  prediction_type text not null default 'none',
  predicted_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(predicted_payload) = 'object'),
  predicted_at timestamptz not null default now(),
  observed_message_id uuid references public.hipico_messages(id) on delete set null,
  observed_external_message_id text,
  observed_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(observed_payload) = 'object'),
  observed_at timestamptz,
  match_status text not null default 'pending' check (match_status in ('pending','matched','equivalent','different','unsafe','not_applicable')),
  timing_delta_ms bigint,
  notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(owner_id, source_group_key, source_external_message_id, prediction_type)
);

create index if not exists hipico_shadow_eval_status_idx
  on public.hipico_shadow_evaluations(owner_id, match_status, created_at desc);
create index if not exists hipico_shadow_eval_scenario_idx
  on public.hipico_shadow_evaluations(owner_id, scenario_key, created_at desc);

alter table public.hipico_shadow_evaluations enable row level security;

drop policy if exists hipico_shadow_eval_select_own on public.hipico_shadow_evaluations;
drop policy if exists hipico_shadow_eval_insert_own on public.hipico_shadow_evaluations;
drop policy if exists hipico_shadow_eval_update_own on public.hipico_shadow_evaluations;
create policy hipico_shadow_eval_select_own on public.hipico_shadow_evaluations
  for select to authenticated using (owner_id = (select auth.uid()));
create policy hipico_shadow_eval_insert_own on public.hipico_shadow_evaluations
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy hipico_shadow_eval_update_own on public.hipico_shadow_evaluations
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
