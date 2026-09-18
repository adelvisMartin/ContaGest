-- Control Hípico v2.7 — canonical outbox authority hardening.
-- Browser/authenticated users may inspect their own rows through RLS, but every
-- production enqueue/lease/receipt/reconciliation mutation remains server-side.

ALTER TABLE public.hipico_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hipico_outbox_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hipico_outbox_insert_own ON public.hipico_outbox;
DROP POLICY IF EXISTS hipico_outbox_update_own ON public.hipico_outbox;
DROP POLICY IF EXISTS hipico_outbox_delete_own ON public.hipico_outbox;

DROP POLICY IF EXISTS hipico_outbox_receipts_insert_own ON public.hipico_outbox_receipts;
DROP POLICY IF EXISTS hipico_outbox_receipts_update_own ON public.hipico_outbox_receipts;
DROP POLICY IF EXISTS hipico_outbox_receipts_delete_own ON public.hipico_outbox_receipts;

DROP POLICY IF EXISTS hipico_outbox_select_own ON public.hipico_outbox;
CREATE POLICY hipico_outbox_select_own
  ON public.hipico_outbox
  FOR SELECT
  TO authenticated
  USING (owner_id=(SELECT auth.uid()));

DROP POLICY IF EXISTS hipico_outbox_receipts_select_own ON public.hipico_outbox_receipts;
CREATE POLICY hipico_outbox_receipts_select_own
  ON public.hipico_outbox_receipts
  FOR SELECT
  TO authenticated
  USING (owner_id=(SELECT auth.uid()));

REVOKE ALL ON TABLE public.hipico_outbox FROM anon, authenticated;
REVOKE ALL ON TABLE public.hipico_outbox_receipts FROM anon, authenticated;

GRANT SELECT ON TABLE public.hipico_outbox TO authenticated;
GRANT SELECT ON TABLE public.hipico_outbox_receipts TO authenticated;

COMMENT ON TABLE public.hipico_outbox IS
  'Single production authority for Control Hípico outbound delivery. Client roles are read-only; mutations are server-side.';
COMMENT ON TABLE public.hipico_outbox_receipts IS
  'Append-only provider delivery evidence. Client roles are read-only; writes are server-side only.';
