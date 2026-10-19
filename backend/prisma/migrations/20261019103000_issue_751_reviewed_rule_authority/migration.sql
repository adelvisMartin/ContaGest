-- #751 forward-only extension of the existing #561 fiscal rule authority.
-- Historical rules are intentionally DRAFT/unreviewed: no legacy free-form
-- definition may silently gain legal authority after this deployment.

CREATE TABLE public."FiscalLegalSourceReview" (
  "tenantId" TEXT NOT NULL,
  "legalSourceId" UUID NOT NULL,
  "reviewedBy" TEXT NOT NULL CHECK (length(btrim("reviewedBy")) > 0),
  "reason" TEXT NOT NULL CHECK (length(btrim("reason")) BETWEEN 10 AND 1000),
  "reviewedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "FiscalLegalSourceReview_pk" PRIMARY KEY ("tenantId", "legalSourceId"),
  CONSTRAINT "FiscalLegalSourceReview_source_fk" FOREIGN KEY ("tenantId", "legalSourceId")
    REFERENCES public."FiscalLegalSource" ("tenantId", "id") ON DELETE RESTRICT
);
CREATE INDEX "FiscalLegalSourceReview_reviewer_idx"
  ON public."FiscalLegalSourceReview" ("tenantId", "reviewedBy", "reviewedAt");

ALTER TABLE public."FiscalRuleVersion"
  ADD COLUMN "legalSourceId" UUID,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMPTZ,
  ADD COLUMN "activatedBy" TEXT,
  ADD COLUMN "activatedAt" TIMESTAMPTZ,
  ADD COLUMN "supersedesId" UUID,
  ADD CONSTRAINT "FiscalRuleVersion_status_check" CHECK ("status" IN ('DRAFT','REVIEWED','ACTIVE','SUPERSEDED')),
  ADD CONSTRAINT "FiscalRuleVersion_not_self_superseding" CHECK ("supersedesId" IS NULL OR "supersedesId" <> "id"),
  ADD CONSTRAINT "FiscalRuleVersion_review_evidence_check" CHECK (
    "status" = 'DRAFT' OR
    ("legalSourceId" IS NOT NULL AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "FiscalRuleVersion_activation_evidence_check" CHECK (
    "status" NOT IN ('ACTIVE','SUPERSEDED') OR
    ("activatedBy" IS NOT NULL AND "activatedAt" IS NOT NULL)
  );

ALTER TABLE public."FiscalRuleVersion"
  ADD CONSTRAINT "FiscalRuleVersion_tenant_id_key" UNIQUE ("tenantId", "id"),
  ADD CONSTRAINT "FiscalRuleVersion_legal_source_fk" FOREIGN KEY ("tenantId", "legalSourceId")
    REFERENCES public."FiscalLegalSource" ("tenantId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "FiscalRuleVersion_supersedes_fk" FOREIGN KEY ("tenantId", "supersedesId")
    REFERENCES public."FiscalRuleVersion" ("tenantId", "id") ON DELETE RESTRICT;
CREATE INDEX "FiscalRuleVersion_authorized_effective_idx"
  ON public."FiscalRuleVersion" ("tenantId", "ruleKey", "effectiveFrom" DESC)
  WHERE "status" IN ('ACTIVE','SUPERSEDED');

-- Existing document evidence remains byte-for-byte intact. New postings copy
-- the source's immutable hash and the independent approval chain into each row.
ALTER TABLE public."FiscalDocumentRuleSnapshot"
  ADD COLUMN "legalSourceId" UUID,
  ADD COLUMN "sourceContentSha256" CHAR(64),
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMPTZ,
  ADD COLUMN "activatedBy" TEXT,
  ADD COLUMN "activatedAt" TIMESTAMPTZ,
  ADD CONSTRAINT "FiscalDocumentRuleSnapshot_source_fk" FOREIGN KEY ("tenantId", "legalSourceId")
    REFERENCES public."FiscalLegalSource" ("tenantId", "id") ON DELETE RESTRICT;

ALTER TABLE public."FiscalLegalSourceReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FiscalLegalSourceReview" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public."FiscalLegalSourceReview" FROM PUBLIC;
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','contagest_backup','contagest_monitor'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON public."FiscalLegalSourceReview" FROM %I',role_name);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='contagest_runtime') THEN
    GRANT SELECT,INSERT ON public."FiscalLegalSourceReview" TO contagest_runtime;
  END IF;
END $$;

-- Captures, approvals and applied evidence cannot be revised in place.
CREATE FUNCTION public.contagest_751_immutable_provenance()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'FISCAL_PROVENANCE_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER contagest_751_legal_capture_immutable
  BEFORE UPDATE OR DELETE ON public."FiscalLegalSource"
  FOR EACH ROW EXECUTE FUNCTION public.contagest_751_immutable_provenance();
CREATE TRIGGER contagest_751_source_review_immutable
  BEFORE UPDATE OR DELETE ON public."FiscalLegalSourceReview"
  FOR EACH ROW EXECUTE FUNCTION public.contagest_751_immutable_provenance();
CREATE TRIGGER contagest_751_applied_snapshot_immutable
  BEFORE UPDATE OR DELETE ON public."FiscalDocumentRuleSnapshot"
  FOR EACH ROW EXECUTE FUNCTION public.contagest_751_immutable_provenance();

CREATE FUNCTION public.contagest_751_snapshot_review_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW."legalSourceId" IS NULL OR NEW."sourceContentSha256" IS NULL OR
     NEW."sourceContentSha256" !~ '^[0-9a-f]{64}$' OR
     NEW."reviewedBy" IS NULL OR NEW."reviewedAt" IS NULL OR
     NEW."activatedBy" IS NULL OR NEW."activatedAt" IS NULL THEN
    RAISE EXCEPTION 'FISCAL_APPLIED_SNAPSHOT_REVIEW_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contagest_751_snapshot_review_guard
  BEFORE INSERT ON public."FiscalDocumentRuleSnapshot"
  FOR EACH ROW EXECUTE FUNCTION public.contagest_751_snapshot_review_guard();

CREATE FUNCTION public.contagest_751_review_provenance()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."FiscalLegalSource" src
    WHERE src."tenantId" = NEW."tenantId" AND src."id" = NEW."legalSourceId"
      AND src."createdBy" <> NEW."reviewedBy"
  ) THEN
    RAISE EXCEPTION 'FISCAL_SOURCE_REVIEW_NOT_AUTHORIZED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contagest_751_source_review_guard
  BEFORE INSERT ON public."FiscalLegalSourceReview"
  FOR EACH ROW EXECUTE FUNCTION public.contagest_751_review_provenance();

