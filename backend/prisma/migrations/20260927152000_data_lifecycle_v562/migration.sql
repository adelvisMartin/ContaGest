-- #562 · Data lifecycle authority.
-- Forward-only metadata and enforcement. Legal retention durations are not invented here:
-- NULL retention means destructive purge remains blocked until a versioned policy supplies it.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public."DataRetentionPolicyVersion" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "entityType" text NOT NULL,
  "version" integer NOT NULL CHECK ("version" > 0),
  "effectiveFrom" timestamptz NOT NULL,
  "effectiveTo" timestamptz,
  "retentionDays" integer CHECK ("retentionDays" IS NULL OR "retentionDays" >= 0),
  "archiveAfterDays" integer CHECK ("archiveAfterDays" IS NULL OR "archiveAfterDays" >= 0),
  "deleteSemantics" text NOT NULL CHECK ("deleteSemantics" IN ('mutable','soft_delete','immutable','archive','purge')),
  "purgeable" boolean NOT NULL DEFAULT false,
  "source" text NOT NULL,
  "documentation" text NOT NULL,
  "policy" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "contentHash" text NOT NULL,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataRetentionPolicyVersion_window_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  CONSTRAINT "DataRetentionPolicyVersion_provenance_check" CHECK (length(btrim("source")) > 0 AND length(btrim("documentation")) > 0)
);

CREATE UNIQUE INDEX "DataRetentionPolicyVersion_global_version_key"
  ON public."DataRetentionPolicyVersion" ("entityType", "version")
  WHERE "tenantId" IS NULL;
CREATE UNIQUE INDEX "DataRetentionPolicyVersion_tenant_version_key"
  ON public."DataRetentionPolicyVersion" ("tenantId", "entityType", "version")
  WHERE "tenantId" IS NOT NULL;
CREATE INDEX "DataRetentionPolicyVersion_lookup_idx"
  ON public."DataRetentionPolicyVersion" ("entityType", "tenantId", "effectiveFrom" DESC);

