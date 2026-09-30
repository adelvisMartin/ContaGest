-- #685 Historical Cascade Policy.
-- Forward-only hardening derived from the #633 CASCADE_RISK inventory.
-- Historical/regulated roots are fail-closed through the existing #562 lifecycle
-- authority. SQL-first audit FKs that cannot reuse the tenant-aware lifecycle guard
-- are rewritten from CASCADE to RESTRICT. Supplemental BudgetWallet/Hipico surfaces
-- remain conditional so a clean ContaGest-only replay is a safe no-op for them.

-- Extend the versioned lifecycle authority without inventing retention durations.
INSERT INTO public."DataRetentionPolicyVersion" (
  "tenantId", "entityType", "version", "effectiveFrom", "retentionDays", "archiveAfterDays",
  "deleteSemantics", "purgeable", "source", "documentation", "policy", "contentHash"
)
SELECT NULL, v."entityType", 1, '2026-09-30T00:00:00Z'::timestamptz, NULL, NULL,
       'immutable', false, 'engineering-hardening-#685', v."documentation",
       jsonb_build_object('legalReviewRequired', true, 'cascadePolicyIssue', 685), 'pending'
FROM (VALUES
  ('FinancialFxLedgerLineSnapshot', 'FX ledger snapshots are historical accounting evidence and cannot be removed by generic CRUD or tenant cascade.'),
  ('FiscalDocumentRuleSnapshot', 'Captured fiscal rule snapshots are immutable fiscal evidence.'),
  ('FiscalRuleVersion', 'Versioned fiscal rules are immutable regulatory history.'),
  ('LegalAcceptance', 'Legal acceptance evidence is immutable and must survive generic identity or tenant deletion.'),
  ('TaxDeclaration', 'Tax declarations are protected fiscal history; purge requires an approved future retention policy.'),
  ('TaxPeriod', 'Tax periods are protected fiscal history; tenant deletion must fail closed while history exists.')
) AS v("entityType", "documentation")
WHERE NOT EXISTS (
  SELECT 1
  FROM public."DataRetentionPolicyVersion" p
  WHERE p."tenantId" IS NULL
    AND p."entityType" = v."entityType"
    AND p."version" = 1
);

-- Generic immutable lifecycle guards for historical tables that expose tenantId/id.
DO $guard$
DECLARE
  target_table text;
  trigger_name text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'FinancialFxLedgerLineSnapshot',
    'FiscalDocumentRuleSnapshot',
    'FiscalRuleVersion',
    'LegalAcceptance',
    'TaxPeriod'
  ] LOOP
    IF to_regclass(format('public.%I', target_table)) IS NULL THEN
      CONTINUE;
    END IF;

    trigger_name := target_table || '_lifecycle_delete_guard';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      WHERE t.tgrelid = to_regclass(format('public.%I', target_table))
        AND t.tgname = trigger_name
        AND NOT t.tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.data_lifecycle_protected_delete_guard()',
        trigger_name,
        target_table
      );
    END IF;
  END LOOP;
END
$guard$;

-- TaxDeclaration has no tenantId column. Resolve tenancy through TaxPeriod and
-- enforce the same #562 authorization/legal-hold/versioned-policy contract.
CREATE OR REPLACE FUNCTION public.data_lifecycle_tax_declaration_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_tenant text;
  v_purgeable boolean;
  v_semantics text;
