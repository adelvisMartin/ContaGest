-- Control Hípico v1.21 — explicit audit-only race data conflicts (#287)
-- Additive constraint hardening only. RECORD_DATA_CONFLICT records conflicting
-- evidence in hipico_race_events while the application preserves race state/version.

alter table public.hipico_race_events
  drop constraint if exists hipico_race_events_command_check;

alter table public.hipico_race_events
  add constraint hipico_race_events_command_check check (command in (
    'DISCOVER','ANNOUNCE','OPEN','BEGIN_CLOSING','CLOSE','START',
    'RECORD_OBSERVED_ARRIVAL','RECORD_PROVISIONAL_RESULT','MARK_VERIFIED_RESULT','MARK_OFFICIAL_RESULT',
    'RECORD_DATA_CONFLICT','ARCHIVE','POSTPONE','CANCEL','SUSPEND','RESUME'
  ));

comment on table public.hipico_race_events is
  'Append-only race command/audit trail. RECORD_DATA_CONFLICT is audit-only; CLOSED and conflict events never imply settlement.';
