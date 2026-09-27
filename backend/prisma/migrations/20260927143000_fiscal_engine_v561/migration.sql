-- #561 · Versioned fiscal rules, concurrent numbering and auditable period close.
-- Forward-only sidecar: historical business rows are never reinterpreted or rewritten.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "FiscalRuleVersion" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMPTZ NOT NULL,
  "effectiveTo" TIMESTAMPTZ,
  "source" TEXT NOT NULL,
  "documentation" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdBy" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "FiscalRuleVersion_version_check" CHECK ("version" > 0),
  CONSTRAINT "FiscalRuleVersion_window_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  CONSTRAINT "FiscalRuleVersion_provenance_check" CHECK (length(btrim("source")) > 0 AND length(btrim("documentation")) > 0),
  CONSTRAINT "FiscalRuleVersion_tenant_code_version_key" UNIQUE ("tenantId", "code", "version")
);
CREATE INDEX "FiscalRuleVersion_lookup_idx"
  ON "FiscalRuleVersion"("tenantId", "code", "effectiveFrom" DESC);

CREATE OR REPLACE FUNCTION contagest_fiscal_rule_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "FiscalRuleVersion" r
    WHERE r."tenantId" = NEW."tenantId"
      AND r."code" = NEW."code"
      AND r."id" <> NEW."id"
      AND tstzrange(r."effectiveFrom", r."effectiveTo", '[)')
          && tstzrange(NEW."effectiveFrom", NEW."effectiveTo", '[)')
  ) THEN
    RAISE EXCEPTION 'fiscal rule validity windows overlap for tenant/code'
      USING ERRCODE = '23514';
  END IF;

  NEW."contentHash" := encode(
    digest(
      convert_to(
        jsonb_build_object(
          'tenantId', NEW."tenantId",
          'code', NEW."code",
          'version', NEW."version",
          'effectiveFrom', NEW."effectiveFrom",
          'effectiveTo', NEW."effectiveTo",
          'source', NEW."source",
          'documentation', NEW."documentation",
          'payload', NEW."payload"
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END $$;

CREATE TRIGGER "FiscalRuleVersion_guard_trg"
BEFORE INSERT OR UPDATE ON "FiscalRuleVersion"
FOR EACH ROW EXECUTE FUNCTION contagest_fiscal_rule_guard();

CREATE TABLE "FiscalSequence" (
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "documentType" TEXT NOT NULL,
  "series" TEXT NOT NULL DEFAULT 'DEFAULT',
  "prefix" TEXT NOT NULL DEFAULT '',
  "width" SMALLINT NOT NULL DEFAULT 8,
  "nextValue" BIGINT NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("tenantId", "documentType", "series"),
  CONSTRAINT "FiscalSequence_width_check" CHECK ("width" BETWEEN 1 AND 18),
  CONSTRAINT "FiscalSequence_next_check" CHECK ("nextValue" > 0)
);

CREATE TABLE "FiscalNumberReservation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "documentType" TEXT NOT NULL,
  "series" TEXT NOT NULL DEFAULT 'DEFAULT',
  "idempotencyKey" TEXT NOT NULL,
  "sequenceValue" BIGINT NOT NULL,
  "allocatedNumber" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'allocated',
  "documentId" UUID,
  "allocatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "cancelledAt" TIMESTAMPTZ,
  CONSTRAINT "FiscalNumberReservation_status_check" CHECK ("status" IN ('allocated', 'bound', 'cancelled')),
  CONSTRAINT "FiscalNumberReservation_idempotency_key" UNIQUE ("tenantId", "documentType", "series", "idempotencyKey"),
  CONSTRAINT "FiscalNumberReservation_number_key" UNIQUE ("tenantId", "documentType", "series", "sequenceValue"),
  CONSTRAINT "FiscalNumberReservation_rendered_key" UNIQUE ("tenantId", "documentType", "series", "allocatedNumber")
);

CREATE OR REPLACE FUNCTION allocate_fiscal_number(
  p_tenant UUID,
  p_document_type TEXT,
  p_series TEXT,
  p_idempotency_key TEXT
) RETURNS TABLE("reservationId" UUID, "sequenceValue" BIGINT, "allocatedNumber" TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_existing "FiscalNumberReservation"%ROWTYPE;
  v_seq "FiscalSequence"%ROWTYPE;
  v_value BIGINT;
  v_number TEXT;
BEGIN
  p_document_type := btrim(coalesce(p_document_type, ''));
  p_series := coalesce(nullif(btrim(p_series), ''), 'DEFAULT');
  p_idempotency_key := btrim(coalesce(p_idempotency_key, ''));

  IF p_document_type = '' OR p_idempotency_key = '' THEN
    RAISE EXCEPTION 'document type and idempotency key are required' USING ERRCODE = '22023';
  END IF;

  -- Same request key is serialized before reading the reservation. This prevents
  -- two retries from consuming two sequence values while still returning one row.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(concat_ws('|', p_tenant::text, p_document_type, p_series, p_idempotency_key), 0)
  );

  SELECT * INTO v_existing
  FROM "FiscalNumberReservation"
  WHERE "tenantId" = p_tenant
    AND "documentType" = p_document_type
    AND "series" = p_series
    AND "idempotencyKey" = p_idempotency_key;

  IF FOUND THEN
    RETURN QUERY SELECT v_existing."id", v_existing."sequenceValue", v_existing."allocatedNumber";
    RETURN;
  END IF;

  INSERT INTO "FiscalSequence"("tenantId", "documentType", "series")
  VALUES (p_tenant, p_document_type, p_series)
  ON CONFLICT ("tenantId", "documentType", "series") DO NOTHING;

  UPDATE "FiscalSequence"
  SET "nextValue" = "nextValue" + 1,
      "updatedAt" = NOW()
  WHERE "tenantId" = p_tenant
    AND "documentType" = p_document_type
    AND "series" = p_series
  RETURNING * INTO v_seq;

  v_value := v_seq."nextValue" - 1;
  v_number := v_seq."prefix" || lpad(v_value::text, v_seq."width", '0');

  INSERT INTO "FiscalNumberReservation"(
    "tenantId", "documentType", "series", "idempotencyKey", "sequenceValue", "allocatedNumber"
  ) VALUES (
    p_tenant, p_document_type, p_series, p_idempotency_key, v_value, v_number
  )
  RETURNING "id" INTO "reservationId";

  "sequenceValue" := v_value;
  "allocatedNumber" := v_number;
  RETURN NEXT;
END $$;

CREATE TABLE "FiscalDocumentRuleSnapshot" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "documentType" TEXT NOT NULL,
  "documentId" UUID NOT NULL,
  "ruleCode" TEXT NOT NULL,
  "ruleVersion" INTEGER NOT NULL,
  "ruleId" UUID NOT NULL REFERENCES "FiscalRuleVersion"("id") ON DELETE RESTRICT,
  "ruleHash" TEXT NOT NULL,
  "rulePayload" JSONB NOT NULL,
  "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "FiscalDocumentRuleSnapshot_key" UNIQUE ("tenantId", "documentType", "documentId", "ruleCode")
);

CREATE OR REPLACE FUNCTION contagest_fiscal_snapshot_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'fiscal rule snapshots are immutable' USING ERRCODE = '55000';
END $$;

CREATE TRIGGER "FiscalDocumentRuleSnapshot_immutable_trg"
BEFORE UPDATE OR DELETE ON "FiscalDocumentRuleSnapshot"
FOR EACH ROW EXECUTE FUNCTION contagest_fiscal_snapshot_immutable();

CREATE TABLE "FiscalCloseEvidence" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "period" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "closedBy" UUID,
  "prechecks" JSONB NOT NULL,
  "postchecks" JSONB NOT NULL,
  "evidenceHash" TEXT NOT NULL,
  "closedAt" TIMESTAMPTZ NOT NULL,
  "reopenedAt" TIMESTAMPTZ,
  "reopenedBy" UUID,
  "reopenAuthorizationRef" TEXT,
  "reopenReason" TEXT,
  CONSTRAINT "FiscalCloseEvidence_close_key" UNIQUE ("tenantId", "period", "module", "closedAt")
);

CREATE OR REPLACE FUNCTION contagest_close_evidence_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fiscal close evidence cannot be deleted' USING ERRCODE = '55000';
  END IF;

  IF OLD."tenantId" IS DISTINCT FROM NEW."tenantId"
    OR OLD."period" IS DISTINCT FROM NEW."period"
    OR OLD."module" IS DISTINCT FROM NEW."module"
    OR OLD."closedBy" IS DISTINCT FROM NEW."closedBy"
    OR OLD."prechecks" IS DISTINCT FROM NEW."prechecks"
    OR OLD."postchecks" IS DISTINCT FROM NEW."postchecks"
    OR OLD."evidenceHash" IS DISTINCT FROM NEW."evidenceHash"
    OR OLD."closedAt" IS DISTINCT FROM NEW."closedAt" THEN
    RAISE EXCEPTION 'fiscal close evidence base fields are immutable' USING ERRCODE = '55000';
  END IF;

  IF (OLD."reopenedAt", OLD."reopenedBy", OLD."reopenAuthorizationRef", OLD."reopenReason")
     IS DISTINCT FROM
     (NEW."reopenedAt", NEW."reopenedBy", NEW."reopenAuthorizationRef", NEW."reopenReason") THEN
    IF current_setting('contagest.authorized_reopen', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'reopen evidence requires the authorized workflow' USING ERRCODE = '42501';
    END IF;
    IF OLD."reopenedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'reopen evidence is immutable once recorded' USING ERRCODE = '55000';
    END IF;
    IF NEW."reopenedAt" IS NULL OR NEW."reopenedBy" IS NULL
      OR length(btrim(coalesce(NEW."reopenAuthorizationRef", ''))) < 3
      OR length(btrim(coalesce(NEW."reopenReason", ''))) < 3 THEN
      RAISE EXCEPTION 'complete reopen evidence is required' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "FiscalCloseEvidence_guard_trg"
BEFORE UPDATE OR DELETE ON "FiscalCloseEvidence"
FOR EACH ROW EXECUTE FUNCTION contagest_close_evidence_guard();

CREATE OR REPLACE FUNCTION contagest_validate_period_close()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_unposted BIGINT;
  v_unbalanced BIGINT;
  v_draft_sales BIGINT;
  v_draft_purchases BIGINT;
  v_checks JSONB;
BEGIN
  IF NEW."status" <> 'closed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" = 'closed' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_unposted
  FROM "LedgerEntry"
  WHERE "tenantId" = NEW."tenantId"
    AND "fiscalPeriod" = NEW."period"
    AND NOT "posted";

  SELECT count(*) INTO v_unbalanced
  FROM (
    SELECT e."id"
    FROM "LedgerEntry" e
    JOIN "LedgerLine" l ON l."entryId" = e."id"
    WHERE e."tenantId" = NEW."tenantId"
      AND e."fiscalPeriod" = NEW."period"
      AND e."posted"
    GROUP BY e."id"
    HAVING COALESCE(sum(l."debit"), 0) <> COALESCE(sum(l."credit"), 0)
  ) q;

  SELECT count(*) INTO v_draft_sales
  FROM "SalesInvoice"
  WHERE "tenantId" = NEW."tenantId"
    AND "fiscalPeriod" = NEW."period"
    AND "status" = 'draft';

  SELECT count(*) INTO v_draft_purchases
  FROM "PurchaseInvoice"
  WHERE "tenantId" = NEW."tenantId"
    AND "fiscalPeriod" = NEW."period"
    AND "status" = 'draft';

  v_checks := jsonb_build_object(
    'unpostedLedgerEntries', v_unposted,
    'unbalancedPostedEntries', v_unbalanced,
    'draftSales', v_draft_sales,
    'draftPurchases', v_draft_purchases
  );

  IF v_unposted > 0 OR v_unbalanced > 0 OR v_draft_sales > 0 OR v_draft_purchases > 0 THEN
    RAISE EXCEPTION 'period close prechecks failed: %', v_checks USING ERRCODE = '23514';
  END IF;

  NEW."closedAt" := COALESCE(NEW."closedAt", NOW());
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION contagest_capture_period_close()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_prechecks JSONB;
  v_postchecks JSONB;
  v_hash TEXT;
BEGIN
  IF NEW."status" <> 'closed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."status" = 'closed' THEN
    RETURN NEW;
  END IF;

  v_prechecks := jsonb_build_object(
    'unpostedLedgerEntries', 0,
    'unbalancedPostedEntries', 0,
    'draftSales', 0,
    'draftPurchases', 0
  );

  SELECT jsonb_build_object(
    'postedLedgerEntries', (SELECT count(*) FROM "LedgerEntry" WHERE "tenantId" = NEW."tenantId" AND "fiscalPeriod" = NEW."period" AND "posted"),
    'salesDocuments', (SELECT count(*) FROM "SalesInvoice" WHERE "tenantId" = NEW."tenantId" AND "fiscalPeriod" = NEW."period" AND "status" <> 'draft'),
    'purchaseDocuments', (SELECT count(*) FROM "PurchaseInvoice" WHERE "tenantId" = NEW."tenantId" AND "fiscalPeriod" = NEW."period" AND "status" <> 'draft')
  ) INTO v_postchecks;

  v_hash := encode(
    digest(
      convert_to(
        jsonb_build_object(
          'tenantId', NEW."tenantId",
          'period', NEW."period",
          'module', NEW."module",
          'closedAt', NEW."closedAt",
          'closedBy', NEW."closedBy",
          'prechecks', v_prechecks,
          'postchecks', v_postchecks
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  INSERT INTO "FiscalCloseEvidence"(
    "tenantId", "period", "module", "closedBy", "prechecks", "postchecks", "evidenceHash", "closedAt"
  ) VALUES (
    NEW."tenantId", NEW."period", NEW."module", NEW."closedBy", v_prechecks, v_postchecks, v_hash, NEW."closedAt"
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION contagest_guard_period_reopen()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'closed'
    AND NEW."status" IS DISTINCT FROM 'closed'
    AND current_setting('contagest.authorized_reopen', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'closed periods require the authorized reopen workflow' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "ClosingPeriod_preclose_v561"
BEFORE INSERT OR UPDATE OF "status" ON "ClosingPeriod"
FOR EACH ROW EXECUTE FUNCTION contagest_validate_period_close();

CREATE TRIGGER "ClosingPeriod_reopen_guard_v561"
BEFORE UPDATE OF "status" ON "ClosingPeriod"
FOR EACH ROW EXECUTE FUNCTION contagest_guard_period_reopen();

CREATE TRIGGER "ClosingPeriod_close_evidence_v561"
AFTER INSERT OR UPDATE OF "status" ON "ClosingPeriod"
FOR EACH ROW EXECUTE FUNCTION contagest_capture_period_close();

CREATE OR REPLACE FUNCTION reopen_fiscal_period(
  p_tenant UUID,
  p_period TEXT,
  p_module TEXT,
  p_actor UUID,
  p_authorization_ref TEXT,
  p_reason TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_evidence UUID;
BEGIN
  IF p_actor IS NULL
    OR length(btrim(coalesce(p_authorization_ref, ''))) < 3
    OR length(btrim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'actor, authorization reference and reason are required' USING ERRCODE = '22023';
  END IF;

  SELECT "id" INTO v_evidence
  FROM "FiscalCloseEvidence"
  WHERE "tenantId" = p_tenant
    AND "period" = p_period
    AND "module" = p_module
    AND "reopenedAt" IS NULL
  ORDER BY "closedAt" DESC
  LIMIT 1
  FOR UPDATE;

  IF v_evidence IS NULL THEN
    RAISE EXCEPTION 'close evidence not found for period';
  END IF;

  PERFORM set_config('contagest.authorized_reopen', 'true', true);

  UPDATE "ClosingPeriod"
  SET "status" = 'open',
      "closedAt" = NULL,
      "closedBy" = NULL,
      "note" = concat_ws(E'\n', "note", '[REOPEN ' || NOW()::text || '] ' || p_reason || ' auth=' || p_authorization_ref)
  WHERE "tenantId" = p_tenant
    AND "period" = p_period
    AND "module" = p_module
    AND "status" = 'closed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'closed period not found';
  END IF;

  UPDATE "FiscalCloseEvidence"
  SET "reopenedAt" = NOW(),
      "reopenedBy" = p_actor,
      "reopenAuthorizationRef" = p_authorization_ref,
      "reopenReason" = p_reason
  WHERE "id" = v_evidence;
END $$;
