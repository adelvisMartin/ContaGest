-- Control Hípico v2.4 — dual-window Shadow metrics and promotion evidence.
-- Additive/replay-safe. Existing evaluations are tagged legacy-v6 so they remain
-- valid historical evidence but cannot satisfy the recent v7 sample requirement.

BEGIN;
LOCK TABLE public.hipico_agent_evaluations IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.hipico_agent_evaluations
  ADD COLUMN IF NOT EXISTS abstained boolean,
  ADD COLUMN IF NOT EXISTS race_context_error boolean,
  ADD COLUMN IF NOT EXISTS metric_schema_version text;

DROP TRIGGER IF EXISTS hipico_agent_evaluations_review_once ON public.hipico_agent_evaluations;

UPDATE public.hipico_agent_evaluations
SET abstained = COALESCE(abstained, false),
    race_context_error = COALESCE(race_context_error, false),
    metric_schema_version = COALESCE(NULLIF(metric_schema_version, ''), 'legacy-v6')
WHERE abstained IS NULL
   OR race_context_error IS NULL
   OR metric_schema_version IS NULL
   OR metric_schema_version = '';

ALTER TABLE public.hipico_agent_evaluations
  ALTER COLUMN abstained SET DEFAULT false,
  ALTER COLUMN abstained SET NOT NULL,
  ALTER COLUMN race_context_error SET DEFAULT false,
  ALTER COLUMN race_context_error SET NOT NULL,
  ALTER COLUMN metric_schema_version SET DEFAULT 'v7',
  ALTER COLUMN metric_schema_version SET NOT NULL;

ALTER TABLE public.hipico_agent_evaluations
  DROP CONSTRAINT IF EXISTS hipico_agent_evaluations_metric_schema_version_check;

ALTER TABLE public.hipico_agent_evaluations
  ADD CONSTRAINT hipico_agent_evaluations_metric_schema_version_check
    CHECK (metric_schema_version ~ '^[A-Za-z0-9._-]{1,40}$');

CREATE INDEX IF NOT EXISTS hipico_agent_eval_recent_v7_idx
  ON public.hipico_agent_evaluations(owner_id, group_key, group_id, metric_schema_version, reviewed_at DESC)
  WHERE reviewed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hipico_guard_agent_evaluation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF tg_op = 'DELETE' THEN
    RAISE EXCEPTION 'HIPICO_AGENT_EVALUATION_IMMUTABLE' USING errcode = '55000';
  END IF;

  IF old.actual_intent IS NULL
     AND old.reviewed_at IS NULL
     AND old.reviewed_by IS NULL
     AND new.actual_intent IS NOT NULL
     AND new.reviewed_at IS NOT NULL
     AND new.reviewed_by LIKE 'operator-token:%'
     AND new.matched IS NOT NULL
     AND new.matched = (old.predicted_intent = new.actual_intent)
     AND new.race_context_error IS NOT NULL
     AND new.reviewed_at >= old.created_at
     AND new.id = old.id
     AND new.owner_id = old.owner_id
     AND new.group_key = old.group_key
     AND new.group_id = old.group_id
     AND new.message_hash = old.message_hash
     AND new.expected_intent IS NOT DISTINCT FROM old.expected_intent
     AND new.predicted_intent = old.predicted_intent
     AND new.confidence = old.confidence
     AND new.risk = old.risk
     AND new.tool IS NOT DISTINCT FROM old.tool
     AND new.can_act = old.can_act
     AND new.model_version IS NOT DISTINCT FROM old.model_version
     AND new.evidence = old.evidence
     AND new.abstained = old.abstained
     AND new.metric_schema_version = old.metric_schema_version
     AND new.policy_disposition = old.policy_disposition
     AND new.policy_reason = old.policy_reason
     AND new.policy_version = old.policy_version
     AND new.policy_evidence_state = old.policy_evidence_state
     AND new.created_at = old.created_at THEN
    RETURN new;
  END IF;

  RAISE EXCEPTION 'HIPICO_AGENT_EVALUATION_IMMUTABLE' USING errcode = '55000';
END;
$$;

CREATE TRIGGER hipico_agent_evaluations_review_once
BEFORE UPDATE OR DELETE ON public.hipico_agent_evaluations
FOR EACH ROW EXECUTE FUNCTION public.hipico_guard_agent_evaluation_mutation();

COMMENT ON COLUMN public.hipico_agent_evaluations.abstained IS
  'True only when the evaluated agent explicitly abstained (canonical unknown intent). Immutable after insertion.';
COMMENT ON COLUMN public.hipico_agent_evaluations.race_context_error IS
  'Operator-reviewed race-context error flag. May transition only during the single authorized review.';
COMMENT ON COLUMN public.hipico_agent_evaluations.metric_schema_version IS
  'Metric semantics version. legacy-v6 rows remain historical but never satisfy the recent v7 sample.';

COMMIT;
