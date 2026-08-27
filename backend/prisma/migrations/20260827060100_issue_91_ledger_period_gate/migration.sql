-- Issue #91: closed periods remain an independent gate in PostgreSQL.
-- The API performs the same domain check; this trigger protects direct DB paths.

CREATE OR REPLACE FUNCTION public.guard_ledger_posting_period_open()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."posted" = FALSE AND NEW."posted" = TRUE THEN
    IF EXISTS (
      SELECT 1
      FROM "ClosingPeriod" cp
      WHERE cp."tenantId" = NEW."tenantId"
        AND cp."period" = NEW."fiscalPeriod"
        AND cp."status" = 'closed'
        AND cp."module" IN ('accounting', 'all')
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'ledger_period_closed',
        DETAIL = format('Posting is not allowed for closed accounting period %s.', NEW."fiscalPeriod");
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "LedgerEntry_period_gate" ON "LedgerEntry";
CREATE TRIGGER "LedgerEntry_period_gate"
BEFORE UPDATE OF "posted", "fiscalPeriod" ON "LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_posting_period_open();
