\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_database() !~ '_v91$' THEN
    RAISE EXCEPTION 'ledger_v91_tests_require_disposable_database: %', current_database();
  END IF;
END $$;

BEGIN;

INSERT INTO "Tenant" ("id","rif","name") VALUES
  ('qa91-tenant-a','J-91000001-1','QA Ledger 91 A'),
  ('qa91-tenant-b','J-91000002-2','QA Ledger 91 B');

-- Direct INSERT as POSTED is prohibited: lines must exist before the state transition.
DO $$
BEGIN
  BEGIN
    INSERT INTO "LedgerEntry" ("id","tenantId","fiscalPeriod","description","source","posted","postedAt")
    VALUES ('qa91-direct-posted','qa91-tenant-a','2099-01','invalid direct posted','manual',TRUE,now());
    RAISE EXCEPTION 'expected_direct_posted_insert_rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'ledger_posted_requires_transition' THEN RAISE; END IF;
  END;
END $$;

-- Build a valid draft, then perform the only allowed DRAFT -> POSTED transition.
INSERT INTO "LedgerEntry" ("id","tenantId","fiscalPeriod","description","source","posted")
VALUES ('qa91-original-a','qa91-tenant-a','2099-01','Original QA 91','manual',FALSE);
INSERT INTO "LedgerLine" ("id","entryId","accountCode","accountName","debit","credit") VALUES
  ('qa91-original-a-d','qa91-original-a','1.1','Caja',10.00,0.00),
  ('qa91-original-a-c','qa91-original-a','4.1','Ingreso',0.00,10.00);
UPDATE "LedgerEntry" SET "posted"=TRUE,"postedAt"=now(),"postedBy"='qa91-actor' WHERE "id"='qa91-original-a';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "LedgerEntry" WHERE "id"='qa91-original-a' AND "posted"=TRUE AND "postedAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'qa91_post_transition_failed';
  END IF;
END $$;

-- Header of a posted entry is immutable.
DO $$
BEGIN
  BEGIN
    UPDATE "LedgerEntry" SET "description"='tampered' WHERE "id"='qa91-original-a';
    RAISE EXCEPTION 'expected_posted_update_rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'ledger_posted_immutable' THEN RAISE; END IF;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    DELETE FROM "LedgerEntry" WHERE "id"='qa91-original-a';
    RAISE EXCEPTION 'expected_posted_delete_rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'ledger_posted_immutable' THEN RAISE; END IF;
  END;
END $$;

-- Lines of a posted entry are immutable in every direction.
DO $$
BEGIN
  BEGIN
    UPDATE "LedgerLine" SET "debit"=11.00 WHERE "id"='qa91-original-a-d';
    RAISE EXCEPTION 'expected_posted_line_update_rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'ledger_posted_line_immutable' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM "LedgerLine" WHERE "id"='qa91-original-a-d';
    RAISE EXCEPTION 'expected_posted_line_delete_rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'ledger_posted_line_immutable' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO "LedgerLine" ("id","entryId","accountCode","accountName","debit","credit")
    VALUES ('qa91-late-line','qa91-original-a','9.9','Late line',0,0);
    RAISE EXCEPTION 'expected_posted_line_insert_rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'ledger_posted_line_immutable' THEN RAISE; END IF;
  END;
END $$;

-- Unbalanced draft cannot become POSTED even through direct SQL.
INSERT INTO "LedgerEntry" ("id","tenantId","fiscalPeriod","description","source","posted")
VALUES ('qa91-unbalanced','qa91-tenant-a','2099-01','Unbalanced','manual',FALSE);
INSERT INTO "LedgerLine" ("id","entryId","accountCode","accountName","debit","credit") VALUES
  ('qa91-unbalanced-d','qa91-unbalanced','1.1','Caja',10.00,0.00),
  ('qa91-unbalanced-c','qa91-unbalanced','4.1','Ingreso',0.00,9.00);
DO $$
BEGIN
  BEGIN
    UPDATE "LedgerEntry" SET "posted"=TRUE,"postedAt"=now() WHERE "id"='qa91-unbalanced';
    RAISE EXCEPTION 'expected_unbalanced_posting_rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'ledger_unbalanced_posting' THEN RAISE; END IF;
  END;
END $$;

-- A valid same-tenant reversal is another balanced entry, linked to the immutable original.
INSERT INTO "LedgerEntry" ("id","tenantId","fiscalPeriod","description","source","sourceId","posted")
VALUES ('qa91-reversal-a','qa91-tenant-a','2099-02','Reversal QA 91','manual','ledger-reversal:qa91-original-a',FALSE);
INSERT INTO "LedgerLine" ("id","entryId","accountCode","accountName","debit","credit") VALUES
  ('qa91-reversal-a-d','qa91-reversal-a','1.1','Caja',0.00,10.00),
  ('qa91-reversal-a-c','qa91-reversal-a','4.1','Ingreso',10.00,0.00);
