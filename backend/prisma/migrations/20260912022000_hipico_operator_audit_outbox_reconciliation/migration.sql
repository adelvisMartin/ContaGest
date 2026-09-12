-- Control Hípico PR #297 — deploy parity for canonical operator audit (v16)
-- and ambiguous outbound delivery reconciliation (v17).
--
-- This Prisma migration mirrors the Supabase SQL contracts so deployments that
-- rely on `prisma migrate deploy` cannot run application code against an older
-- Hípico schema. It is additive/replay-safe and never rewrites historical rows.

DO $$
BEGIN
  IF to_regclass('public.hipico_domain_events') IS NOT NULL THEN
    ALTER TABLE public.hipico_domain_events
      ADD COLUMN IF NOT EXISTS operator_confirmed boolean NOT NULL DEFAULT false;

    ALTER TABLE public.hipico_domain_events
      ADD COLUMN IF NOT EXISTS confirmation_reason text;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.hipico_domain_events'::regclass
        AND conname = 'hipico_domain_events_confirmation_audit_check'
    ) THEN
      ALTER TABLE public.hipico_domain_events
        ADD CONSTRAINT hipico_domain_events_confirmation_audit_check
        CHECK (
          (operator_confirmed = false AND confirmation_reason IS NULL)
          OR
          (operator_confirmed = true
            AND char_length(btrim(coalesce(confirmation_reason, ''))) BETWEEN 5 AND 500)
        );
    END IF;

    COMMENT ON COLUMN public.hipico_domain_events.operator_confirmed IS
      'True only when the canonical operator explicitly confirmed this append-only domain action.';
    COMMENT ON COLUMN public.hipico_domain_events.confirmation_reason IS
      'Immutable operator-provided reason captured with an explicitly confirmed domain action.';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.hipico_outbox') IS NOT NULL THEN
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

    COMMENT ON CONSTRAINT hipico_outbox_status_check ON public.hipico_outbox IS
      'Ambiguous Meta delivery is parked in reconciliation_required and is never auto-reclaimed as queued/retry.';
  END IF;
END $$;
