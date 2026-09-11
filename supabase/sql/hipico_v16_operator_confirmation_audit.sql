-- Hípico v16 · immutable operator-confirmation evidence for canonical domain events.
-- Additive only: existing event rows remain valid as unconfirmed historical evidence.

alter table public.hipico_domain_events
  add column if not exists operator_confirmed boolean not null default false;

alter table public.hipico_domain_events
  add column if not exists confirmation_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.hipico_domain_events'::regclass
      and conname = 'hipico_domain_events_confirmation_audit_check'
  ) then
    alter table public.hipico_domain_events
      add constraint hipico_domain_events_confirmation_audit_check
      check (
        (operator_confirmed = false and confirmation_reason is null)
        or
        (operator_confirmed = true
          and char_length(btrim(coalesce(confirmation_reason, ''))) between 5 and 500)
      );
  end if;
end $$;

comment on column public.hipico_domain_events.operator_confirmed is
  'True only when the canonical operator explicitly confirmed this append-only domain action.';
comment on column public.hipico_domain_events.confirmation_reason is
  'Immutable operator-provided reason captured with an explicitly confirmed domain action.';
