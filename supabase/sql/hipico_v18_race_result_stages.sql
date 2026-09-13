-- Control Hípico v1.18 — observed/provisional/verified/official result audit (#287/#290)
-- Additive hardening of the existing race command trail.

alter table public.hipico_race_events
  add column if not exists from_result_stage text,
  add column if not exists to_result_stage text;

alter table public.hipico_race_events
  drop constraint if exists hipico_race_events_command_check;
alter table public.hipico_race_events
  add constraint hipico_race_events_command_check check (command in (
    'DISCOVER','ANNOUNCE','OPEN','BEGIN_CLOSING','CLOSE','START',
    'RECORD_OBSERVED_ARRIVAL','RECORD_PROVISIONAL_RESULT','MARK_VERIFIED_RESULT','MARK_OFFICIAL_RESULT',
    'ARCHIVE','POSTPONE','CANCEL','SUSPEND','RESUME'
  ));

alter table public.hipico_race_events
  drop constraint if exists hipico_race_events_from_result_stage_check;
alter table public.hipico_race_events
  add constraint hipico_race_events_from_result_stage_check check (
    from_result_stage is null or from_result_stage in ('none','observed','provisional','verified','official')
  );

alter table public.hipico_race_events
  drop constraint if exists hipico_race_events_to_result_stage_check;
alter table public.hipico_race_events
  add constraint hipico_race_events_to_result_stage_check check (
    to_result_stage is null or to_result_stage in ('none','observed','provisional','verified','official')
  );

comment on column public.hipico_race_events.from_result_stage is
  'Result authority stage before the command; independent from race lifecycle state.';
comment on column public.hipico_race_events.to_result_stage is
  'Result authority stage after the command: none/observed/provisional/verified/official.';
