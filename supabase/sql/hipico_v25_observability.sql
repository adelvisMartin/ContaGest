CREATE TABLE IF NOT EXISTS public.hipico_observability_events (
  id bigserial PRIMARY KEY,
  owner_id uuid NOT NULL,
  group_key text NOT NULL CHECK (length(group_key) BETWEEN 1 AND 180),
  group_id text NOT NULL CHECK (length(group_id) BETWEEN 1 AND 180),
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 1 AND 180),
  correlation_id text NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 180),
  candidate_sha text NULL CHECK (candidate_sha IS NULL OR candidate_sha ~ '^[a-f0-9]{40}$'),
  stage text NOT NULL CHECK (stage IN ('INBOUND','NORMALIZATION','PARSER','CONTEXT','RISK_POLICY','AGENT_DECISION','PERSISTENCE','OUTBOX','DELIVERY_RECEIPT','RECONCILIATION_HANDOFF')),
  outcome text NOT NULL CHECK (outcome IN ('SUCCESS','HELD','DENIED','ERROR','DUPLICATE','RETRY','SKIPPED')),
  reason_code text NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 160),
  latency_ms integer NOT NULL DEFAULT 0 CHECK (latency_ms BETWEEN 0 AND 86400000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hipico_observability_scope_corr_idx
  ON public.hipico_observability_events(owner_id,group_key,group_id,correlation_id,created_at,id);
CREATE INDEX IF NOT EXISTS hipico_observability_sha_stage_idx
  ON public.hipico_observability_events(candidate_sha,stage,created_at);

CREATE OR REPLACE FUNCTION public.hipico_observability_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'hipico_observability_events is append-only' USING ERRCODE='55000';
END $$;
DROP TRIGGER IF EXISTS hipico_observability_no_mutation ON public.hipico_observability_events;
CREATE TRIGGER hipico_observability_no_mutation
BEFORE UPDATE OR DELETE ON public.hipico_observability_events
FOR EACH ROW EXECUTE FUNCTION public.hipico_observability_append_only();

ALTER TABLE public.hipico_observability_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hipico_observability_events FROM PUBLIC;
COMMENT ON TABLE public.hipico_observability_events IS 'Sanitized append-only Control Hipico support evidence. Server authority; never raw message content or credentials.';
