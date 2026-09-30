-- #683 Implicit Relation FK Hardening
-- Forward-only. Classification comes from the #633 manifest; this migration only
-- hardens the two verified LOCAL_RELATION candidates. No historical rows are repaired.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Fail closed before any DDL if historical references are orphaned or cross-tenant.
DO $$
DECLARE
  orphan_count bigint;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM "BankMovement" child
  LEFT JOIN "LedgerEntry" parent
    ON parent.id = child."ledgerEntryId"
   AND parent."tenantId" = child."tenantId"
  WHERE child."ledgerEntryId" IS NOT NULL
    AND parent.id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE=format('ISSUE_683_ORPHANS:BankMovement.ledgerEntryId:count=%s', orphan_count);
  END IF;

  SELECT count(*) INTO orphan_count
  FROM "CareCommunicationLog" child
  LEFT JOIN "CommunicationTemplate" parent
    ON parent.id = child."templateId"
   AND parent."tenantId" = child."tenantId"
  WHERE child."templateId" IS NOT NULL
    AND parent.id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE=format('ISSUE_683_ORPHANS:CareCommunicationLog.templateId:count=%s', orphan_count);
  END IF;
END $$;

-- #634 must precede #683 and provides the LedgerEntry (tenantId,id) unique key.
DO $$
DECLARE
  has_tenant_key boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid='"LedgerEntry"'::regclass
      AND i.indisunique
      AND i.indisvalid
      AND (
        SELECT array_agg(a.attname ORDER BY u.ord)
        FROM unnest(i.indkey::smallint[]) WITH ORDINALITY u(attnum,ord)
        JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=u.attnum
        WHERE u.attnum>0
      ) = ARRAY['tenantId','id']::text[]
  ) INTO has_tenant_key;
  IF NOT has_tenant_key THEN
    RAISE EXCEPTION 'ISSUE_683_DEPENDENCY_634_MISSING:LedgerEntry(tenantId,id)';
  END IF;
END $$;

-- CommunicationTemplate is not a #634 parent today, so establish the tenant-scoped
-- referenced key explicitly before adding the FK.
CREATE UNIQUE INDEX IF NOT EXISTS "CommunicationTemplate_tenantId_id_ifk_uk"
  ON "CommunicationTemplate" ("tenantId", id);

CREATE INDEX IF NOT EXISTS "BankMovement_tenantId_ledgerEntryId_ifk_idx"
  ON "BankMovement" ("tenantId", "ledgerEntryId");
CREATE INDEX IF NOT EXISTS "CareCommunicationLog_tenantId_templateId_ifk_idx"
  ON "CareCommunicationLog" ("tenantId", "templateId");

ALTER TABLE "BankMovement"
  ADD CONSTRAINT "BankMovement_tenantId_ledgerEntryId_ifk_fk"
  FOREIGN KEY ("tenantId", "ledgerEntryId")
  REFERENCES "LedgerEntry" ("tenantId", id)
  ON DELETE NO ACTION ON UPDATE NO ACTION
  NOT VALID;
ALTER TABLE "BankMovement"
  VALIDATE CONSTRAINT "BankMovement_tenantId_ledgerEntryId_ifk_fk";

ALTER TABLE "CareCommunicationLog"
  ADD CONSTRAINT "CareCommunicationLog_tenantId_templateId_ifk_fk"
  FOREIGN KEY ("tenantId", "templateId")
  REFERENCES "CommunicationTemplate" ("tenantId", id)
  ON DELETE NO ACTION ON UPDATE NO ACTION
  NOT VALID;
ALTER TABLE "CareCommunicationLog"
  VALIDATE CONSTRAINT "CareCommunicationLog_tenantId_templateId_ifk_fk";

COMMIT;
