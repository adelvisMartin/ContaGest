-- Control Hípico v1.20 — immutable document evidence and processing audit (#285)

create table if not exists public.hipico_document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  owner_id uuid not null,
  group_key text not null,
  event_type text not null check (event_type in ('UPLOADED','EXTRACTION','APPROVED')),
  classification text not null check (classification in ('RACE_PROGRAM','ENTRIES','SCRATCHES','ARRIVAL','RESULT','OFFICIAL_RESULT','ANNOUNCEMENT','UNKNOWN')),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  parser_version text,
  status text not null,
  extraction jsonb not null default '{}'::jsonb check (jsonb_typeof(extraction)='object'),
  actor_id text,
  created_at timestamptz not null default now(),
  foreign key(document_id,owner_id,group_key) references public.hipico_documents(id,owner_id,group_key) on delete restrict
);
create index if not exists hipico_document_events_history_idx on public.hipico_document_events(owner_id,group_key,document_id,created_at,id);
alter table public.hipico_document_events enable row level security;
revoke all on public.hipico_document_events from anon;
revoke all on public.hipico_document_events from authenticated;
drop policy if exists hipico_document_events_select_own on public.hipico_document_events;
create policy hipico_document_events_select_own on public.hipico_document_events for select to authenticated using(owner_id=(select auth.uid()));

create or replace function public.hipico_guard_document_identity()
returns trigger language plpgsql as $$
begin
  if old.owner_id is distinct from new.owner_id
     or old.group_key is distinct from new.group_key
     or old.sha256 is distinct from new.sha256
     or old.size_bytes is distinct from new.size_bytes
     or old.page_count_estimate is distinct from new.page_count_estimate
     or old.filename is distinct from new.filename
     or old.mime is distinct from new.mime
     or old.raw_pdf is distinct from new.raw_pdf
     or old.authority is distinct from new.authority
     or old.supersedes_id is distinct from new.supersedes_id
     or old.created_at is distinct from new.created_at then
    raise exception 'HIPICO_DOCUMENT_EVIDENCE_IMMUTABLE' using errcode='55000';
  end if;
  return new;
end;
$$;
drop trigger if exists hipico_documents_identity_immutable on public.hipico_documents;
create trigger hipico_documents_identity_immutable before update on public.hipico_documents for each row execute function public.hipico_guard_document_identity();

create or replace function public.hipico_reject_immutable_row_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'HIPICO_EVIDENCE_ROW_IMMUTABLE' using errcode='55000';
end;
$$;
drop trigger if exists hipico_document_sources_immutable on public.hipico_document_sources;
create trigger hipico_document_sources_immutable before update or delete on public.hipico_document_sources for each row execute function public.hipico_reject_immutable_row_mutation();
drop trigger if exists hipico_document_events_immutable on public.hipico_document_events;
create trigger hipico_document_events_immutable before update or delete on public.hipico_document_events for each row execute function public.hipico_reject_immutable_row_mutation();

comment on table public.hipico_document_events is 'Append-only parser/review audit. A reprocess adds an EXTRACTION event instead of erasing prior evidence.';
