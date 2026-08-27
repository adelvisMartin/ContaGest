-- Issue #91: formal ledger posting lifecycle and immutable posted history.
-- Additive migration with fail-closed preflight for ambiguous legacy accounting rows.
-- A production operator must run the documented backup/preflight procedure before deploy.

-- PRE-FLIGHT 1: every ledger row already marked posted must be structurally balanced.
DO $$
DECLARE
  invalid_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM (
    SELECT le."id"
    FROM "LedgerEntry" le
    LEFT JOIN "LedgerLine" ll ON ll."entryId" = le."id"
    WHERE le."posted" = TRUE
    GROUP BY le."id"
    HAVING COUNT(ll."id") < 2
       OR COALESCE(SUM(ll."debit"), 0) <> COALESCE(SUM(ll."credit"), 0)
       OR COUNT(*) FILTER (WHERE ll."debit" < 0 OR ll."credit" < 0 OR (ll."debit" <> 0 AND ll."credit" <> 0)) > 0
  ) invalid_posted;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'issue_91_existing_posted_entries_invalid',
      DETAIL = format('%s already-posted entries are empty, unbalanced, negative, or contain debit+credit on one line. Resolve before migration.', invalid_count);
  END IF;
END $$;

-- PRE-FLIGHT 2: only clearly issued/current sales and purchases are safe for automatic backfill.
-- Draft, cancelled, orphaned, duplicated or otherwise ambiguous operational ledger rows stop the migration.
DO $$
DECLARE
  ambiguous_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO ambiguous_count
  FROM "LedgerEntry" le
  WHERE le."posted" = FALSE
    AND le."source" = 'sales'::"LedgerSource"
    AND NOT EXISTS (
      SELECT 1
      FROM "SalesInvoice" s
      WHERE s."tenantId" = le."tenantId"
        AND s."status" IN ('issued'::"InvoiceStatus", 'paid'::"InvoiceStatus", 'overdue'::"InvoiceStatus")
        AND (s."id" = le."salesInvoiceId" OR (le."salesInvoiceId" IS NULL AND s."id" = le."sourceId"))
    );

  SELECT ambiguous_count + COUNT(*) INTO ambiguous_count
  FROM "LedgerEntry" le
  WHERE le."posted" = FALSE
    AND le."source" = 'purchase'::"LedgerSource"
    AND NOT EXISTS (
      SELECT 1
      FROM "PurchaseInvoice" p
      WHERE p."tenantId" = le."tenantId"
        AND p."status" IN ('issued'::"InvoiceStatus", 'paid'::"InvoiceStatus", 'overdue'::"InvoiceStatus")
        AND (p."id" = le."purchaseInvoiceId" OR (le."purchaseInvoiceId" IS NULL AND p."id" = le."sourceId"))
    );

  -- Old cancellation reversals were manual rows linked to the invoice. A false row here
  -- cannot be inferred safely without reviewing the original/reversal pair.
  SELECT ambiguous_count + COUNT(*) INTO ambiguous_count
  FROM "LedgerEntry" le
  WHERE le."posted" = FALSE
    AND le."source" = 'manual'::"LedgerSource"
    AND (
      (le."salesInvoiceId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "SalesInvoice" s
        WHERE s."id" = le."salesInvoiceId" AND s."tenantId" = le."tenantId" AND s."status" = 'cancelled'::"InvoiceStatus"
      ))
      OR
      (le."purchaseInvoiceId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "PurchaseInvoice" p
        WHERE p."id" = le."purchaseInvoiceId" AND p."tenantId" = le."tenantId" AND p."status" = 'cancelled'::"InvoiceStatus"
      ))
      OR le."sourceId" LIKE 'sales-cancel:%'
      OR le."sourceId" LIKE 'purchase-cancel:%'
    );

  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'issue_91_ambiguous_legacy_ledger_rows',
      DETAIL = format('%s legacy operational rows require explicit classification. Run docs/RUNBOOK_LEDGER_REVERSALS_BACKFILL_V91.md before retrying.', ambiguous_count);
  END IF;
END $$;