UPDATE "LedgerEntry"
SET "posted"=TRUE,"postedAt"=now(),"postedBy"='qa91-actor',"reversalOfId"='qa91-original-a'
WHERE "id"='qa91-reversal-a';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "LedgerEntry"
    WHERE "id"='qa91-reversal-a' AND "posted"=TRUE AND "reversalOfId"='qa91-original-a'
  ) THEN RAISE EXCEPTION 'qa91_reversal_relation_missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "LedgerEntry"
    WHERE "id"='qa91-original-a' AND "description"='Original QA 91' AND "posted"=TRUE
  ) THEN RAISE EXCEPTION 'qa91_original_changed_after_reversal'; END IF;
END $$;

-- A second direct reversal is rejected by the one-to-one relationship.
INSERT INTO "LedgerEntry" ("id","tenantId","fiscalPeriod","description","source","posted")
VALUES ('qa91-second-reversal','qa91-tenant-a','2099-02','Second reversal','manual',FALSE);
INSERT INTO "LedgerLine" ("id","entryId","accountCode","accountName","debit","credit") VALUES
  ('qa91-second-reversal-d','qa91-second-reversal','1.1','Caja',0.00,10.00),
  ('qa91-second-reversal-c','qa91-second-reversal','4.1','Ingreso',10.00,0.00);
DO $$
BEGIN
  BEGIN
    UPDATE "LedgerEntry"
    SET "posted"=TRUE,"postedAt"=now(),"reversalOfId"='qa91-original-a'
    WHERE "id"='qa91-second-reversal';
    RAISE EXCEPTION 'expected_second_reversal_rejection';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

-- Reversing a reversal is explicitly prohibited.
INSERT INTO "LedgerEntry" ("id","tenantId","fiscalPeriod","description","source","posted")
VALUES ('qa91-reversal-chain','qa91-tenant-a','2099-02','Reversal chain','manual',FALSE);
INSERT INTO "LedgerLine" ("id","entryId","accountCode","accountName","debit","credit") VALUES
  ('qa91-reversal-chain-d','qa91-reversal-chain','1.1','Caja',10.00,0.00),
  ('qa91-reversal-chain-c','qa91-reversal-chain','4.1','Ingreso',0.00,10.00);
DO $$
BEGIN
  BEGIN
    UPDATE "LedgerEntry"
    SET "posted"=TRUE,"postedAt"=now(),"reversalOfId"='qa91-reversal-a'
    WHERE "id"='qa91-reversal-chain';
    RAISE EXCEPTION 'expected_reversal_chain_rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'ledger_reversal_chain_not_allowed' THEN RAISE; END IF;
  END;
END $$;

-- Tenant A cannot be referenced by a reversal in tenant B.
INSERT INTO "LedgerEntry" ("id","tenantId","fiscalPeriod","description","source","posted")
VALUES ('qa91-cross-tenant','qa91-tenant-b','2099-02','Cross tenant reversal','manual',FALSE);
INSERT INTO "LedgerLine" ("id","entryId","accountCode","accountName","debit","credit") VALUES
  ('qa91-cross-tenant-d','qa91-cross-tenant','1.1','Caja',0.00,10.00),
  ('qa91-cross-tenant-c','qa91-cross-tenant','4.1','Ingreso',10.00,0.00);
DO $$
BEGIN
  BEGIN
    UPDATE "LedgerEntry"
    SET "posted"=TRUE,"postedAt"=now(),"reversalOfId"='qa91-original-a'
    WHERE "id"='qa91-cross-tenant';
    RAISE EXCEPTION 'expected_cross_tenant_reversal_rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'ledger_reversal_cross_tenant' THEN RAISE; END IF;
  END;
END $$;

-- Closed period remains a second independent DB gate.
INSERT INTO "ClosingPeriod" ("id","tenantId","period","module","status")
VALUES ('qa91-closed-period','qa91-tenant-a','2099-12','accounting','closed');
INSERT INTO "LedgerEntry" ("id","tenantId","fiscalPeriod","description","source","posted")
VALUES ('qa91-closed-draft','qa91-tenant-a','2099-12','Closed period draft','manual',FALSE);
INSERT INTO "LedgerLine" ("id","entryId","accountCode","accountName","debit","credit") VALUES
  ('qa91-closed-draft-d','qa91-closed-draft','1.1','Caja',5.00,0.00),
  ('qa91-closed-draft-c','qa91-closed-draft','4.1','Ingreso',0.00,5.00);
DO $$
BEGIN
  BEGIN
    UPDATE "LedgerEntry" SET "posted"=TRUE,"postedAt"=now() WHERE "id"='qa91-closed-draft';
    RAISE EXCEPTION 'expected_closed_period_rejection';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'ledger_period_closed' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Tenant" WHERE "id" IN ('qa91-tenant-a','qa91-tenant-b')) THEN
    RAISE EXCEPTION 'qa91_transaction_cleanup_failed';
  END IF;
END $$;
