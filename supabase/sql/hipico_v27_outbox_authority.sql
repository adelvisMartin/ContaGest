-- Control Hípico v27 — canonical outbox authority hardening.
-- Browser/client roles may observe their own delivery state through RLS, but every
-- production mutation remains server-side through the canonical PostgreSQL outbox.

ALTER TABLE public.hipico_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hipico_outbox_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hipico_outbox_insert_own ON public.hipico_outbox;
DROP POLICY IF EXISTS hipico_outbox_update_own ON public.hipico_outbox;
DROP POLICY IF EXISTS hipico_outbox_receipts_insert_own ON public.hipico_outbox_receipts;

-- Re-state read policies idempotently so the post-v27 contract is explicit.
DROP POLICY IF EXISTS hipico_outbox_select_own ON public.hipico_outbox;
CREATE POLICY hipico_outbox_select_own
  ON public.hipico_outbox
  FOR SELECT TO authenticated
  USING (owner_id=(SELECT auth.uid()));

DROP POLICY IF EXISTS hipico_outbox_receipts_select_own ON public.hipico_outbox_receipts;
CREATE POLICY hipico_outbox_receipts_select_own
  ON public.hipico_outbox_receipts
  FOR SELECT TO authenticated
  USING (owner_id=(SELECT auth.uid()));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.hipico_outbox FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.hipico_outbox_receipts FROM anon, authenticated;

COMMENT ON TABLE public.hipico_outbox IS
  'Canonical server-side production outbound authority. Client roles are read-only through owner-scoped RLS.';
COMMENT ON TABLE public.hipico_outbox_receipts IS
  'Append-only provider receipt evidence. Client roles are read-only through owner-scoped RLS.';
