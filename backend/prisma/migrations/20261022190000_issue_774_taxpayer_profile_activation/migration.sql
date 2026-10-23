-- #774 server-authoritative taxpayer profile activation, forward only.
-- All previously captured profiles remain DRAFT, never auto-approved.
ALTER TABLE public."TaxpayerProfileVersion"
  DROP CONSTRAINT "TaxpayerProfileVersion_status_check",
  ADD COLUMN "legalSourceId" uuid,
  ADD COLUMN "reviewedBy" text,
  ADD COLUMN "reviewedAt" timestamptz,
  ADD COLUMN "activatedBy" text,
  ADD COLUMN "activatedAt" timestamptz,
  ADD CONSTRAINT "TaxpayerProfileVersion_status_review_check" CHECK (
    ("status"='DRAFT' AND "reviewedBy" IS NULL AND "reviewedAt" IS NULL AND "activatedBy" IS NULL AND "activatedAt" IS NULL)
    OR ("status"='REVIEWED' AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL
      AND "reviewedBy"<>"createdBy" AND "activatedBy" IS NULL AND "activatedAt" IS NULL
      AND "legalSourceId" IS NOT NULL)
    OR ("status"='ACTIVE' AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL
      AND "reviewedBy"<>"createdBy" AND "activatedBy" IS NOT NULL AND "activatedAt" IS NOT NULL
      AND "activatedBy"<>"createdBy" AND "activatedBy"<>"reviewedBy"
      AND "legalSourceId" IS NOT NULL)
  ),
  ADD CONSTRAINT "TaxpayerProfileVersion_tenant_id_key" UNIQUE ("tenantId","id"),
  ADD CONSTRAINT "TaxpayerProfileVersion_source_fk" FOREIGN KEY ("tenantId","legalSourceId")
    REFERENCES public."FiscalLegalSource"("tenantId","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "TaxpayerProfileVersion_active_window_idx"
  ON public."TaxpayerProfileVersion" ("tenantId","effectiveFrom")
  WHERE "status"='ACTIVE';

-- Profile evidence is unchanged. Only one-way review/activation metadata may change;
-- no DELETE, no RIF or taxpayer category edits, and no actor self-approval.
CREATE OR REPLACE FUNCTION public.contagest_774_taxpayer_profile_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE src RECORD;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'TAXPAYER_PROFILE_VERSION_IMMUTABLE' USING ERRCODE='55000';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','legalSourceId','reviewedBy','reviewedAt','activatedBy','activatedAt'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','legalSourceId','reviewedBy','reviewedAt','activatedBy','activatedAt']) THEN
    RAISE EXCEPTION 'TAXPAYER_PROFILE_VERSION_IMMUTABLE' USING ERRCODE='55000';
  END IF;
  IF NOT ((OLD."status"='DRAFT' AND NEW."status"='REVIEWED') OR
          (OLD."status"='REVIEWED' AND NEW."status"='ACTIVE')) THEN
    RAISE EXCEPTION 'TAXPAYER_PROFILE_INVALID_TRANSITION' USING ERRCODE='23514';
  END IF;
  IF NEW."reviewedBy" IS NULL OR NEW."reviewedBy"=NEW."createdBy"
      OR NEW."reviewedAt" IS NULL THEN
    RAISE EXCEPTION 'TAXPAYER_PROFILE_INDEPENDENCE' USING ERRCODE='23514';
  END IF;
  IF OLD."status"='REVIEWED' AND
      (NEW."legalSourceId" IS DISTINCT FROM OLD."legalSourceId"
       OR NEW."reviewedBy" IS DISTINCT FROM OLD."reviewedBy"
       OR NEW."reviewedAt" IS DISTINCT FROM OLD."reviewedAt"
       OR NEW."activatedBy" IS NULL OR NEW."activatedBy" IN (NEW."createdBy",NEW."reviewedBy")
       OR NEW."activatedAt" IS NULL OR NEW."activatedAt"<NEW."reviewedAt") THEN
    RAISE EXCEPTION 'TAXPAYER_PROFILE_ACTIVATION_INDEPENDENCE' USING ERRCODE='23514';
  END IF;
  SELECT s."status",s."reference",s."contentSha256" INTO src
    FROM public."FiscalLegalSource" s
    WHERE s."id"=NEW."legalSourceId" AND s."tenantId"=NEW."tenantId";
  IF NOT FOUND OR src."status"<>'REVIEWED'
    OR src."reference"<>NEW."sourceReference"
    OR src."contentSha256"<>NEW."sourceContentSha256" THEN
    RAISE EXCEPTION 'TAXPAYER_PROFILE_SOURCE_NOT_REVIEWED' USING ERRCODE='23514';
  END IF;
  IF NEW."status"='ACTIVE' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('tax-profile:'||NEW."tenantId",774));
    IF EXISTS(
      SELECT 1 FROM public."TaxpayerProfileVersion" p WHERE p."tenantId"=NEW."tenantId"
        AND p."status"='ACTIVE' AND p."id"<>NEW."id"
        AND tstzrange(p."effectiveFrom",coalesce(p."effectiveTo",'infinity'::timestamptz),'[)')
         && tstzrange(NEW."effectiveFrom",coalesce(NEW."effectiveTo",'infinity'::timestamptz),'[)')
    ) THEN
      RAISE EXCEPTION 'TAXPAYER_PROFILE_ACTIVE_OVERLAP' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='contagest_runtime') THEN
    GRANT UPDATE ("status","legalSourceId","reviewedBy","reviewedAt","activatedBy","activatedAt")
      ON public."TaxpayerProfileVersion" TO contagest_runtime;
  END IF;
END $$;

-- Snapshot attached to the EXISTING fiscal document, not a second profile authority.
ALTER TABLE public."FiscalDocument"
  ADD COLUMN "taxpayerProfileSnapshot" jsonb,
  ADD COLUMN "taxpayerProfileHash" char(64),
  ADD CONSTRAINT "FiscalDocument_taxpayer_snapshot_pair" CHECK (
    ("taxpayerProfileSnapshot" IS NULL AND "taxpayerProfileHash" IS NULL)
    OR (jsonb_typeof("taxpayerProfileSnapshot")='object' AND
        "taxpayerProfileHash" ~ '^[a-f0-9]{64}$')
  );

-- Once a taxpayer snapshot is written inside the issuance transaction it is
-- append-only, even when some caller gets broad direct SQL privileges.
CREATE FUNCTION public.contagest_774_guard_document_profile_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF OLD."taxpayerProfileHash" IS NOT NULL AND
    (NEW."taxpayerProfileSnapshot" IS DISTINCT FROM OLD."taxpayerProfileSnapshot" OR
     NEW."taxpayerProfileHash" IS DISTINCT FROM OLD."taxpayerProfileHash") THEN
    RAISE EXCEPTION 'TAXPAYER_DOCUMENT_PROFILE_IMMUTABLE' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contagest_774_guard_document_profile_snapshot
  BEFORE UPDATE ON public."FiscalDocument"
  FOR EACH ROW EXECUTE FUNCTION public.contagest_774_guard_document_profile_snapshot();

INSERT INTO public."Permission" ("id","key","description") VALUES
  ('77400000-0000-4000-8000-000000000001','fiscal.activate_profiles',
   'Activar perfiles tributarios documentados con revisión independiente')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO public."RolePermission" ("roleId","permissionId")
SELECT r."id",p."id" FROM public."Role" r
JOIN public."Permission" p ON p."key"='fiscal.activate_profiles'
WHERE r."system"=true AND r."name"='Administrador Global'
ON CONFLICT ("roleId","permissionId") DO NOTHING;
