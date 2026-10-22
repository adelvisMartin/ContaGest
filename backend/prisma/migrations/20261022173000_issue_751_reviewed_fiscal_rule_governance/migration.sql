-- #751 reviewed legal provenance on the EXISTING FiscalRuleVersion authority.
-- Forward only. Legacy versions stay DRAFT; none silently acquire legal approval.
ALTER TABLE public."FiscalRuleVersion"
  ADD COLUMN "legalSourceId" uuid,
  ADD COLUMN "legalSourceSha256" char(64),
  ADD COLUMN "status" text NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "reviewedBy" text,
  ADD COLUMN "reviewedAt" timestamptz,
  ADD COLUMN "activatedBy" text,
  ADD COLUMN "activatedAt" timestamptz,
  ADD COLUMN "supersedesId" uuid,
  ADD CONSTRAINT "FiscalRuleVersion_state_check" CHECK ("status" IN ('DRAFT','REVIEWED','ACTIVE','SUPERSEDED')),
  ADD CONSTRAINT "FiscalRuleVersion_reviewed_state_check" CHECK (
    "status" = 'DRAFT' OR
    ("legalSourceId" IS NOT NULL AND "legalSourceSha256" ~ '^[a-f0-9]{64}$'
      AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL
      AND "createdBy" IS NOT NULL AND "reviewedBy" <> "createdBy")
  ),
  ADD CONSTRAINT "FiscalRuleVersion_activated_state_check" CHECK (
    "status" IN ('DRAFT','REVIEWED') OR
    ("activatedBy" IS NOT NULL AND "activatedAt" IS NOT NULL
      AND "activatedBy" <> "createdBy" AND "activatedBy" <> "reviewedBy")
  ),
  ADD CONSTRAINT "FiscalRuleVersion_tenant_id_key" UNIQUE ("tenantId","id"),
  ADD CONSTRAINT "FiscalRuleVersion_legal_source_fk" FOREIGN KEY ("tenantId","legalSourceId")
    REFERENCES public."FiscalLegalSource"("tenantId","id") ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT "FiscalRuleVersion_supersedes_fk" FOREIGN KEY ("tenantId","supersedesId")
    REFERENCES public."FiscalRuleVersion"("tenantId","id") ON UPDATE RESTRICT ON DELETE RESTRICT;

-- Snapshot the exact reviewed source digest used by a financial event, without
-- recalculating previously emitted documents.
ALTER TABLE public."FiscalDocumentRuleSnapshot"
  ADD COLUMN "legalSourceId" uuid,
  ADD COLUMN "legalSourceSha256" char(64),
  ADD CONSTRAINT "FiscalDocumentRuleSnapshot_source_fk"
    FOREIGN KEY ("tenantId","legalSourceId")
    REFERENCES public."FiscalLegalSource"("tenantId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "FiscalRuleVersion_active_rule_idx"
  ON public."FiscalRuleVersion" ("tenantId","ruleKey","effectiveFrom")
  WHERE "status"='ACTIVE';

-- The legal capture may transition once from DRAFT to reviewed/rejected.
-- No user or later sidecar GRANT may silently replace source/hash metadata.
CREATE FUNCTION public.contagest_751_guard_legal_source()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'FISCAL_LEGAL_SOURCE_IMMUTABLE' USING ERRCODE='55000';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','reviewedBy','reviewedAt','reviewReason'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','reviewedBy','reviewedAt','reviewReason'])
     OR OLD."status"<>'DRAFT'
     OR NEW."status" NOT IN ('REVIEWED','REJECTED')
     OR NEW."reviewedBy" IS NULL OR NEW."reviewedBy"=OLD."createdBy"
     OR NEW."reviewedAt" IS NULL THEN
    RAISE EXCEPTION 'FISCAL_LEGAL_SOURCE_IMMUTABLE' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END; $;
CREATE TRIGGER contagest_751_guard_legal_source
  BEFORE UPDATE OR DELETE ON public."FiscalLegalSource"
  FOR EACH ROW EXECUTE FUNCTION public.contagest_751_guard_legal_source();