BEGIN
  IF current_setting('contagest.lifecycle_authorized', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'generic delete denied for protected lifecycle entity %', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  SELECT tp."tenantId"
  INTO v_tenant
  FROM public."TaxPeriod" tp
  WHERE tp."id" = OLD."periodId";

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tax declaration tenant authority cannot be resolved'
      USING ERRCODE = '55000';
  END IF;

  PERFORM public.data_lifecycle_assert_not_held(v_tenant, TG_TABLE_NAME, OLD."id"::text);

  SELECT p."purgeable", p."deleteSemantics"
  INTO v_purgeable, v_semantics
  FROM public."DataRetentionPolicyVersion" p
  WHERE p."entityType" = TG_TABLE_NAME
    AND (p."tenantId" = v_tenant OR p."tenantId" IS NULL)
    AND p."effectiveFrom" <= CURRENT_TIMESTAMP
    AND (p."effectiveTo" IS NULL OR p."effectiveTo" > CURRENT_TIMESTAMP)
  ORDER BY (p."tenantId" IS NOT NULL) DESC, p."effectiveFrom" DESC, p."version" DESC
  LIMIT 1;

  IF COALESCE(v_purgeable, false) = false OR v_semantics IS DISTINCT FROM 'purge' THEN
    RAISE EXCEPTION 'retention policy denies purge for protected lifecycle entity %', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END
$function$;

DO $tax_guard$
BEGIN
  IF to_regclass('public."TaxDeclaration"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public."TaxDeclaration"'::regclass
         AND tgname = 'TaxDeclaration_lifecycle_delete_guard'
         AND NOT tgisinternal
     ) THEN
    CREATE TRIGGER "TaxDeclaration_lifecycle_delete_guard"
    BEFORE DELETE ON public."TaxDeclaration"
    FOR EACH ROW EXECUTE FUNCTION public.data_lifecycle_tax_declaration_delete_guard();
  END IF;
END
$tax_guard$;

-- RETENTION_RISK: SQL-first audit journals cannot use the tenantId lifecycle
-- guard, so parent deletion is made physically fail-closed with RESTRICT.
DO $budgetwallet_fk$
BEGIN
  IF to_regclass('public.budgetwallet_audit_journal') IS NOT NULL
     AND to_regclass('auth.users') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = to_regclass('public.budgetwallet_audit_journal')
         AND conname = 'budgetwallet_audit_journal_owner_id_fkey'
         AND confdeltype = 'c'
     ) THEN
    ALTER TABLE public.budgetwallet_audit_journal
      DROP CONSTRAINT budgetwallet_audit_journal_owner_id_fkey;
    ALTER TABLE public.budgetwallet_audit_journal
      ADD CONSTRAINT budgetwallet_audit_journal_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE RESTRICT NOT VALID;
    ALTER TABLE public.budgetwallet_audit_journal
      VALIDATE CONSTRAINT budgetwallet_audit_journal_owner_id_fkey;
  END IF;
END
$budgetwallet_fk$;

DO $hipico_owner_fk$
BEGIN
  IF to_regclass('public.hipico_audit_events') IS NOT NULL
     AND to_regclass('auth.users') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = to_regclass('public.hipico_audit_events')
         AND conname = 'hipico_audit_events_owner_id_fkey'
         AND confdeltype = 'c'
     ) THEN
    ALTER TABLE public.hipico_audit_events
      DROP CONSTRAINT hipico_audit_events_owner_id_fkey;
    ALTER TABLE public.hipico_audit_events
      ADD CONSTRAINT hipico_audit_events_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE RESTRICT NOT VALID;
    ALTER TABLE public.hipico_audit_events
      VALIDATE CONSTRAINT hipico_audit_events_owner_id_fkey;
  END IF;
END
$hipico_owner_fk$;

DO $hipico_workspace_fk$
BEGIN
  IF to_regclass('public.hipico_audit_events') IS NOT NULL
     AND to_regclass('public.hipico_workspaces') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = to_regclass('public.hipico_audit_events')
         AND conname = 'hipico_audit_events_workspace_id_fkey'
         AND confdeltype = 'c'
     ) THEN
    ALTER TABLE public.hipico_audit_events
      DROP CONSTRAINT hipico_audit_events_workspace_id_fkey;
    ALTER TABLE public.hipico_audit_events
      ADD CONSTRAINT hipico_audit_events_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES public.hipico_workspaces(id) ON DELETE RESTRICT NOT VALID;
    ALTER TABLE public.hipico_audit_events
      VALIDATE CONSTRAINT hipico_audit_events_workspace_id_fkey;
  END IF;
END
$hipico_workspace_fk$;
