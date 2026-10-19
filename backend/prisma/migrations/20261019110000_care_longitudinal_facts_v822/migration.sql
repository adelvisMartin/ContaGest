-- #822: append-only longitudinal clinical facts. Existing Care* tables remain authoritative.
-- Additive tenant/patient composite keys let PostgreSQL reject foreign-tenant references
-- even from privileged services that accidentally omit application validation.
CREATE UNIQUE INDEX IF NOT EXISTS "CarePatient_tenant_id_uq_v822"
  ON public."CarePatient" ("tenantId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "CareEncounter_tenant_patient_id_uq_v822"
  ON public."CareEncounter" ("tenantId", "patientId", "id");

CREATE TABLE public."CareClinicalFact" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL,
  "encounterId" text,
  "kind" text NOT NULL,
  "detail" jsonb NOT NULL,
  "effectiveAt" timestamptz NOT NULL,
  "provenance" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "supersedesId" text,
  "amendmentReason" text,
  "createdByUserId" text NOT NULL,
  "requestKey" text,
  "requestFingerprint" text,
  "reviewedByUserId" text,
  "reviewedAt" timestamptz,
  "fingerprint" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CareClinicalFact_kind_check" CHECK ("kind" IN ('problem','allergy','medication','diagnosis','procedure')),
  CONSTRAINT "CareClinicalFact_request_check" CHECK (
    ("requestKey" IS NULL AND "requestFingerprint" IS NULL)
    OR ("requestKey" IS NOT NULL AND "requestFingerprint" IS NOT NULL AND "requestFingerprint" ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT "CareClinicalFact_status_check" CHECK ("status" IN ('draft','reviewed','entered_in_error')),
  CONSTRAINT "CareClinicalFact_detail_check" CHECK (jsonb_typeof("detail") = 'object' AND "detail" <> '{}'::jsonb),
  CONSTRAINT "CareClinicalFact_review_check" CHECK (
    ("status" = 'reviewed' AND "reviewedAt" IS NOT NULL AND "reviewedByUserId" IS NOT NULL
      AND "fingerprint" IS NOT NULL AND "fingerprint" ~ '^[0-9a-f]{64}$')
    OR ("status" <> 'reviewed' AND "reviewedAt" IS NULL AND "reviewedByUserId" IS NULL AND "fingerprint" IS NULL)
  ),
  CONSTRAINT "CareClinicalFact_amendment_check" CHECK (
    ("supersedesId" IS NULL AND "amendmentReason" IS NULL)
    OR ("supersedesId" IS NOT NULL AND "amendmentReason" IS NOT NULL AND length(trim("amendmentReason")) >= 10)
  ),
  CONSTRAINT "CareClinicalFact_patient_fk" FOREIGN KEY ("tenantId", "patientId")
    REFERENCES public."CarePatient" ("tenantId", "id") ON DELETE RESTRICT,
  CONSTRAINT "CareClinicalFact_encounter_fk" FOREIGN KEY ("tenantId", "patientId", "encounterId")
    REFERENCES public."CareEncounter" ("tenantId", "patientId", "id") ON DELETE RESTRICT,
  CONSTRAINT "CareClinicalFact_no_self_amendment" CHECK ("supersedesId" IS NULL OR "supersedesId" <> "id")
);

CREATE UNIQUE INDEX "CareClinicalFact_tenant_patient_id_uq"
  ON public."CareClinicalFact" ("tenantId", "patientId", "id");
ALTER TABLE public."CareClinicalFact"
  ADD CONSTRAINT "CareClinicalFact_supersedes_fk" FOREIGN KEY ("tenantId", "patientId", "supersedesId")
  REFERENCES public."CareClinicalFact" ("tenantId", "patientId", "id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "CareClinicalFact_single_amendment_uq"
  ON public."CareClinicalFact" ("supersedesId") WHERE "supersedesId" IS NOT NULL;
CREATE UNIQUE INDEX "CareClinicalFact_request_idempotency_uq"
  ON public."CareClinicalFact" ("tenantId", "createdByUserId", "requestKey") WHERE "requestKey" IS NOT NULL;
CREATE INDEX "CareClinicalFact_patient_timeline_idx"
  ON public."CareClinicalFact" ("tenantId", "patientId", "effectiveAt" DESC, "id" DESC);

CREATE FUNCTION public.care_clinical_fact_validate_insert_v822()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" <> 'draft' OR NEW."fingerprint" IS NOT NULL OR NEW."reviewedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'New clinical facts must be unrevised drafts.';
  END IF;
  IF NEW."supersedesId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."CareClinicalFact" f
    WHERE f."tenantId" = NEW."tenantId" AND f."patientId" = NEW."patientId"
      AND f."id" = NEW."supersedesId" AND f."status" = 'reviewed'
  ) THEN
    RAISE EXCEPTION 'Only a reviewed fact can be superseded.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "CareClinicalFact_validate_insert_v822"
  BEFORE INSERT ON public."CareClinicalFact"
  FOR EACH ROW EXECUTE FUNCTION public.care_clinical_fact_validate_insert_v822();

-- Only the draft -> reviewed metadata transition may update a fact; clinical
-- content/ownership, drafts, reviewed snapshots and deletion are immutable.
CREATE FUNCTION public.care_clinical_fact_immutable_reviewed_v822()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Clinical fact deletion is forbidden; retain the audit trail.';
  END IF;
  IF OLD."status" <> 'draft' OR NEW."status" <> 'reviewed' THEN
    RAISE EXCEPTION 'Only draft review is allowed; create an amendment instead.';
  END IF;
  IF (to_jsonb(OLD) - ARRAY['status','reviewedByUserId','reviewedAt','fingerprint','updatedAt'])
     IS DISTINCT FROM
     (to_jsonb(NEW) - ARRAY['status','reviewedByUserId','reviewedAt','fingerprint','updatedAt']) THEN
    RAISE EXCEPTION 'Review cannot modify clinical content or resource ownership.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "CareClinicalFact_reviewed_immutable_v822"
  BEFORE UPDATE OR DELETE ON public."CareClinicalFact"
  FOR EACH ROW EXECUTE FUNCTION public.care_clinical_fact_immutable_reviewed_v822();

ALTER TABLE public."CareClinicalFact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CareClinicalFact" FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public."CareClinicalFact" FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','contagest_backup','contagest_monitor'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE public."CareClinicalFact" FROM %I', role_name);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'contagest_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON public."CareClinicalFact" TO contagest_runtime;
    -- If the v845 runtime authority is provisioned, permit the same tenant
    -- predicate immediately after migrate; otherwise remain fail-closed until
    -- the canonical runtime-rls-policy-v845 sidecar is reapplied.
    IF pg_catalog.to_regprocedure('private.contagest_runtime_tenant_id()') IS NOT NULL THEN
      EXECUTE 'CREATE POLICY care_clinical_fact_runtime_scope_v822 ON public."CareClinicalFact" '
           || 'FOR ALL TO contagest_runtime '
           || 'USING ("tenantId" = private.contagest_runtime_tenant_id()) '
           || 'WITH CHECK ("tenantId" = private.contagest_runtime_tenant_id())';
    END IF;
  END IF;
END $$;
