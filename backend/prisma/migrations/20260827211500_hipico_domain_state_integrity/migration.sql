-- #107 Control Hípico domain integrity.
-- Additive journal + materialized aggregate projection. Historical events are immutable;
-- corrections and reversals are new events referencing prior evidence.

CREATE TABLE IF NOT EXISTS public.hipico_domain_aggregates (
  owner_id UUID NOT NULL,
  group_key TEXT NOT NULL,
  aggregate_kind TEXT NOT NULL CHECK (aggregate_kind IN ('race','day')),
  aggregate_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PREPARING',
  state_version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, group_key, aggregate_kind, aggregate_key)
);

CREATE TABLE IF NOT EXISTS public.hipico_domain_events (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL,
  group_key TEXT NOT NULL,
  aggregate_kind TEXT NOT NULL CHECK (aggregate_kind IN ('race','day')),
  aggregate_key TEXT NOT NULL,
  source_message_id TEXT,
  source_message_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('applied','evidence_only','duplicate','review','rejected')),
  previous_state TEXT NOT NULL,
  next_state TEXT NOT NULL,
  reason TEXT NOT NULL,
  original_event_id TEXT REFERENCES public.hipico_domain_events(id) ON DELETE RESTRICT,
  raw_message TEXT,
  normalized_payload JSONB,
  actor_ref TEXT,
  source TEXT NOT NULL DEFAULT 'system',
  parser_version TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  event_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, group_key, aggregate_kind, aggregate_key, source_message_key, event_type)
);

CREATE INDEX IF NOT EXISTS hipico_domain_events_aggregate_created_idx
  ON public.hipico_domain_events(owner_id, group_key, aggregate_kind, aggregate_key, created_at);
CREATE INDEX IF NOT EXISTS hipico_domain_events_review_idx
  ON public.hipico_domain_events(owner_id, group_key, disposition, created_at)
  WHERE disposition IN ('review','rejected');
CREATE INDEX IF NOT EXISTS hipico_domain_events_original_idx
  ON public.hipico_domain_events(original_event_id)
  WHERE original_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hipico_domain_events_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'HIPICO_DOMAIN_EVENTS_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS hipico_domain_events_immutable ON public.hipico_domain_events;
CREATE TRIGGER hipico_domain_events_immutable
BEFORE UPDATE OR DELETE ON public.hipico_domain_events
FOR EACH ROW EXECUTE FUNCTION public.hipico_domain_events_immutable_guard();