-- Secure workflow across direct SQL and API: immutable evidence, independent
-- review and activation, and serialization of overlapping active intervals.
CREATE FUNCTION public.contagest_751_guard_fiscal_rule()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  checked_source RECORD;
  predecessor RECORD;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW."status"<>'DRAFT' THEN
      RAISE EXCEPTION 'FISCAL_RULE_MUST_START_DRAFT' USING ERRCODE='23514';
    END IF;
  ELSE
    IF (to_jsonb(NEW) - ARRAY['status','reviewedBy','reviewedAt','activatedBy','activatedAt'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','reviewedBy','reviewedAt','activatedBy','activatedAt']) THEN
      RAISE EXCEPTION 'FISCAL_RULE_EVIDENCE_IMMUTABLE' USING ERRCODE='55000';
    END IF;
    IF NOT (
      (OLD."status"='DRAFT' AND NEW."status"='REVIEWED') OR
      (OLD."status"='REVIEWED' AND NEW."status"='ACTIVE') OR
      (OLD."status"='ACTIVE' AND NEW."status"='SUPERSEDED')
    ) THEN
      RAISE EXCEPTION 'FISCAL_RULE_INVALID_TRANSITION' USING ERRCODE='23514';
    END IF;
    IF NEW."status"='REVIEWED' AND (NEW."reviewedBy" IS NULL OR NEW."reviewedBy"=NEW."createdBy"
       OR NEW."reviewedAt" IS NULL OR NEW."activatedBy" IS NOT NULL) THEN
      RAISE EXCEPTION 'FISCAL_RULE_REVIEW_INDEPENDENCE' USING ERRCODE='23514';
    END IF;
    IF NEW."status"='ACTIVE' AND (NEW."activatedBy" IS NULL
       OR NEW."activatedBy" IN (NEW."createdBy",NEW."reviewedBy")
       OR NEW."activatedAt" IS NULL OR NEW."reviewedAt">NEW."activatedAt") THEN
      RAISE EXCEPTION 'FISCAL_RULE_ACTIVATION_INDEPENDENCE' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW."supersedesId" IS NOT NULL THEN
    SELECT r."tenantId",r."ruleKey",r."version" INTO predecessor
    FROM public."FiscalRuleVersion" r
    WHERE r."id"=NEW."supersedesId" AND r."tenantId"=NEW."tenantId";
    IF NOT FOUND OR predecessor."ruleKey"<>NEW."ruleKey" OR predecessor."version">=NEW."version" THEN
      RAISE EXCEPTION 'FISCAL_RULE_SUPERSESSION_CYCLE' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW."status" IN ('REVIEWED','ACTIVE') THEN
    SELECT s."status",s."contentSha256",s."reviewedBy" INTO checked_source
    FROM public."FiscalLegalSource" s
    WHERE s."id"=NEW."legalSourceId" AND s."tenantId"=NEW."tenantId";
    IF NOT FOUND OR checked_source."status"<>'REVIEWED' OR checked_source."reviewedBy" IS NULL
      OR checked_source."contentSha256"<>NEW."legalSourceSha256" THEN
      RAISE EXCEPTION 'FISCAL_RULE_UNREVIEWED_LEGAL_SOURCE' USING ERRCODE='23514';
    END IF;
    IF jsonb_typeof(NEW."definition") IS DISTINCT FROM 'object'
      OR (SELECT COUNT(*) FROM jsonb_object_keys(NEW."definition")) <> 4
      OR (NEW."definition"->>'formula') IS DISTINCT FROM 'RATIO_MINOR_UNITS'
      OR (NEW."definition"->>'basis') IS NULL
      OR (NEW."definition"->>'basis') NOT IN ('taxable_minor','tax_minor','payment_minor')
      OR jsonb_typeof(NEW."definition"->'numerator') IS DISTINCT FROM 'number'
      OR jsonb_typeof(NEW."definition"->'denominator') IS DISTINCT FROM 'number'
      OR (NEW."definition"->>'numerator')::numeric <> trunc((NEW."definition"->>'numerator')::numeric)
      OR (NEW."definition"->>'denominator')::numeric <> trunc((NEW."definition"->>'denominator')::numeric)
      OR (NEW."definition"->>'numerator')::numeric > 9007199254740991
      OR (NEW."definition"->>'denominator')::numeric > 9007199254740991
      OR (NEW."definition"->>'denominator')::numeric <= 0
      OR (NEW."definition"->>'numerator')::numeric < 0
      OR (NEW."definition"->>'numerator')::numeric > (NEW."definition"->>'denominator')::numeric THEN
      RAISE EXCEPTION 'FISCAL_RULE_FORMULA_NOT_APPROVED' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW."status"='ACTIVE' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."tenantId" || ':' || NEW."ruleKey",561));
    IF EXISTS (
      SELECT 1 FROM public."FiscalRuleVersion" r
      WHERE r."tenantId"=NEW."tenantId" AND r."ruleKey"=NEW."ruleKey"
        AND r."id"<>NEW."id" AND r."status"='ACTIVE'
        AND tstzrange(r."effectiveFrom",coalesce(r."effectiveTo",'infinity'::timestamptz),'[)')
          && tstzrange(NEW."effectiveFrom",coalesce(NEW."effectiveTo",'infinity'::timestamptz),'[)')
    ) THEN
      RAISE EXCEPTION 'FISCAL_RULE_ACTIVE_INTERVAL_OVERLAP' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER contagest_751_guard_fiscal_rule
  BEFORE INSERT OR UPDATE ON public."FiscalRuleVersion"
  FOR EACH ROW EXECUTE FUNCTION public.contagest_751_guard_fiscal_rule();

-- Sidecar RLS still determines the tenant. This is only column-level write restriction.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='contagest_runtime') THEN
   GRANT UPDATE ("status","reviewedBy","reviewedAt","activatedBy","activatedAt")
     ON public."FiscalRuleVersion" TO contagest_runtime;
 END IF;
END $$;

INSERT INTO public."Permission" ("id","key","description") VALUES
  ('75100000-0000-4000-8000-000000000001','fiscal.activate_rules','Activar versiones fiscales revisadas con separación de funciones')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO public."RolePermission" ("roleId","permissionId")
SELECT r."id",p."id" FROM public."Role" r
JOIN public."Permission" p ON p."key"='fiscal.activate_rules'
WHERE r."system"=true AND r."name"='Administrador Global'
ON CONFLICT ("roleId","permissionId") DO NOTHING;