-- Strong database boundary: no direct SQL can promote a DRAFT without an
-- independently reviewed tenant-owned source and recorded reviewer/activator.
CREATE FUNCTION public.contagest_751_rule_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE source_reviewer TEXT;
DECLARE definition_numerator TEXT;
DECLARE definition_denominator TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'FISCAL_RULE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' OR NEW."reviewedBy" IS NOT NULL OR
       NEW."activatedBy" IS NOT NULL OR NEW."reviewedAt" IS NOT NULL OR
       NEW."activatedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'FISCAL_RULE_DRAFT_ONLY' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF ROW(NEW."id",NEW."tenantId",NEW."ruleKey",NEW."version",
           NEW."effectiveFrom",NEW."effectiveTo",NEW."source",NEW."documentation",
           NEW."definition",NEW."hash",NEW."createdBy",NEW."createdAt",
           NEW."legalSourceId",NEW."supersedesId") IS DISTINCT FROM
       ROW(OLD."id",OLD."tenantId",OLD."ruleKey",OLD."version",
           OLD."effectiveFrom",OLD."effectiveTo",OLD."source",OLD."documentation",
           OLD."definition",OLD."hash",OLD."createdBy",OLD."createdAt",
           OLD."legalSourceId",OLD."supersedesId") THEN
      RAISE EXCEPTION 'FISCAL_RULE_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    IF NOT ((OLD."status" = 'DRAFT' AND NEW."status" = 'REVIEWED') OR
            (OLD."status" = 'REVIEWED' AND NEW."status" = 'ACTIVE') OR
            (OLD."status" = 'ACTIVE' AND NEW."status" = 'SUPERSEDED')) THEN
      RAISE EXCEPTION 'FISCAL_RULE_INVALID_TRANSITION' USING ERRCODE = '23514';
    END IF;
    SELECT rev."reviewedBy" INTO source_reviewer
    FROM public."FiscalLegalSourceReview" rev
    WHERE rev."tenantId"=NEW."tenantId" AND rev."legalSourceId"=NEW."legalSourceId";
    IF source_reviewer IS NULL THEN
      RAISE EXCEPTION 'FISCAL_RULE_SOURCE_UNREVIEWED' USING ERRCODE = '23514';
    END IF;
    IF OLD."status" = 'DRAFT' THEN
      IF NEW."reviewedBy" IS NULL OR NEW."reviewedBy" = NEW."createdBy" OR
         NEW."reviewedAt" IS NULL OR NEW."activatedBy" IS NOT NULL THEN
        RAISE EXCEPTION 'FISCAL_RULE_REVIEW_INVALID' USING ERRCODE = '23514';
      END IF;
    ELSIF OLD."status" = 'REVIEWED' THEN
      IF NEW."reviewedBy" IS DISTINCT FROM OLD."reviewedBy" OR
         NEW."reviewedAt" IS DISTINCT FROM OLD."reviewedAt" OR
         NEW."activatedBy" IS NULL OR NEW."activatedBy" = OLD."reviewedBy" OR
         NEW."activatedAt" IS NULL THEN
        RAISE EXCEPTION 'FISCAL_RULE_ACTIVATION_INVALID' USING ERRCODE = '23514';
      END IF;
      -- Advisory lock serializes competing activations of the same rule key.
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW."tenantId" || ':' || NEW."ruleKey",561));
      IF EXISTS (
        SELECT 1 FROM public."FiscalRuleVersion" competing
        WHERE competing."tenantId"=NEW."tenantId" AND competing."ruleKey"=NEW."ruleKey"
          AND competing."id"<>NEW."id" AND competing."status"='ACTIVE'
          AND pg_catalog.tstzrange(competing."effectiveFrom",COALESCE(competing."effectiveTo",'infinity'::timestamptz),'[)')
              && pg_catalog.tstzrange(NEW."effectiveFrom",COALESCE(NEW."effectiveTo",'infinity'::timestamptz),'[)')
      ) THEN
        RAISE EXCEPTION 'FISCAL_RULE_ACTIVE_OVERLAP' USING ERRCODE = '23514';
      END IF;
    ELSE
      IF NEW."reviewedBy" IS DISTINCT FROM OLD."reviewedBy" OR
         NEW."reviewedAt" IS DISTINCT FROM OLD."reviewedAt" OR
         NEW."activatedBy" IS DISTINCT FROM OLD."activatedBy" OR
         NEW."activatedAt" IS DISTINCT FROM OLD."activatedAt" THEN
        RAISE EXCEPTION 'FISCAL_RULE_SUPERSESSION_INVALID' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  -- The persisted DSL is checked independently of the API, including when a
  -- historical draft is promoted. No dynamic code or unknown formula fields.
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD."status" = 'DRAFT') THEN
    definition_numerator := NEW."definition"->>'numerator';
    definition_denominator := NEW."definition"->>'denominator';
    IF pg_catalog.jsonb_typeof(NEW."definition") <> 'object' OR
       (SELECT count(*) FROM pg_catalog.jsonb_object_keys(NEW."definition")) <> 4 OR
       NEW."definition"->>'formula' IS DISTINCT FROM 'RATIONAL_RATE' OR
       NEW."definition"->>'base' IS DISTINCT FROM 'TAXABLE_AMOUNT' OR
       pg_catalog.jsonb_typeof(NEW."definition"->'numerator') <> 'number' OR
       pg_catalog.jsonb_typeof(NEW."definition"->'denominator') <> 'number' OR
       definition_numerator IS NULL OR definition_numerator !~ '^(0|[1-9][0-9]{0,9})$' OR
       definition_denominator IS NULL OR definition_denominator !~ '^[1-9][0-9]{0,9}$' THEN
      RAISE EXCEPTION 'FISCAL_RULE_DEFINITION_UNSAFE' USING ERRCODE = '23514';
    END IF;
    IF definition_numerator::bigint > definition_denominator::bigint OR
       definition_denominator::bigint > 1000000000 THEN
      RAISE EXCEPTION 'FISCAL_RULE_DEFINITION_UNSAFE' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contagest_751_rule_authority
  BEFORE INSERT OR UPDATE OR DELETE ON public."FiscalRuleVersion"
  FOR EACH ROW EXECUTE FUNCTION public.contagest_751_rule_lifecycle();
