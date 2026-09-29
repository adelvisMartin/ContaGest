-- #627 · Production convergence hardening.
-- Forward-only follow-up after the canonical ledger/FX/fiscal/lifecycle convergence.
-- Fixes Supabase advisor findings without opening RLS or changing application data.

ALTER FUNCTION public.guard_ledger_entry_lifecycle()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_posted_ledger_line_mutation()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_ledger_posting_period_open()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.data_lifecycle_policy_guard()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.data_lifecycle_hold_guard()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.data_lifecycle_evidence_immutable()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.data_lifecycle_storage_no_delete()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.data_lifecycle_assert_not_held(text, text, text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.data_lifecycle_protected_delete_guard()
  SET search_path = public, pg_temp;

CREATE INDEX IF NOT EXISTS "DataLifecycleEvidence_jobId_idx"
  ON public."DataLifecycleEvidence" ("jobId");
CREATE INDEX IF NOT EXISTS "FinancialFxBankAccountMap_bankAccountId_idx"
  ON public."FinancialFxBankAccountMap" ("bankAccountId");
CREATE INDEX IF NOT EXISTS "FiscalCloseEvidence_closingPeriodId_idx"
  ON public."FiscalCloseEvidence" ("closingPeriodId");
