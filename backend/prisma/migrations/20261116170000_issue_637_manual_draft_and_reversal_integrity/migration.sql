-- #637/#91 forward-only accounting domain repair.
-- Scope: audit-proven, unposted manual draft deletions and exact compensating
-- reversals into an independently OPEN fiscal period.
-- Never alter posted history, ledger amounts, RLS, retention of statutory data,
-- fiscal legal-source snapshots or the anti-cross-tenant guards.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- General lifecycle policy still refuses deletes on AuditLog, fiscal evidence,
-- posted LedgerEntry and other protected entities. The only exception is an
-- unposted, unlinked manual DRAFT with explicit audit evidence written in the
-- SAME transaction before DELETE. A legal hold always takes precedence.
CREATE OR REPLACE FUNCTION public.data_lifecycle_protected_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_purgeable boolean;
  v_semantics text;
BEGIN
  IF TG_TABLE_NAME = 'LedgerEntry' THEN
    IF OLD."posted" IS FALSE
       AND OLD."source" = 'manual'
       AND OLD."postedAt" IS NULL
       AND OLD."postedBy" IS NULL
       AND OLD."reversalOfId" IS NULL
       AND OLD."sourceId" IS NULL
       AND OLD."salesInvoiceId" IS NULL
       AND OLD."purchaseInvoiceId" IS NULL THEN
      -- The API uses the same transaction-level period mutex. Enforce the
      -- close/delete ordering at the database boundary for every caller,
      -- including maintenance scripts with a valid in-transaction audit.
      PERFORM pg_advisory_xact_lock(hashtextextended(
        'cg:ledger-period:v1:' || OLD."tenantId" || ':' || OLD."fiscalPeriod", 0
      ));
      IF EXISTS (
        SELECT 1 FROM public."ClosingPeriod" c
        WHERE c."tenantId" = OLD."tenantId"
          AND c."period" = OLD."fiscalPeriod"
          AND c."module" IN ('accounting', 'all')
          AND c."status" = 'closed'
      ) THEN
        RAISE EXCEPTION 'ACCOUNTING_PERIOD_CLOSED'
          USING ERRCODE = '23514';
      END IF;
      PERFORM public.data_lifecycle_assert_not_held(
        OLD."tenantId"::uuid, TG_TABLE_NAME, OLD."id"::text
      );
      IF NOT EXISTS (
        SELECT 1 FROM public."AuditLog" a
        WHERE a."tenantId" = OLD."tenantId"
          AND a."entity" = 'LedgerEntry'
          AND a."entityId" = OLD."id"
          AND a."action" = 'ledger.entry.draft-deleted'
          AND a."userId" IS NOT NULL
          -- A previously committed audit is not consent to a later deletion.
          -- PostgreSQL 17 stores the inserting transaction XID in xmin (32 bit).
          -- Compare it with the current top-level xid8 modulo 2^32.
          -- This check is fail-closed and does not grant deletion authority
          -- outside the same transaction that wrote the audit.
          AND a.xmin::text =
            (pg_current_xact_id()::text::numeric % 4294967296)::text
      ) THEN
        RAISE EXCEPTION 'LEDGER_DRAFT_DELETE_AUDIT_REQUIRED'
          USING ERRCODE = '42501';
      END IF;
      RETURN OLD;
    END IF;
  END IF;

  IF current_setting('contagest.lifecycle_authorized', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'generic delete denied for protected lifecycle entity %', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.data_lifecycle_assert_not_held(OLD."tenantId"::uuid, TG_TABLE_NAME, OLD."id"::text);

  SELECT p."purgeable", p."deleteSemantics"
  INTO v_purgeable, v_semantics
  FROM public."DataRetentionPolicyVersion" p
  WHERE p."entityType" = TG_TABLE_NAME
    AND (p."tenantId" = OLD."tenantId"::uuid OR p."tenantId" IS NULL)
    AND p."effectiveFrom" <= CURRENT_TIMESTAMP
    AND (p."effectiveTo" IS NULL OR p."effectiveTo" > CURRENT_TIMESTAMP)
  ORDER BY (p."tenantId" IS NOT NULL) DESC, p."effectiveFrom" DESC, p."version" DESC
  LIMIT 1;

  IF COALESCE(v_purgeable, false) = false OR v_semantics IS DISTINCT FROM 'purge' THEN
    RAISE EXCEPTION 'retention policy denies purge for protected lifecycle entity %', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;

-- The original amount/currency/FX compensation is checked inside one
-- transaction, against the original POSTED ledger and the exact inverse
-- lines. A reversal need not re-open the origin fiscal period: writing to a
-- new OPEN period is the supported correction after the source is closed.
-- LedgerEntry_period_insert_gate and the posting-period gate still reject
-- an entry posted in a closed target period.
CREATE OR REPLACE FUNCTION public.guard_ledger_reversal_compensation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  original_tenant text;
  original_posted boolean;
BEGIN
  IF OLD."posted" IS FALSE AND NEW."posted" IS TRUE AND NEW."reversalOfId" IS NOT NULL THEN
    SELECT e."tenantId", e."posted"
    INTO original_tenant, original_posted
    FROM public."LedgerEntry" e WHERE e."id" = NEW."reversalOfId" FOR SHARE;
    IF original_tenant IS NULL OR original_posted IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'REVERSAL_SOURCE_INVALID' USING ERRCODE = '23514';
    END IF;
    IF original_tenant IS DISTINCT FROM NEW."tenantId" THEN
      RAISE EXCEPTION 'CROSS_TENANT_LEDGER_REFERENCE' USING ERRCODE = '23514';
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
