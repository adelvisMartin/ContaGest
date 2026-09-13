-- Control Hípico v2.1 — canonical production outbound queue.
-- Replay-safe additive migration. public.hipico_outbox becomes the single authority
-- for every new production outbound send. Ambiguous historical `sending` rows are
-- parked in reconciliation_required before lease invariants are enabled.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.hipico_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  group_key text NOT NULL,
  destination text NOT NULL,
  source_event_id uuid NULL,
  idempotency_key text NOT NULL,
  reply_type text NOT NULL DEFAULT 'operational',
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  external_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE(owner_id,idempotency_key)
);

ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS correlation_id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS payload_digest text;
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'meta_cloud';
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS leased_at timestamptz;
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS leased_until timestamptz;
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 4;
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS cooldown_until timestamptz;
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS failed_at timestamptz;
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS last_error_code text;
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.hipico_outbox
SET correlation_id=COALESCE(correlation_id,gen_random_uuid()),
    payload_digest=COALESCE(NULLIF(payload_digest,''),encode(digest(
      concat_ws('|',owner_id::text,group_key,destination,reply_type,payload::text),'sha256'
    ),'hex')),
    updated_at=COALESCE(updated_at,created_at,now())
WHERE correlation_id IS NULL OR payload_digest IS NULL OR payload_digest='';

-- A pre-v21 sending row has no durable lease/receipt semantics. Reclaiming it would
-- risk a duplicate WhatsApp message, therefore it is explicitly reconciled instead.
UPDATE public.hipico_outbox
SET status='reconciliation_required',
    last_error_code=COALESCE(last_error_code,'PRE_V21_SENDING_STATE_AMBIGUOUS'),
    last_error=COALESCE(last_error,'Pre-v21 sending state requires explicit reconciliation before any resend.'),
    updated_at=now()
WHERE status='sending' AND (lease_token IS NULL OR leased_until IS NULL);

ALTER TABLE public.hipico_outbox ALTER COLUMN correlation_id SET NOT NULL;
ALTER TABLE public.hipico_outbox ALTER COLUMN payload_digest SET NOT NULL;

ALTER TABLE public.hipico_outbox DROP CONSTRAINT IF EXISTS hipico_outbox_status_check;
ALTER TABLE public.hipico_outbox DROP CONSTRAINT IF EXISTS hipico_outbox_attempts_check;
ALTER TABLE public.hipico_outbox DROP CONSTRAINT IF EXISTS hipico_outbox_max_attempts_check;
ALTER TABLE public.hipico_outbox DROP CONSTRAINT IF EXISTS hipico_outbox_payload_digest_check;
ALTER TABLE public.hipico_outbox DROP CONSTRAINT IF EXISTS hipico_outbox_lease_check;

ALTER TABLE public.hipico_outbox
  ADD CONSTRAINT hipico_outbox_status_check CHECK (status IN (
    'queued','sending','accepted','sent','delivered','read','retry','cancelled','failed','reconciliation_required'
  )),
  ADD CONSTRAINT hipico_outbox_attempts_check CHECK (attempts>=0),
  ADD CONSTRAINT hipico_outbox_max_attempts_check CHECK (max_attempts BETWEEN 1 AND 20),
  ADD CONSTRAINT hipico_outbox_payload_digest_check CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT hipico_outbox_lease_check CHECK (
    (status='sending' AND lease_token IS NOT NULL AND leased_at IS NOT NULL AND leased_until IS NOT NULL)
    OR
    (status<>'sending' AND lease_token IS NULL AND leased_at IS NULL AND leased_until IS NULL)
  );

CREATE INDEX IF NOT EXISTS hipico_outbox_claim_idx
  ON public.hipico_outbox(owner_id,status,next_attempt_at,cooldown_until,created_at);
CREATE INDEX IF NOT EXISTS hipico_outbox_group_status_idx
  ON public.hipico_outbox(owner_id,group_key,status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS hipico_outbox_one_sending_destination
  ON public.hipico_outbox(owner_id,group_key,destination)
  WHERE status='sending';
CREATE UNIQUE INDEX IF NOT EXISTS hipico_outbox_provider_message_unique
  ON public.hipico_outbox(owner_id,provider,external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.hipico_outbox_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  outbox_id uuid NOT NULL REFERENCES public.hipico_outbox(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_message_id text NOT NULL,
  receipt_status text NOT NULL CHECK (receipt_status IN ('sent','delivered','read','failed')),
  receipt_timestamp timestamptz NOT NULL,
  error_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,provider,provider_message_id,receipt_status,receipt_timestamp)
);
CREATE INDEX IF NOT EXISTS hipico_outbox_receipts_lookup_idx
  ON public.hipico_outbox_receipts(owner_id,provider,provider_message_id,receipt_timestamp DESC);
CREATE INDEX IF NOT EXISTS hipico_outbox_receipts_outbox_idx
  ON public.hipico_outbox_receipts(outbox_id,receipt_timestamp DESC);

CREATE OR REPLACE FUNCTION public.hipico_outbox_receipts_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'hipico_outbox_receipts is append-only';
END;
$$;
DROP TRIGGER IF EXISTS hipico_outbox_receipts_immutable ON public.hipico_outbox_receipts;
CREATE TRIGGER hipico_outbox_receipts_immutable
BEFORE UPDATE OR DELETE ON public.hipico_outbox_receipts
FOR EACH ROW EXECUTE FUNCTION public.hipico_outbox_receipts_immutable_guard();

ALTER TABLE public.hipico_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hipico_outbox_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hipico_outbox_select_own ON public.hipico_outbox;
DROP POLICY IF EXISTS hipico_outbox_insert_own ON public.hipico_outbox;
DROP POLICY IF EXISTS hipico_outbox_update_own ON public.hipico_outbox;
CREATE POLICY hipico_outbox_select_own ON public.hipico_outbox FOR SELECT TO authenticated USING (owner_id=(SELECT auth.uid()));
CREATE POLICY hipico_outbox_insert_own ON public.hipico_outbox FOR INSERT TO authenticated WITH CHECK (owner_id=(SELECT auth.uid()));
CREATE POLICY hipico_outbox_update_own ON public.hipico_outbox FOR UPDATE TO authenticated USING (owner_id=(SELECT auth.uid())) WITH CHECK (owner_id=(SELECT auth.uid()));

DROP POLICY IF EXISTS hipico_outbox_receipts_select_own ON public.hipico_outbox_receipts;
DROP POLICY IF EXISTS hipico_outbox_receipts_insert_own ON public.hipico_outbox_receipts;
CREATE POLICY hipico_outbox_receipts_select_own ON public.hipico_outbox_receipts FOR SELECT TO authenticated USING (owner_id=(SELECT auth.uid()));
CREATE POLICY hipico_outbox_receipts_insert_own ON public.hipico_outbox_receipts FOR INSERT TO authenticated WITH CHECK (owner_id=(SELECT auth.uid()));

COMMENT ON TABLE public.hipico_outbox IS 'Single production authority for Control Hípico outbound delivery.';
COMMENT ON TABLE public.hipico_outbox_receipts IS 'Append-only provider delivery evidence; duplicate receipts are idempotent.';
COMMENT ON CONSTRAINT hipico_outbox_status_check ON public.hipico_outbox IS 'Ambiguous delivery is reconciliation_required and cannot be auto-claimed.';
