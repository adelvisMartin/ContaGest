-- Control Hípico — canonical source identity normalization.
-- Additive/fail-closed alignment with supabase/sql/hipico_v14_canonical_domain.sql.
-- The current domain store treats one source_message_key as one immutable source
-- identity inside an aggregate, independent of the parser-derived event_type.

DO $$
BEGIN
  IF to_regclass('public.hipico_domain_events') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.hipico_domain_events
    GROUP BY owner_id, group_key, aggregate_kind, aggregate_key, source_message_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'HIPICO_DOMAIN_SOURCE_IDENTITY_DUPLICATES'
      USING ERRCODE = '23505',
            HINT = 'Reconcile conflicting historical source-message identities before applying this migration. No rows were deleted automatically.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS hipico_domain_events_source_identity_v297
  ON public.hipico_domain_events(owner_id, group_key, aggregate_kind, aggregate_key, source_message_key);

DO $$
BEGIN
  IF to_regclass('public.hipico_domain_events') IS NULL
     OR to_regclass('public.hipico_domain_aggregates') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.hipico_domain_events e
    LEFT JOIN public.hipico_domain_aggregates a
      ON a.owner_id = e.owner_id
     AND a.group_key = e.group_key
     AND a.aggregate_kind = e.aggregate_kind
     AND a.aggregate_key = e.aggregate_key
    WHERE a.owner_id IS NULL
  ) THEN
    RAISE EXCEPTION 'HIPICO_DOMAIN_ORPHAN_EVENTS'
      USING ERRCODE = '23503',
            HINT = 'Reconcile orphan historical domain events before adding the canonical aggregate foreign key.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.hipico_domain_events'::regclass
      AND conname = 'hipico_domain_events_aggregate_fk'
  ) THEN
    ALTER TABLE public.hipico_domain_events
      ADD CONSTRAINT hipico_domain_events_aggregate_fk
      FOREIGN KEY (owner_id, group_key, aggregate_kind, aggregate_key)
      REFERENCES public.hipico_domain_aggregates(owner_id, group_key, aggregate_kind, aggregate_key)
      ON DELETE RESTRICT;
  END IF;
END $$;

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
