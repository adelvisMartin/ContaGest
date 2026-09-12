-- Control Hípico v1.17 — normalized provider evidence (#286/#290)
-- Stores normalized, scoped observations only. Raw vendor payloads and credentials are intentionally excluded.

create extension if not exists pgcrypto;

create table if not exists public.hipico_provider_evidence (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  group_key text not null check (length(group_key) between 3 and 120),
  provider_id text not null check (provider_id ~ '^[a-z0-9][a-z0-9._-]{1,63}$'),
  capability text not null check (capability in ('listMeetings','getMeeting','getRace','getEntries','getScratches','getResult')),
  external_id text not null default '' check (length(external_id) <= 220),
  source text not null check (length(source) between 1 and 500),
  source_provider text not null check (length(source_provider) between 1 and 120),
  source_timestamp timestamptz,
  fetched_at timestamptz not null,
  freshness text not null check (freshness in ('LIVE','FRESH','STALE','OFFLINE')),
  officiality text not null check (officiality in ('official','verified','provisional','observed','unofficial')),
  authority text not null default 'external_provider' check (authority='external_provider'),
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  financial_authority boolean not null default false check (financial_authority=false),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  normalized jsonb not null check (jsonb_typeof(normalized) in ('object','array')),
  provenance jsonb not null check (jsonb_typeof(provenance)='object'),
  created_at timestamptz not null default now(),
  unique(owner_id,group_key,provider_id,capability,external_id,payload_hash,fetched_at)
);

create index if not exists hipico_provider_evidence_scope_time_idx
  on public.hipico_provider_evidence(owner_id,group_key,created_at desc,id desc);
create index if not exists hipico_provider_evidence_lookup_idx
  on public.hipico_provider_evidence(owner_id,group_key,provider_id,external_id,fetched_at desc);

alter table public.hipico_provider_evidence enable row level security;
revoke all on public.hipico_provider_evidence from anon;
revoke all on public.hipico_provider_evidence from authenticated;

drop policy if exists hipico_provider_evidence_select_own on public.hipico_provider_evidence;
create policy hipico_provider_evidence_select_own
  on public.hipico_provider_evidence for select to authenticated
  using(owner_id=(select auth.uid()));

comment on table public.hipico_provider_evidence is
  'Scoped normalized racing-provider observations. Raw vendor payloads are not persisted and financial_authority is permanently false.';