-- PRE-FLIGHT 3: safe operational candidates must also balance before they are marked posted.
DO $$
DECLARE
  invalid_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM (
    SELECT le."id"
    FROM "LedgerEntry" le
    JOIN "SalesInvoice" s
      ON s."tenantId" = le."tenantId"
     AND (s."id" = le."salesInvoiceId" OR (le."salesInvoiceId" IS NULL AND s."id" = le."sourceId"))
    LEFT JOIN "LedgerLine" ll ON ll."entryId" = le."id"
    WHERE le."posted" = FALSE
      AND le."source" = 'sales'::"LedgerSource"
      AND s."status" IN ('issued'::"InvoiceStatus", 'paid'::"InvoiceStatus", 'overdue'::"InvoiceStatus")
    GROUP BY le."id"
    HAVING COUNT(ll."id") < 2
       OR COALESCE(SUM(ll."debit"), 0) <> COALESCE(SUM(ll."credit"), 0)
       OR COUNT(*) FILTER (WHERE ll."debit" < 0 OR ll."credit" < 0 OR (ll."debit" <> 0 AND ll."credit" <> 0)) > 0

    UNION ALL

    SELECT le."id"
    FROM "LedgerEntry" le
    JOIN "PurchaseInvoice" p
      ON p."tenantId" = le."tenantId"
     AND (p."id" = le."purchaseInvoiceId" OR (le."purchaseInvoiceId" IS NULL AND p."id" = le."sourceId"))
    LEFT JOIN "LedgerLine" ll ON ll."entryId" = le."id"
    WHERE le."posted" = FALSE
      AND le."source" = 'purchase'::"LedgerSource"
      AND p."status" IN ('issued'::"InvoiceStatus", 'paid'::"InvoiceStatus", 'overdue'::"InvoiceStatus")
    GROUP BY le."id"
    HAVING COUNT(ll."id") < 2
       OR COALESCE(SUM(ll."debit"), 0) <> COALESCE(SUM(ll."credit"), 0)
       OR COUNT(*) FILTER (WHERE ll."debit" < 0 OR ll."credit" < 0 OR (ll."debit" <> 0 AND ll."credit" <> 0)) > 0
  ) invalid_candidates;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'issue_91_backfill_candidate_unbalanced',
      DETAIL = format('%s operational entries cannot be backfilled because their lines are invalid.', invalid_count);
  END IF;
END $$;

ALTER TABLE "LedgerEntry"
  ADD COLUMN IF NOT EXISTS "postedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "postedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "reversalOfId" TEXT;

-- Existing explicitly-posted history keeps its original content. The only reconstructed
-- metadata is postedAt=createdAt; postedBy stays NULL because no historical actor evidence exists.
UPDATE "LedgerEntry"
SET "postedAt" = COALESCE("postedAt", "createdAt")
WHERE "posted" = TRUE AND "postedAt" IS NULL;

-- Deterministic legacy backfill: current non-draft/non-cancelled sales/purchases that already
-- have a balanced ledger entry are accounting effects, not user-editable drafts.
UPDATE "LedgerEntry" le
SET "posted" = TRUE,
    "postedAt" = COALESCE(le."postedAt", le."createdAt")
FROM "SalesInvoice" s
WHERE le."posted" = FALSE
  AND le."source" = 'sales'::"LedgerSource"
  AND s."tenantId" = le."tenantId"
  AND s."status" IN ('issued'::"InvoiceStatus", 'paid'::"InvoiceStatus", 'overdue'::"InvoiceStatus")
  AND (s."id" = le."salesInvoiceId" OR (le."salesInvoiceId" IS NULL AND s."id" = le."sourceId"));

UPDATE "LedgerEntry" le
SET "posted" = TRUE,
    "postedAt" = COALESCE(le."postedAt", le."createdAt")
