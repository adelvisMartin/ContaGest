-- Control Hípico v18 — hostile PDF/document evidence with provenance (#285/#290)
-- Additive/replay-safe. Raw PDF identity and provenance are backend-only and
-- immutable; corrections create revisions instead of rewriting source evidence.

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
  parser_version text check (parser_version is null or length(parser_version) <= 120),
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
  check (classification <> 'OFFICIAL_RESULT' or authority = 'official'),
  check ((approved_at is null and approved_by is null)
    or (approved_at is not null and length(btrim(coalesce(approved_by,''))) between 3 and 220))
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
  group_key text not null check (length(group_key) between 3 and 120),
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

-- Append-only event history used by PostgresDocumentStore for extraction/review
-- provenance. It intentionally excludes raw PDF bytes.
create table if not exists public.hipico_document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  owner_id uuid not null,
  group_key text not null check (length(group_key) between 3 and 120),
  event_type text not null check (event_type in ('UPLOADED','EXTRACTION','APPROVED')),
  classification text not null check (classification in (
    'RACE_PROGRAM','ENTRIES','SCRATCHES','ARRIVAL','RESULT','OFFICIAL_RESULT','ANNOUNCEMENT','UNKNOWN'
  )),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  parser_version text check (parser_version is null or length(parser_version) <= 120),
  status text not null check (status in ('uploaded','extracted','review','approved','failed')),
  extraction jsonb not null default '{}'::jsonb check (jsonb_typeof(extraction) = 'object'),
  actor_id text check (actor_id is null or length(btrim(actor_id)) between 1 and 220),
  created_at timestamptz not null default now(),
  foreign key(document_id, owner_id, group_key)
    references public.hipico_documents(id, owner_id, group_key) on delete cascade
);

create index if not exists hipico_document_events_document_time_idx
  on public.hipico_document_events(owner_id, group_key, document_id, created_at, id);

create or replace function public.hipico_documents_guard_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
    or new.owner_id is distinct from old.owner_id
    or new.group_key is distinct from old.group_key
    or new.sha256 is distinct from old.sha256
    or new.size_bytes is distinct from old.size_bytes
    or new.page_count_estimate is distinct from old.page_count_estimate
    or new.filename is distinct from old.filename
    or new.mime is distinct from old.mime
    or new.raw_pdf is distinct from old.raw_pdf
    or new.authority is distinct from old.authority
    or new.supersedes_id is distinct from old.supersedes_id
    or new.created_at is distinct from old.created_at then
    raise exception 'HIPICO_DOCUMENT_IMMUTABLE_EVIDENCE';
  end if;
  return new;
end;
$$;

drop trigger if exists hipico_documents_immutable_evidence on public.hipico_documents;
create trigger hipico_documents_immutable_evidence
before update on public.hipico_documents
for each row execute function public.hipico_documents_guard_immutable();

create or replace function public.hipico_document_sources_guard_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'HIPICO_DOCUMENT_SOURCE_IMMUTABLE';
end;
$$;

drop trigger if exists hipico_document_sources_immutable on public.hipico_document_sources;
create trigger hipico_document_sources_immutable
before update or delete on public.hipico_document_sources
for each row execute function public.hipico_document_sources_guard_immutable();

create or replace function public.hipico_document_events_guard_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'HIPICO_DOCUMENT_EVENT_IMMUTABLE';
end;
$$;

drop trigger if exists hipico_document_events_immutable on public.hipico_document_events;
create trigger hipico_document_events_immutable
before update or delete on public.hipico_document_events
for each row execute function public.hipico_document_events_guard_immutable();

alter table public.hipico_documents enable row level security;
alter table public.hipico_document_sources enable row level security;
alter table public.hipico_document_events enable row level security;

revoke all on public.hipico_documents from anon;
revoke all on public.hipico_document_sources from anon;
revoke all on public.hipico_document_events from anon;
revoke all on public.hipico_documents from authenticated;
revoke all on public.hipico_document_sources from authenticated;
revoke all on public.hipico_document_events from authenticated;

drop policy if exists hipico_documents_select_own on public.hipico_documents;
create policy hipico_documents_select_own on public.hipico_documents
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists hipico_document_sources_select_own on public.hipico_document_sources;
create policy hipico_document_sources_select_own on public.hipico_document_sources
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists hipico_document_events_select_own on public.hipico_document_events;
create policy hipico_document_events_select_own on public.hipico_document_events
  for select to authenticated using (owner_id = (select auth.uid()));

comment on table public.hipico_documents is
  'Control Hípico hostile-document evidence. Raw PDF identity/provenance is immutable; corrections are new revisions via supersedes_id.';
comment on column public.hipico_documents.raw_pdf is
  'Hostile evidence bytes. Backend-only; never execute or return through public read models.';
comment on column public.hipico_documents.authority is
  'Authority comes from configured provenance, never from document wording.';
comment on table public.hipico_document_events is
  'Append-only derived-state audit trail for document extraction/review; contains no raw PDF bytes.';
