-- #111 Immutable predicted-vs-actual shadow evidence.

CREATE TABLE IF NOT EXISTS public.hipico_shadow_prediction_versions (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL,
  source_group_key TEXT NOT NULL,
  source_message_id TEXT,
  source_external_message_id TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  predicted_payload JSONB NOT NULL,
  predicted_hash TEXT NOT NULL,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id,source_group_key,source_external_message_id,parser_version,schema_version)
);

CREATE TABLE IF NOT EXISTS public.hipico_shadow_actuals (
  id TEXT PRIMARY KEY,
  prediction_id TEXT NOT NULL REFERENCES public.hipico_shadow_prediction_versions(id) ON DELETE RESTRICT,
  actual_payload JSONB,
  actual_source_event_id TEXT,
  match_status TEXT NOT NULL CHECK(match_status IN ('exact','partial','mismatch','unresolved')),
  match_score NUMERIC(6,5),
  diff_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewer_status TEXT NOT NULL DEFAULT 'pending' CHECK(reviewer_status IN ('pending','accepted','rejected','needs_followup')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(prediction_id,actual_source_event_id)
);

CREATE INDEX IF NOT EXISTS hipico_shadow_actuals_review_idx
  ON public.hipico_shadow_actuals(match_status,reviewer_status,recorded_at);

CREATE OR REPLACE FUNCTION public.hipico_shadow_prediction_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'HIPICO_SHADOW_PREDICTION_APPEND_ONLY';
END;
$$;
DROP TRIGGER IF EXISTS hipico_shadow_prediction_immutable ON public.hipico_shadow_prediction_versions;
CREATE TRIGGER hipico_shadow_prediction_immutable
BEFORE UPDATE OR DELETE ON public.hipico_shadow_prediction_versions
FOR EACH ROW EXECUTE FUNCTION public.hipico_shadow_prediction_immutable_guard();

-- Existing canonical installations historically used ON CONFLICT DO UPDATE.
-- Freeze the original prediction only when that legacy table already exists;
-- a clean migration must not depend on out-of-band schema state.
CREATE OR REPLACE FUNCTION public.hipico_shadow_existing_prediction_freeze()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.predicted_payload IS DISTINCT FROM NEW.predicted_payload THEN
    NEW.predicted_payload := OLD.predicted_payload;
    NEW.predicted_at := OLD.predicted_at;
  END IF;
  RETURN NEW;
END;
$$;
DO $$
BEGIN
  IF to_regclass('public.hipico_shadow_evaluations') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS hipico_shadow_existing_prediction_freeze_trg ON public.hipico_shadow_evaluations;
    CREATE TRIGGER hipico_shadow_existing_prediction_freeze_trg
      BEFORE UPDATE ON public.hipico_shadow_evaluations
      FOR EACH ROW EXECUTE FUNCTION public.hipico_shadow_existing_prediction_freeze();
  END IF;
END;
$$;