FROM "PurchaseInvoice" p
WHERE le."posted" = FALSE
  AND le."source" = 'purchase'::"LedgerSource"
  AND p."tenantId" = le."tenantId"
  AND p."status" IN ('issued'::"InvoiceStatus", 'paid'::"InvoiceStatus", 'overdue'::"InvoiceStatus")
  AND (p."id" = le."purchaseInvoiceId" OR (le."purchaseInvoiceId" IS NULL AND p."id" = le."sourceId"));

ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_reversalOfId_key" UNIQUE ("reversalOfId");

ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_reversalOfId_fkey"
  FOREIGN KEY ("reversalOfId") REFERENCES "LedgerEntry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_posted_metadata_check"
  CHECK (
    ("posted" = FALSE AND "postedAt" IS NULL AND "postedBy" IS NULL AND "reversalOfId" IS NULL)
    OR ("posted" = TRUE AND "postedAt" IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS "LedgerEntry_tenantId_source_sourceId_idx"
  ON "LedgerEntry"("tenantId", "source", "sourceId");
CREATE INDEX IF NOT EXISTS "LedgerEntry_tenantId_reversalOfId_idx"
  ON "LedgerEntry"("tenantId", "reversalOfId");
CREATE INDEX IF NOT EXISTS "LedgerEntry_tenantId_posted_fiscalPeriod_idx"
  ON "LedgerEntry"("tenantId", "posted", "fiscalPeriod");

CREATE OR REPLACE FUNCTION public.guard_ledger_entry_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  original_tenant TEXT;
  original_posted BOOLEAN;
  original_reversal_of TEXT;
  line_count BIGINT;
  invalid_line_count BIGINT;
  total_debit NUMERIC;
  total_credit NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."posted" = TRUE THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'ledger_posted_requires_transition',
        DETAIL = 'Create the entry and its lines as DRAFT, then post it in the same transaction.';
    END IF;
    IF NEW."postedAt" IS NOT NULL OR NEW."postedBy" IS NOT NULL OR NEW."reversalOfId" IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ledger_draft_has_posting_metadata';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."posted" = TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ledger_posted_immutable',
      DETAIL = 'A posted LedgerEntry cannot be updated or deleted; use a reversal/adjustment.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW."posted" = FALSE THEN
    IF NEW."postedAt" IS NOT NULL OR NEW."postedBy" IS NOT NULL OR NEW."reversalOfId" IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ledger_draft_has_posting_metadata';
    END IF;
    RETURN NEW;
  END IF;

  -- The only state transition from a draft is DRAFT -> POSTED.
  IF NEW."postedAt" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ledger_posted_requires_posted_at';
  END IF;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE "debit" < 0 OR "credit" < 0 OR ("debit" <> 0 AND "credit" <> 0)),
         COALESCE(SUM("debit"), 0),
         COALESCE(SUM("credit"), 0)
    INTO line_count, invalid_line_count, total_debit, total_credit
  FROM "LedgerLine"
  WHERE "entryId" = NEW."id";

  IF line_count < 2 OR invalid_line_count > 0 OR total_debit <> total_credit THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ledger_unbalanced_posting',
      DETAIL = format('lines=%s invalid_lines=%s debit=%s credit=%s', line_count, invalid_line_count, total_debit, total_credit);
  END IF;

  IF NEW."reversalOfId" IS NOT NULL THEN
    IF NEW."reversalOfId" = NEW."id" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ledger_reversal_self_reference';
    END IF;

    SELECT "tenantId", "posted", "reversalOfId"
      INTO original_tenant, original_posted, original_reversal_of
    FROM "LedgerEntry"
    WHERE "id" = NEW."reversalOfId";

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'ledger_reversal_original_not_found';
    END IF;
    IF original_tenant <> NEW."tenantId" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ledger_reversal_cross_tenant';
    END IF;
    IF original_posted IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ledger_reversal_original_not_posted';
    END IF;
    IF original_reversal_of IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ledger_reversal_chain_not_allowed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "LedgerEntry_lifecycle_guard" ON "LedgerEntry";
CREATE TRIGGER "LedgerEntry_lifecycle_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_entry_lifecycle();

CREATE OR REPLACE FUNCTION public.guard_posted_ledger_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_id TEXT;
  parent_posted BOOLEAN;
BEGIN
  parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."entryId" ELSE NEW."entryId" END;

  SELECT "posted" INTO parent_posted
  FROM "LedgerEntry"
  WHERE "id" = parent_id;

  IF parent_posted = TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ledger_posted_line_immutable',
      DETAIL = 'Lines belonging to a posted LedgerEntry cannot be inserted, updated, moved, or deleted.';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW."entryId" IS DISTINCT FROM OLD."entryId" THEN
    SELECT "posted" INTO parent_posted
    FROM "LedgerEntry"
    WHERE "id" = OLD."entryId";
    IF parent_posted = TRUE THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ledger_posted_line_immutable';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS "LedgerLine_posted_guard" ON "LedgerLine";
CREATE TRIGGER "LedgerLine_posted_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "LedgerLine"
FOR EACH ROW EXECUTE FUNCTION public.guard_posted_ledger_line_mutation();
