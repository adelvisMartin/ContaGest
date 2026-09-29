-- #628 Ledger lifecycle hardening. Forward-only; no historical rows are rewritten.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."LedgerEntry"
    WHERE "sourceId" IS NOT NULL
    GROUP BY "tenantId", "source", "sourceId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'LEDGER_DUPLICATE_EFFECT';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_tenantId_source_sourceId_key"
  ON public."LedgerEntry" ("tenantId", "source", "sourceId")
  WHERE "sourceId" IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_ledger_entry_period_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE period_status text;
BEGIN
  SELECT cp."status"::text INTO period_status
  FROM public."ClosingPeriod" cp
  WHERE cp."tenantId" = NEW."tenantId" AND cp."period" = NEW."fiscalPeriod"
  FOR SHARE;
  IF period_status = 'closed' THEN
    RAISE EXCEPTION 'PERIOD_CLOSED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "LedgerEntry_period_insert_gate" ON public."LedgerEntry";
CREATE TRIGGER "LedgerEntry_period_insert_gate"
BEFORE INSERT ON public."LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_entry_period_insert();

CREATE OR REPLACE FUNCTION public.guard_ledger_line_period_open()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE source_entry_id text; target_entry_id text; source_status text; target_status text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    source_entry_id := OLD."entryId";
    SELECT cp."status"::text INTO source_status
    FROM public."LedgerEntry" e
    JOIN public."ClosingPeriod" cp ON cp."tenantId" = e."tenantId" AND cp."period" = e."fiscalPeriod"
    WHERE e."id" = source_entry_id FOR SHARE OF cp;
    IF source_status = 'closed' THEN
      RAISE EXCEPTION 'PERIOD_CLOSED' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    target_entry_id := NEW."entryId";
    IF TG_OP = 'INSERT' OR target_entry_id IS DISTINCT FROM source_entry_id THEN
      SELECT cp."status"::text INTO target_status
      FROM public."LedgerEntry" e
      JOIN public."ClosingPeriod" cp ON cp."tenantId" = e."tenantId" AND cp."period" = e."fiscalPeriod"
      WHERE e."id" = target_entry_id FOR SHARE OF cp;
      IF target_status = 'closed' THEN
        RAISE EXCEPTION 'PERIOD_CLOSED' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS "LedgerLine_period_gate" ON public."LedgerLine";
CREATE TRIGGER "LedgerLine_period_gate"
BEFORE INSERT OR UPDATE OR DELETE ON public."LedgerLine"
FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_line_period_open();

CREATE OR REPLACE FUNCTION public.guard_ledger_reversal_compensation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE original_tenant text; original_period text; original_posted boolean;
BEGIN
  IF OLD."posted" IS FALSE AND NEW."posted" IS TRUE AND NEW."reversalOfId" IS NOT NULL THEN
    SELECT e."tenantId", e."fiscalPeriod", e."posted"
    INTO original_tenant, original_period, original_posted
    FROM public."LedgerEntry" e WHERE e."id" = NEW."reversalOfId" FOR SHARE;
    IF original_tenant IS NULL OR original_posted IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'REVERSAL_SOURCE_INVALID' USING ERRCODE = '23514';
    END IF;
    IF original_tenant IS DISTINCT FROM NEW."tenantId" THEN
      RAISE EXCEPTION 'CROSS_TENANT_LEDGER_REFERENCE' USING ERRCODE = '23514';
    END IF;
    IF original_period IS DISTINCT FROM NEW."fiscalPeriod" THEN
      RAISE EXCEPTION 'REVERSAL_SOURCE_INVALID' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public."LedgerLine" WHERE "entryId" = NEW."id")
       OR EXISTS (
         WITH original AS (
           SELECT "accountCode", "currency", COALESCE("exchangeRate", 1::numeric) AS rate,
                  SUM("debit") AS debit, SUM("credit") AS credit
           FROM public."LedgerLine" WHERE "entryId" = NEW."reversalOfId"
           GROUP BY "accountCode", "currency", COALESCE("exchangeRate", 1::numeric)
         ), reversal AS (
           SELECT "accountCode", "currency", COALESCE("exchangeRate", 1::numeric) AS rate,
                  SUM("debit") AS debit, SUM("credit") AS credit
           FROM public."LedgerLine" WHERE "entryId" = NEW."id"
           GROUP BY "accountCode", "currency", COALESCE("exchangeRate", 1::numeric)
         )
         SELECT 1 FROM original o FULL OUTER JOIN reversal r
           ON r."accountCode" = o."accountCode" AND r."currency" = o."currency" AND r.rate = o.rate
         WHERE COALESCE(r.debit, 0) <> COALESCE(o.credit, 0)
            OR COALESCE(r.credit, 0) <> COALESCE(o.debit, 0)
       ) THEN
      RAISE EXCEPTION 'REVERSAL_SOURCE_INVALID' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "LedgerEntry_reversal_compensation_guard" ON public."LedgerEntry";
CREATE TRIGGER "LedgerEntry_reversal_compensation_guard"
BEFORE UPDATE OF "posted", "reversalOfId" ON public."LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_reversal_compensation();
