-- Control Hípico v2.1 — explicit operator reconciliation audit.
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS reconciled_by text;
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;
ALTER TABLE public.hipico_outbox ADD COLUMN IF NOT EXISTS reconciliation_reason text;

ALTER TABLE public.hipico_outbox DROP CONSTRAINT IF EXISTS hipico_outbox_reconciliation_reason_check;
ALTER TABLE public.hipico_outbox
  ADD CONSTRAINT hipico_outbox_reconciliation_reason_check
  CHECK (reconciliation_reason IS NULL OR length(reconciliation_reason) BETWEEN 5 AND 500);

COMMENT ON COLUMN public.hipico_outbox.reconciled_by IS 'Server-side operator actor reference that explicitly resolved an ambiguous delivery.';
COMMENT ON COLUMN public.hipico_outbox.reconciled_at IS 'Timestamp of explicit manual reconciliation.';
COMMENT ON COLUMN public.hipico_outbox.reconciliation_reason IS 'Auditable reason; required by the application for manual reconciliation.';
