-- Hípico Control v1.17 — explicit ambiguous-delivery reconciliation state.
-- Additive/replay-safe hardening: ambiguous Meta delivery must never remain in the
-- generic `sending` state because operators need an explicit durable state that is
-- excluded from automatic reclaim/retry.

DO $$
BEGIN
  IF to_regclass('public.hipico_outbox') IS NULL THEN
    RETURN;
  END IF;

  -- The original v12 table used the generated constraint name below. Dropping it
  -- is replay-safe and does not alter existing rows.
  ALTER TABLE public.hipico_outbox
    DROP CONSTRAINT IF EXISTS hipico_outbox_status_check;

  ALTER TABLE public.hipico_outbox
    ADD CONSTRAINT hipico_outbox_status_check
    CHECK (status IN (
      'queued',
      'sending',
      'sent',
      'retry',
      'cancelled',
      'failed',
      'reconciliation_required'
    ));
END $$;

COMMENT ON CONSTRAINT hipico_outbox_status_check ON public.hipico_outbox
  IS 'Ambiguous Meta delivery is parked in reconciliation_required and is never auto-reclaimed as queued/retry.';
