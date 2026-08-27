-- Issue #91: formal ledger posting lifecycle and immutable posted history.
-- This migration is additive and intentionally does not guess whether legacy posted=false rows are drafts.

ALTER TABLE "LedgerEntry"
  ADD COLUMN IF NOT EXISTS "postedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "postedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "reversalOfId" TEXT;

-- Historical rows that were already explicitly posted keep their original content;
-- only the missing posting timestamp is reconstructed from createdAt. Actor remains NULL
-- when historical evidence does not exist.
UPDATE "LedgerEntry"
SET "postedAt" = COALESCE("postedAt", "createdAt")
WHERE "posted" = TRUE AND "postedAt" IS NULL;

DO $$
DECLARE
  ambiguous_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO ambiguous_count
  FROM "LedgerEntry"
  WHERE "posted" = FALSE
    AND "source" IN ('sales'::"LedgerSource", 'purchase'::"LedgerSource");
  RAISE NOTICE 'issue_91_ambiguous_operational_ledger_rows=% (left unchanged; see backfill runbook)', ambiguous_count;
END $$;

ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_reversalOfId_key" UNIQUE ("reversalOfId");

ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_reversalOfId_fkey"
  FOREIGN KEY ("reversalOfId") REFERENCES "LedgerEntry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_posted_metadata_check"
  CHECK (
    ("posted" = FALSE AND "postedAt" IS NULL)
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
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD."posted" = TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'ledger_posted_immutable',
      DETAIL = 'A posted LedgerEntry cannot be updated, deleted, or returned to draft; use a reversal/adjustment.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW."posted" = TRUE AND NEW."postedAt" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ledger_posted_requires_posted_at';
  END IF;

  IF NEW."posted" = FALSE AND NEW."postedAt" IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ledger_draft_cannot_have_posted_at';
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

    IF NEW."posted" IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ledger_reversal_must_be_posted';
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
