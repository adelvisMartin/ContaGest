-- ContaGest issue #635 · backend-only browser grant hardening.
-- Forward-only policy correction for the exact tenant tables observed with stale
-- anon/authenticated DML grants. Future drift is blocked by the v635 catalog gate.
-- SOURCE_REUSE=NONE

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'DataLegalHold',
    'DataLifecycleEvidence',
    'DataLifecycleJob',
    'DataRetentionPolicyVersion',
    'DataStorageObject',
    'FinancialFxBankAccountMap',
    'FinancialFxDocumentSnapshot',
    'FinancialFxEvent',
    'FinancialFxLedgerLineSnapshot',
    'FinancialFxPolicy',
    'FiscalCloseEvidence',
    'FiscalDocumentRuleSnapshot',
    'FiscalRuleVersion',
    'FiscalSequence'
  ]
  LOOP
    IF to_regclass(format('public.%I',table_name)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon',table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated',table_name);
  END LOOP;
END
$$;