CREATE OR REPLACE FUNCTION public.data_lifecycle_policy_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."DataRetentionPolicyVersion" p
    WHERE p."id" <> NEW."id"
      AND p."tenantId" IS NOT DISTINCT FROM NEW."tenantId"
      AND p."entityType" = NEW."entityType"
      AND tstzrange(p."effectiveFrom", p."effectiveTo", '[)')
          && tstzrange(NEW."effectiveFrom", NEW."effectiveTo", '[)')
  ) THEN
    RAISE EXCEPTION 'data lifecycle policy validity windows overlap for scope/entity'
      USING ERRCODE = '23514';
  END IF;

  NEW."contentHash" := encode(
    digest(
      convert_to(
        jsonb_build_object(
          'tenantId', NEW."tenantId",
          'entityType', NEW."entityType",
          'version', NEW."version",
          'effectiveFrom', NEW."effectiveFrom",
          'effectiveTo', NEW."effectiveTo",
          'retentionDays', NEW."retentionDays",
          'archiveAfterDays', NEW."archiveAfterDays",
          'deleteSemantics', NEW."deleteSemantics",
          'purgeable', NEW."purgeable",
          'source', NEW."source",
          'documentation', NEW."documentation",
          'policy', NEW."policy"
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END $$;

CREATE TRIGGER "DataRetentionPolicyVersion_guard_trg"
BEFORE INSERT OR UPDATE ON public."DataRetentionPolicyVersion"
FOR EACH ROW EXECUTE FUNCTION public.data_lifecycle_policy_guard();

INSERT INTO public."DataRetentionPolicyVersion" (
  "tenantId", "entityType", "version", "effectiveFrom", "retentionDays", "archiveAfterDays",
  "deleteSemantics", "purgeable", "source", "documentation", "policy", "contentHash"
)
SELECT NULL, v."entityType", 1, '2026-09-27T00:00:00Z'::timestamptz, v."retentionDays", v."archiveAfterDays",
       v."deleteSemantics", v."purgeable", 'engineering-baseline-#562', v."documentation",
       jsonb_build_object('legalReviewRequired', v."legalReviewRequired"), 'pending'
FROM (VALUES
  ('AuditLog', NULL::integer, NULL::integer, 'immutable', false, true, 'Audit/evidence is protected; legal retention duration must be supplied by approved policy.'),
  ('LedgerEntry', NULL::integer, NULL::integer, 'immutable', false, true, 'Posted accounting history is not removed by generic CRUD or lifecycle jobs.'),
  ('FiscalDocument', NULL::integer, NULL::integer, 'immutable', false, true, 'Fiscal documents remain protected until an approved legal policy explicitly replaces this baseline.'),
  ('FiscalCloseEvidence', NULL::integer, NULL::integer, 'immutable', false, true, 'Close evidence is immutable and cannot be purged by tenant CRUD.'),
  ('AnalyticsEvent', NULL::integer, NULL::integer, 'purge', true, false, 'Purge is supported but a tenant retention duration must be configured before execution.'),
  ('ImportBatch', NULL::integer, NULL::integer, 'purge', true, false, 'Import payloads are purge-capable after an explicit retention duration is configured.'),
  ('NotificationLog', NULL::integer, NULL::integer, 'archive', true, false, 'Notification history is archive/purge capable under a versioned retention duration.'),
  ('AddressGeocode', NULL::integer, NULL::integer, 'purge', true, false, 'Geocoding cache data is purge-capable under a versioned retention duration.'),
  ('MediaObject', 0, NULL::integer, 'purge', true, false, 'Generic user-managed media may be deleted immediately unless a legal hold applies.'),
  ('ClinicalMediaObject', NULL::integer, NULL::integer, 'immutable', false, true, 'Signed clinical media is protected; deletion requires the dedicated clinical/privacy authority.'),
  ('CarePatient', NULL::integer, NULL::integer, 'soft_delete', false, true, 'Clinical subject deletion remains soft/fail-closed pending the dedicated privacy authority.')
) AS v("entityType", "retentionDays", "archiveAfterDays", "deleteSemantics", "purgeable", "legalReviewRequired", "documentation")
WHERE NOT EXISTS (
  SELECT 1 FROM public."DataRetentionPolicyVersion" p
  WHERE p."tenantId" IS NULL AND p."entityType" = v."entityType" AND p."version" = 1
);

CREATE TABLE public."DataLegalHold" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL REFERENCES public."Tenant"("id") ON DELETE RESTRICT,
  "scopeType" text NOT NULL CHECK ("scopeType" IN ('tenant','entity','record')),
  "entityType" text,
  "recordId" text,
  "reason" text NOT NULL,
  "authorizationRef" text NOT NULL,
  "createdBy" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" timestamptz,
  "releasedBy" text,
  "releaseAuthorizationRef" text,
  "releaseReason" text,
  CONSTRAINT "DataLegalHold_scope_shape_check" CHECK (
    ("scopeType" = 'tenant' AND "entityType" IS NULL AND "recordId" IS NULL)
    OR ("scopeType" = 'entity' AND "entityType" IS NOT NULL AND "recordId" IS NULL)
    OR ("scopeType" = 'record' AND "entityType" IS NOT NULL AND "recordId" IS NOT NULL)
  ),
  CONSTRAINT "DataLegalHold_reason_check" CHECK (length(btrim("reason")) >= 3 AND length(btrim("authorizationRef")) >= 3)
);
CREATE UNIQUE INDEX "DataLegalHold_active_scope_key"
  ON public."DataLegalHold" ("tenantId", "scopeType", COALESCE("entityType", ''), COALESCE("recordId", ''))
  WHERE "active" = true;
CREATE INDEX "DataLegalHold_tenant_active_idx"
  ON public."DataLegalHold" ("tenantId", "active", "entityType");

CREATE OR REPLACE FUNCTION public.data_lifecycle_hold_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'legal hold rows cannot be deleted' USING ERRCODE = '55000';
  END IF;

  IF OLD."tenantId" IS DISTINCT FROM NEW."tenantId"
    OR OLD."scopeType" IS DISTINCT FROM NEW."scopeType"
    OR OLD."entityType" IS DISTINCT FROM NEW."entityType"
    OR OLD."recordId" IS DISTINCT FROM NEW."recordId"
    OR OLD."reason" IS DISTINCT FROM NEW."reason"
    OR OLD."authorizationRef" IS DISTINCT FROM NEW."authorizationRef"
    OR OLD."createdBy" IS DISTINCT FROM NEW."createdBy"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'legal hold base fields are immutable' USING ERRCODE = '55000';
  END IF;

  IF OLD."active" = false THEN
    IF ROW(OLD.*) IS DISTINCT FROM ROW(NEW.*) THEN
      RAISE EXCEPTION 'released legal hold is immutable' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."active" = true AND NEW."active" = false THEN
    IF current_setting('contagest.lifecycle_hold_release', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'legal hold release requires authorized lifecycle workflow' USING ERRCODE = '42501';
    END IF;
    IF NEW."releasedAt" IS NULL OR length(btrim(coalesce(NEW."releaseAuthorizationRef", ''))) < 3
      OR length(btrim(coalesce(NEW."releaseReason", ''))) < 3 THEN
      RAISE EXCEPTION 'complete legal hold release evidence is required' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."active" IS DISTINCT FROM NEW."active"
    OR OLD."releasedAt" IS DISTINCT FROM NEW."releasedAt"
    OR OLD."releasedBy" IS DISTINCT FROM NEW."releasedBy"
    OR OLD."releaseAuthorizationRef" IS DISTINCT FROM NEW."releaseAuthorizationRef"
    OR OLD."releaseReason" IS DISTINCT FROM NEW."releaseReason" THEN
    RAISE EXCEPTION 'legal hold mutation is not allowed outside release workflow' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "DataLegalHold_guard_trg"
BEFORE UPDATE OR DELETE ON public."DataLegalHold"
FOR EACH ROW EXECUTE FUNCTION public.data_lifecycle_hold_guard();

CREATE TABLE public."DataLifecycleJob" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "operation" text NOT NULL CHECK ("operation" IN ('archive','purge','tenant_export','tenant_delete','storage_reconcile')),
  "entityType" text,
  "idempotencyKey" text NOT NULL,
  "requestHash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','running','completed','failed','blocked')),
  "cursor" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "result" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "attempts" integer NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "requestedBy" text,
  "authorizationRef" text,
  "lastError" text,
  "startedAt" timestamptz,
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataLifecycleJob_destructive_auth_check" CHECK ("operation" NOT IN ('purge','tenant_delete') OR length(btrim(coalesce("authorizationRef", ''))) >= 3),
  CONSTRAINT "DataLifecycleJob_idempotency_key" UNIQUE ("tenantId", "operation", "idempotencyKey")
);
CREATE INDEX "DataLifecycleJob_tenant_status_idx"
  ON public."DataLifecycleJob" ("tenantId", "status", "createdAt");

CREATE TABLE public."DataLifecycleEvidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL REFERENCES public."Tenant"("id") ON DELETE RESTRICT,
  "jobId" uuid REFERENCES public."DataLifecycleJob"("id") ON DELETE RESTRICT,
  "action" text NOT NULL,
  "entityType" text NOT NULL,
  "subjectDigest" text NOT NULL,
  "recordCount" integer NOT NULL DEFAULT 0 CHECK ("recordCount" >= 0),
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "evidenceHash" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DataLifecycleEvidence_tenant_action_idx"
  ON public."DataLifecycleEvidence" ("tenantId", "action", "createdAt");

CREATE OR REPLACE FUNCTION public.data_lifecycle_evidence_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'data lifecycle evidence is immutable' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER "DataLifecycleEvidence_immutable_trg"
BEFORE UPDATE OR DELETE ON public."DataLifecycleEvidence"
FOR EACH ROW EXECUTE FUNCTION public.data_lifecycle_evidence_immutable();

CREATE TABLE public."DataStorageObject" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "bucket" text NOT NULL,
  "objectKey" text NOT NULL,
  "lifecycleEntityType" text NOT NULL CHECK ("lifecycleEntityType" IN ('MediaObject','ClinicalMediaObject')),
  "subjectType" text,
  "subjectId" text,
  "checksum" text,
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','deleted','orphaned')),
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastVerifiedAt" timestamptz,
  "deletedAt" timestamptz,
  CONSTRAINT "DataStorageObject_tenant_object_key" UNIQUE ("tenantId", "bucket", "objectKey")
);
CREATE INDEX "DataStorageObject_tenant_status_idx"
  ON public."DataStorageObject" ("tenantId", "bucket", "status");

CREATE OR REPLACE FUNCTION public.data_lifecycle_storage_no_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'storage lifecycle registry rows cannot be deleted; mark status instead' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER "DataStorageObject_no_delete_trg"
BEFORE DELETE ON public."DataStorageObject"
FOR EACH ROW EXECUTE FUNCTION public.data_lifecycle_storage_no_delete();

CREATE OR REPLACE FUNCTION public.data_lifecycle_assert_not_held(
  p_tenant uuid,
  p_entity_type text,
  p_record_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."DataLegalHold" h
    WHERE h."tenantId" = p_tenant
      AND h."active" = true
      AND (
        h."scopeType" = 'tenant'
        OR (h."scopeType" = 'entity' AND h."entityType" = p_entity_type)
        OR (
          h."scopeType" = 'record'
          AND h."entityType" = p_entity_type
          AND (p_record_id IS NULL OR h."recordId" = p_record_id)
        )
      )
  ) THEN
    RAISE EXCEPTION 'LEGAL_HOLD_ACTIVE: purge/delete is blocked for tenant/entity/record'
      USING ERRCODE = '55006';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.data_lifecycle_protected_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_purgeable boolean;
  v_semantics text;
BEGIN
  IF current_setting('contagest.lifecycle_authorized', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'generic delete denied for protected lifecycle entity %', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.data_lifecycle_assert_not_held(OLD."tenantId", TG_TABLE_NAME, OLD."id"::text);

  SELECT p."purgeable", p."deleteSemantics"
  INTO v_purgeable, v_semantics
  FROM public."DataRetentionPolicyVersion" p
  WHERE p."entityType" = TG_TABLE_NAME
    AND (p."tenantId" = OLD."tenantId" OR p."tenantId" IS NULL)
    AND p."effectiveFrom" <= CURRENT_TIMESTAMP
    AND (p."effectiveTo" IS NULL OR p."effectiveTo" > CURRENT_TIMESTAMP)
  ORDER BY (p."tenantId" IS NOT NULL) DESC, p."effectiveFrom" DESC, p."version" DESC
  LIMIT 1;

  IF COALESCE(v_purgeable, false) = false OR v_semantics IS DISTINCT FROM 'purge' THEN
    RAISE EXCEPTION 'retention policy denies purge for protected lifecycle entity %', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END $$;

CREATE TRIGGER "AuditLog_lifecycle_delete_guard"
BEFORE DELETE ON public."AuditLog"
FOR EACH ROW EXECUTE FUNCTION public.data_lifecycle_protected_delete_guard();
CREATE TRIGGER "LedgerEntry_lifecycle_delete_guard"
BEFORE DELETE ON public."LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION public.data_lifecycle_protected_delete_guard();
CREATE TRIGGER "FiscalDocument_lifecycle_delete_guard"
BEFORE DELETE ON public."FiscalDocument"
FOR EACH ROW EXECUTE FUNCTION public.data_lifecycle_protected_delete_guard();
CREATE TRIGGER "FiscalCloseEvidence_lifecycle_delete_guard"
BEFORE DELETE ON public."FiscalCloseEvidence"
FOR EACH ROW EXECUTE FUNCTION public.data_lifecycle_protected_delete_guard();
