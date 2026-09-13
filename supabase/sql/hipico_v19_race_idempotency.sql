-- Control Hípico v1.19 — explicit command idempotency and immutable race audit (#287)
-- Additive: request_id remains the transport trace; idempotency_key is the semantic retry key.

alter table public.hipico_race_events add column if not exists idempotency_key text;
update public.hipico_race_events set idempotency_key=request_id where idempotency_key is null;
alter table public.hipico_race_events alter column idempotency_key set not null;

alter table public.hipico_race_events drop constraint if exists hipico_race_events_idempotency_key_check;
alter table public.hipico_race_events add constraint hipico_race_events_idempotency_key_check check (length(idempotency_key) between 8 and 120);
create unique index if not exists hipico_race_events_idempotency_unique on public.hipico_race_events(owner_id,group_key,race_id,idempotency_key);

create or replace function public.hipico_reject_race_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'HIPICO_RACE_EVENT_IMMUTABLE' using errcode='55000';
end;
$$;

drop trigger if exists hipico_race_events_immutable on public.hipico_race_events;
create trigger hipico_race_events_immutable before update or delete on public.hipico_race_events
for each row execute function public.hipico_reject_race_event_mutation();

comment on column public.hipico_race_events.idempotency_key is 'Client retry key. Same key + same semantic command replays with zero additional effects; mismatched payload fails closed.';
