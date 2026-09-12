-- Hípico Control v1.12 — Operations / WhatsApp / ledger foundation.
-- Additive migration: does not drop or rewrite the legacy hipico_workspaces JSONB state.

create extension if not exists pgcrypto;

create table if not exists public.hipico_bot_channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  group_key text not null,
  label text not null,
  channel_type text not null default 'manual_export' check (channel_type in ('manual_export','android_share','meta_direct','meta_group')),
  status text not null default 'inactive' check (status in ('inactive','active','degraded','blocked')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, group_key)
);

create table if not exists public.hipico_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  channel_id uuid references public.hipico_bot_channels(id) on delete set null,
  channel_key text not null,
  external_message_id text,
  fingerprint text not null,
  sender_id text,
  sender_label text,
  sender_role text not null default 'unknown' check (sender_role in ('unknown','participant','operator','trusted_admin','system')),
  quoted_external_message_id text,
  sent_at timestamptz,
  received_at timestamptz not null default now(),
  message_type text not null default 'text',
  raw_text text not null default '',
  classification text not null default 'unclassified',
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  processing_status text not null default 'pending' check (processing_status in ('pending','processed','review','ignored','failed')),
  normalized jsonb not null default '{}'::jsonb check (jsonb_typeof(normalized) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create unique index if not exists hipico_messages_fingerprint_unique on public.hipico_messages(owner_id, channel_key, fingerprint);
create unique index if not exists hipico_messages_external_unique on public.hipico_messages(owner_id, channel_key, external_message_id) where external_message_id is not null;
create index if not exists hipico_messages_owner_time_idx on public.hipico_messages(owner_id, received_at desc);
create index if not exists hipico_messages_status_idx on public.hipico_messages(owner_id, processing_status, received_at);

create table if not exists public.hipico_operation_events (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, group_key text not null,
  source_message_id uuid references public.hipico_messages(id) on delete set null,
  event_key text not null,
  event_type text not null check (event_type in ('offer','counteroffer','confirmation','race_open','race_close','plan_snapshot','result','settlement_snapshot','balance_snapshot','day_close','late_message','manual_review','other')),
  event_state text not null default 'accepted' check (event_state in ('accepted','pending','duplicate','rejected','reversed')),
  race_key text, participant_code text, product_type text, amount numeric(18,2), currency text,
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(), unique(owner_id, event_key)
);
create index if not exists hipico_operation_events_race_idx on public.hipico_operation_events(owner_id, group_key, race_key, created_at);
create index if not exists hipico_operation_events_review_idx on public.hipico_operation_events(owner_id, event_state, created_at desc);

create table if not exists public.hipico_outbox (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, group_key text not null,
  destination text not null, source_event_id uuid references public.hipico_operation_events(id) on delete set null,
  idempotency_key text not null, reply_type text not null default 'operational',
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued' check (status in ('queued','sending','sent','retry','cancelled','failed')),
  attempts integer not null default 0 check (attempts >= 0), next_attempt_at timestamptz not null default now(),
  external_message_id text, last_error text, created_at timestamptz not null default now(), sent_at timestamptz,
  unique(owner_id, idempotency_key)
);
create index if not exists hipico_outbox_queue_idx on public.hipico_outbox(owner_id, status, next_attempt_at, created_at);

create table if not exists public.hipico_ledger_entries (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, group_key text not null,
  participant_code text not null, product_type text not null, reference_type text not null, reference_id text not null,
  entry_type text not null check (entry_type in ('opening','bet','settlement','commission','adjustment','transfer','reversal','hold','release')),
  amount numeric(18,2) not null, currency text not null default 'VES', effective_at timestamptz not null default now(),
  reversal_of uuid references public.hipico_ledger_entries(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'), created_at timestamptz not null default now()
);
create unique index if not exists hipico_ledger_idempotency_idx on public.hipico_ledger_entries(owner_id, group_key, participant_code, reference_type, reference_id, entry_type) where entry_type <> 'adjustment';
create index if not exists hipico_ledger_participant_time_idx on public.hipico_ledger_entries(owner_id, group_key, participant_code, effective_at desc);
create index if not exists hipico_ledger_product_idx on public.hipico_ledger_entries(owner_id, group_key, product_type, effective_at desc);

create table if not exists public.hipico_reconciliations (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, group_key text not null, race_key text,
  source_message_id uuid references public.hipico_messages(id) on delete set null,
  kind text not null check (kind in ('settlement','balances','daily_close')),
  status text not null default 'pending' check (status in ('pending','matched','difference','resolved')),
  expected jsonb not null default '{}'::jsonb, observed jsonb not null default '{}'::jsonb,
  differences jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), resolved_at timestamptz
);
create index if not exists hipico_reconciliations_status_idx on public.hipico_reconciliations(owner_id, status, created_at desc);

alter table public.hipico_bot_channels enable row level security;
alter table public.hipico_messages enable row level security;
alter table public.hipico_operation_events enable row level security;
alter table public.hipico_outbox enable row level security;
alter table public.hipico_ledger_entries enable row level security;
alter table public.hipico_reconciliations enable row level security;

drop policy if exists hipico_bot_channels_select_own on public.hipico_bot_channels;
drop policy if exists hipico_bot_channels_insert_own on public.hipico_bot_channels;
drop policy if exists hipico_bot_channels_update_own on public.hipico_bot_channels;
drop policy if exists hipico_bot_channels_delete_own on public.hipico_bot_channels;
create policy hipico_bot_channels_select_own on public.hipico_bot_channels for select to authenticated using (owner_id = (select auth.uid()));
create policy hipico_bot_channels_insert_own on public.hipico_bot_channels for insert to authenticated with check (owner_id = (select auth.uid()));
create policy hipico_bot_channels_update_own on public.hipico_bot_channels for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy hipico_bot_channels_delete_own on public.hipico_bot_channels for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists hipico_messages_select_own on public.hipico_messages;
drop policy if exists hipico_messages_insert_own on public.hipico_messages;
drop policy if exists hipico_messages_update_own on public.hipico_messages;
create policy hipico_messages_select_own on public.hipico_messages for select to authenticated using (owner_id = (select auth.uid()));
create policy hipico_messages_insert_own on public.hipico_messages for insert to authenticated with check (owner_id = (select auth.uid()));
create policy hipico_messages_update_own on public.hipico_messages for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists hipico_operation_events_select_own on public.hipico_operation_events;
drop policy if exists hipico_operation_events_insert_own on public.hipico_operation_events;
drop policy if exists hipico_operation_events_update_own on public.hipico_operation_events;
create policy hipico_operation_events_select_own on public.hipico_operation_events for select to authenticated using (owner_id = (select auth.uid()));
create policy hipico_operation_events_insert_own on public.hipico_operation_events for insert to authenticated with check (owner_id = (select auth.uid()));
create policy hipico_operation_events_update_own on public.hipico_operation_events for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists hipico_outbox_select_own on public.hipico_outbox;
drop policy if exists hipico_outbox_insert_own on public.hipico_outbox;
drop policy if exists hipico_outbox_update_own on public.hipico_outbox;
create policy hipico_outbox_select_own on public.hipico_outbox for select to authenticated using (owner_id = (select auth.uid()));
create policy hipico_outbox_insert_own on public.hipico_outbox for insert to authenticated with check (owner_id = (select auth.uid()));
create policy hipico_outbox_update_own on public.hipico_outbox for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists hipico_ledger_entries_select_own on public.hipico_ledger_entries;
drop policy if exists hipico_ledger_entries_insert_own on public.hipico_ledger_entries;
create policy hipico_ledger_entries_select_own on public.hipico_ledger_entries for select to authenticated using (owner_id = (select auth.uid()));
create policy hipico_ledger_entries_insert_own on public.hipico_ledger_entries for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists hipico_reconciliations_select_own on public.hipico_reconciliations;
drop policy if exists hipico_reconciliations_insert_own on public.hipico_reconciliations;
drop policy if exists hipico_reconciliations_update_own on public.hipico_reconciliations;
create policy hipico_reconciliations_select_own on public.hipico_reconciliations for select to authenticated using (owner_id = (select auth.uid()));
create policy hipico_reconciliations_insert_own on public.hipico_reconciliations for insert to authenticated with check (owner_id = (select auth.uid()));
create policy hipico_reconciliations_update_own on public.hipico_reconciliations for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Legacy installs already have hipico_workspaces at this point; fresh isolated Hípico
-- installs may not. Keep the optional legacy seed without making the migration
-- depend on a table that is created later by hipico_v13_workspace_sync_security.sql.
do $$
begin
  if to_regclass('public.hipico_workspaces') is not null then
    insert into public.hipico_bot_channels(owner_id, group_key, label, channel_type, status, config)
    select owner_id, 'triple-cown', 'CLUB HIPICO TRIPLE COWN', 'manual_export', 'active', jsonb_build_object('mode','offline_first','auto_send',false)
    from public.hipico_workspaces order by updated_at desc limit 1
    on conflict(owner_id, group_key) do nothing;
  end if;
end $$;
