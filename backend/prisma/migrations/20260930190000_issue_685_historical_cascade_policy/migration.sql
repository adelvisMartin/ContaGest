-- #685 Historical Cascade Policy.
-- Forward-only and retention-safe: no business rows are rewritten or deleted.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Fail closed if #633's classified baseline has drifted before any DDL is applied.
DO $$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY[
    'FinancialFxLedgerLineSnapshot_line_fkey','FinancialFxLedgerLineSnapshot_tenant_fkey',
    'FiscalDocumentRuleSnapshot_tenantId_fkey','FiscalRuleVersion_tenantId_fkey','FiscalSequence_tenantId_fkey',
    'LegalAcceptance_tenantId_fkey','LegalAcceptance_userId_fkey',
    'budgetwallet_audit_journal_owner_id_fkey','hipico_audit_events_owner_id_fkey','hipico_audit_events_workspace_id_fkey',
    'TaxPeriod_tenantId_fkey'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=name AND contype='f' AND confdeltype='c') THEN
      RAISE EXCEPTION 'ISSUE_685_EXPECTED_CASCADE_MISSING:%', name;
    END IF;
  END LOOP;
  IF to_regprocedure('public.data_lifecycle_protected_delete_guard()') IS NULL THEN
    RAISE EXCEPTION 'ISSUE_685_LIFECYCLE_AUTHORITY_MISSING';
  END IF;
END $$;

ALTER TABLE public."FinancialFxLedgerLineSnapshot" DROP CONSTRAINT "FinancialFxLedgerLineSnapshot_line_fkey";
ALTER TABLE public."FinancialFxLedgerLineSnapshot" ADD CONSTRAINT "FinancialFxLedgerLineSnapshot_line_fkey" FOREIGN KEY ("ledgerLineId") REFERENCES public."LedgerLine"("id") ON DELETE RESTRICT;
ALTER TABLE public."FinancialFxLedgerLineSnapshot" DROP CONSTRAINT "FinancialFxLedgerLineSnapshot_tenant_fkey";
ALTER TABLE public."FinancialFxLedgerLineSnapshot" ADD CONSTRAINT "FinancialFxLedgerLineSnapshot_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE RESTRICT;

ALTER TABLE public."FiscalDocumentRuleSnapshot" DROP CONSTRAINT "FiscalDocumentRuleSnapshot_tenantId_fkey";
ALTER TABLE public."FiscalDocumentRuleSnapshot" ADD CONSTRAINT "FiscalDocumentRuleSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE RESTRICT;
ALTER TABLE public."FiscalRuleVersion" DROP CONSTRAINT "FiscalRuleVersion_tenantId_fkey";
ALTER TABLE public."FiscalRuleVersion" ADD CONSTRAINT "FiscalRuleVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE RESTRICT;
ALTER TABLE public."FiscalSequence" DROP CONSTRAINT "FiscalSequence_tenantId_fkey";
ALTER TABLE public."FiscalSequence" ADD CONSTRAINT "FiscalSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE RESTRICT;

ALTER TABLE public."LegalAcceptance" DROP CONSTRAINT "LegalAcceptance_tenantId_fkey";
ALTER TABLE public."LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE RESTRICT;
ALTER TABLE public."LegalAcceptance" DROP CONSTRAINT "LegalAcceptance_userId_fkey";
ALTER TABLE public."LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."UserProfile"("id") ON DELETE RESTRICT;

ALTER TABLE public.budgetwallet_audit_journal DROP CONSTRAINT budgetwallet_audit_journal_owner_id_fkey;
ALTER TABLE public.budgetwallet_audit_journal ADD CONSTRAINT budgetwallet_audit_journal_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.hipico_audit_events DROP CONSTRAINT hipico_audit_events_owner_id_fkey;
ALTER TABLE public.hipico_audit_events ADD CONSTRAINT hipico_audit_events_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.hipico_audit_events DROP CONSTRAINT hipico_audit_events_workspace_id_fkey;
ALTER TABLE public.hipico_audit_events ADD CONSTRAINT hipico_audit_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.hipico_workspaces(id) ON DELETE SET NULL;

-- TaxPeriod is Prisma-managed. Reuse #562's lifecycle authority instead of creating
-- a second DDL authority that would make schema.prisma drift from PostgreSQL.
INSERT INTO public."DataRetentionPolicyVersion" (
  "tenantId","entityType","version","effectiveFrom","retentionDays","archiveAfterDays",
  "deleteSemantics","purgeable","source","documentation","policy","contentHash"
)
SELECT NULL,'TaxPeriod',1,'2026-09-30T00:00:00Z'::timestamptz,NULL,NULL,
       'immutable',false,'engineering-hardening-#685',
       'Tax periods and declarations are retained; destructive disposition requires an approved lifecycle policy.',
       '{"legalReviewRequired":true,"cascadePolicyIssue":685}'::jsonb,'pending'
WHERE NOT EXISTS (
  SELECT 1 FROM public."DataRetentionPolicyVersion"
  WHERE "tenantId" IS NULL AND "entityType"='TaxPeriod' AND "version"=1
);

DROP TRIGGER IF EXISTS "TaxPeriod_lifecycle_delete_guard" ON public."TaxPeriod";
CREATE TRIGGER "TaxPeriod_lifecycle_delete_guard"
BEFORE DELETE ON public."TaxPeriod"
FOR EACH ROW EXECUTE FUNCTION public.data_lifecycle_protected_delete_guard();

COMMIT;
