-- Control Hípico v2.3 — deterministic response/action risk policy evidence.
-- Additive and replay-safe. Existing evaluations are intentionally backfilled as
-- HUMAN_REQUIRED so no historical row can gain automatic authority retroactively.

ALTER TABLE public.hipico_agent_evaluations
  ADD COLUMN IF NOT EXISTS policy_disposition text,
  ADD COLUMN IF NOT EXISTS policy_reason text,
  ADD COLUMN IF NOT EXISTS policy_version text,
  ADD COLUMN IF NOT EXISTS policy_evidence_state text;

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

COMMENT ON COLUMN public.hipico_agent_evaluations.policy_disposition IS
  'Deterministic AUTO/SUGGEST/HUMAN_REQUIRED/DENY decision. Never grants financial authority.';
COMMENT ON COLUMN public.hipico_agent_evaluations.policy_reason IS
  'Stable machine-readable reason emitted by the deterministic risk policy.';
COMMENT ON COLUMN public.hipico_agent_evaluations.policy_version IS
  'Version of the deterministic risk policy used for the evaluation.';
COMMENT ON COLUMN public.hipico_agent_evaluations.policy_evidence_state IS
  'Server-resolved evidence state used by the policy; request bodies cannot elevate it.';
