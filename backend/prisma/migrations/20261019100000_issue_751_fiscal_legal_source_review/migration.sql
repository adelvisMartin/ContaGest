-- #751: evidence review is independent of rule activation. Existing captures
-- remain DRAFT; historical fiscal snapshots and tax rates are untouched.
ALTER TABLE public."FiscalLegalSource"
  DROP CONSTRAINT "FiscalLegalSource_status_check";

ALTER TABLE public."FiscalLegalSource"
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMPTZ,
  ADD COLUMN "reviewReason" VARCHAR(500),
  ADD CONSTRAINT "FiscalLegalSource_review_state_check" CHECK (
    ("status" = 'DRAFT' AND "reviewedBy" IS NULL AND "reviewedAt" IS NULL AND "reviewReason" IS NULL)
    OR
    ("status" IN ('REVIEWED', 'REJECTED') AND "reviewedBy" IS NOT NULL
      AND length(btrim("reviewedBy")) > 0 AND "reviewedAt" IS NOT NULL
      AND "reviewReason" IS NOT NULL AND length(btrim("reviewReason")) >= 15)
  ),
  ADD CONSTRAINT "FiscalLegalSource_independent_reviewer_check"
    CHECK ("reviewedBy" IS NULL OR "reviewedBy" <> "createdBy");

CREATE INDEX "FiscalLegalSource_tenant_reviewed_idx"
  ON public."FiscalLegalSource" ("tenantId", "reviewedAt" DESC)
  WHERE "status" = 'REVIEWED';

-- Runtime is still unable to delete captures or rewrite provenance fields.
-- The v845 sidecar policy enforces tenant scoping for every update.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'contagest_runtime') THEN
    GRANT UPDATE ("status", "reviewedBy", "reviewedAt", "reviewReason")
      ON public."FiscalLegalSource" TO contagest_runtime;
  END IF;
END $$;
