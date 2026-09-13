-- Control Hípico v1.14 — immutable PDF/document evidence (#285)
-- Additive only. Raw PDF bytes are server-side evidence and are never exposed through PostgREST grants.

create extension if not exists pgcrypto;

create table if not exists public.hipico_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  group_key text not null check (length(group_key) between 3 and 120),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  page_count_estimate integer not null check (page_count_estimate between 1 and 200),
  filename text not null check (length(filename) between 1 and 180),
  mime text not null default 'application/pdf' check (mime = 'application/pdf'),
  raw_pdf bytea not null,
  classification text not null default 'UNKNOWN' check (classification in (
    'RACE_PROGRAM','ENTRIES','SCRATCHES','ARRIVAL','RESULT','OFFICIAL_RESULT','ANNOUNCEMENT','UNKNOWN'
  )),
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  authority text not null default 'unknown' check (authority in ('official','trusted','operator','group_evidence','unknown')),
  parser_version text,
  status text not null default 'uploaded' check (status in ('uploaded','extracted','review','approved','failed')),
  extraction jsonb not null default '{}'::jsonb check (jsonb_typeof(extraction) = 'object'),
  supersedes_id uuid references public.hipico_documents(id) on delete restrict,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, group_key, sha256),
  unique(id, owner_id, group_key),
  check (supersedes_id is null or supersedes_id <> id),
  check (classification <> 'OFFICIAL_RESULT' or authority = 'official')
);

create index if not exists hipico_documents_owner_group_time_idx
  on public.hipico_documents(owner_id, group_key, created_at desc);
create index if not exists hipico_documents_review_idx
  on public.hipico_documents(owner_id, group_key, status, created_at desc);
create index if not exists hipico_documents_supersedes_idx
  on public.hipico_documents(owner_id, group_key, supersedes_id)
  where supersedes_id is not null;

create table if not exists public.hipico_document_sources (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  owner_id uuid not null,
  group_key text not null,
  source_channel text not null check (length(source_channel) between 1 and 120),
  source_message_id text,
  sender text,
  received_at timestamptz not null,
  authority text not null default 'unknown' check (authority in ('official','trusted','operator','group_evidence','unknown')),
  created_at timestamptz not null default now(),
  foreign key(document_id, owner_id, group_key)
    references public.hipico_documents(id, owner_id, group_key) on delete cascade,
  check (source_message_id is null or length(source_message_id) between 1 and 320),
  check (sender is null or length(sender) between 1 and 220)
);

create unique index if not exists hipico_document_sources_message_unique
  on public.hipico_document_sources(owner_id, group_key, source_channel, source_message_id)
  where source_message_id is not null;
create index if not exists hipico_document_sources_document_idx
  on public.hipico_document_sources(owner_id, group_key, document_id, received_at);

alter table public.hipico_documents enable row level security;
alter table public.hipico_document_sources enable row level security;

-- The backend service account is the write authority. Authenticated users may only
-- read metadata through explicitly exposed application APIs; raw_pdf never receives
-- a direct table grant here.
revoke all on public.hipico_documents from anon;
revoke all on public.hipico_document_sources from anon;
revoke all on public.hipico_documents from authenticated;
revoke all on public.hipico_document_sources from authenticated;

-- RLS remains a defense-in-depth boundary for deployments that deliberately grant
-- authenticated SELECT later. It always scopes evidence to auth.uid().
drop policy if exists hipico_documents_select_own on public.hipico_documents;
create policy hipico_documents_select_own on public.hipico_documents
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists hipico_document_sources_select_own on public.hipico_document_sources;
create policy hipico_document_sources_select_own on public.hipico_document_sources
  for select to authenticated using (owner_id = (select auth.uid()));

comment on table public.hipico_documents is 'Immutable-ish Control Hípico document evidence. Corrections are new revisions via supersedes_id; raw PDF is backend-only.';
comment on column public.hipico_documents.raw_pdf is 'Hostile evidence bytes. Never return via public API and never execute.';
