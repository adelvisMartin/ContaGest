-- Control Hípico v2.3 — deterministic response/action risk policy evidence.
-- Additive and replay-safe. Existing evaluations are intentionally backfilled as
-- HUMAN_REQUIRED so no historical row can gain automatic authority retroactively.

BEGIN;
LOCK TABLE public.hipico_agent_evaluations IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.hipico_agent_evaluations
  ADD COLUMN IF NOT EXISTS policy_disposition text,
  ADD COLUMN IF NOT EXISTS policy_reason text,
  ADD COLUMN IF NOT EXISTS policy_version text,
  ADD COLUMN IF NOT EXISTS policy_evidence_state text;

-- v22 protects evaluation rows with a one-time-review trigger. Hold an exclusive
-- migration lock, remove that trigger only for the deterministic metadata backfill,
-- then recreate a stricter guard below that also freezes every v23 policy field.
DROP TRIGGER IF EXISTS hipico_agent_evaluations_review_once ON public.hipico_agent_evaluations;

UPDATE public.hipico_agent_evaluations
SET policy_disposition = COALESCE(policy_disposition, 'HUMAN_REQUIRED'),
    policy_reason = COALESCE(policy_reason, 'LEGACY_EVALUATION_REQUIRES_REVIEW'),
    policy_version = COALESCE(policy_version, 'legacy-pre-v6'),
    policy_evidence_state = COALESCE(policy_evidence_state, 'MISSING')
WHERE policy_disposition IS NULL
   OR policy_reason IS NULL
   OR policy_version IS NULL
   OR policy_evidence_state IS NULL;

ALTER TABLE public.hipico_agent_evaluations
  ALTER COLUMN policy_disposition SET NOT NULL,
  ALTER COLUMN policy_reason SET NOT NULL,
  ALTER COLUMN policy_version SET NOT NULL,
  ALTER COLUMN policy_evidence_state SET NOT NULL;

ALTER TABLE public.hipico_agent_evaluations
  DROP CONSTRAINT IF EXISTS hipico_agent_evaluations_policy_disposition_check,
  DROP CONSTRAINT IF EXISTS hipico_agent_evaluations_policy_evidence_state_check;

ALTER TABLE public.hipico_agent_evaluations
  ADD CONSTRAINT hipico_agent_evaluations_policy_disposition_check
    CHECK (policy_disposition IN ('AUTO', 'SUGGEST', 'HUMAN_REQUIRED', 'DENY')),
  ADD CONSTRAINT hipico_agent_evaluations_policy_evidence_state_check
    CHECK (policy_evidence_state IN ('NOT_REQUIRED', 'MISSING', 'FRESH', 'STALE', 'CONFLICT'));

CREATE INDEX IF NOT EXISTS hipico_agent_evaluations_policy_idx
  ON public.hipico_agent_evaluations(owner_id, group_key, group_id, policy_disposition, created_at DESC);

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

COMMENT ON COLUMN public.hipico_agent_evaluations.policy_disposition IS
  'Deterministic AUTO/SUGGEST/HUMAN_REQUIRED/DENY decision. Never grants financial authority.';
COMMENT ON COLUMN public.hipico_agent_evaluations.policy_reason IS
  'Stable machine-readable reason emitted by the deterministic risk policy.';
COMMENT ON COLUMN public.hipico_agent_evaluations.policy_version IS
  'Version of the deterministic risk policy used for the evaluation.';
COMMENT ON COLUMN public.hipico_agent_evaluations.policy_evidence_state IS
  'Server-resolved evidence state used by the policy; request bodies cannot elevate it.';

COMMIT;
