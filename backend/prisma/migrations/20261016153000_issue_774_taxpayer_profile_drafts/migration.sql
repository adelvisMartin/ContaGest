-- #774: tenant taxpayer profile draft versions. RIF snapshot is server-derived.
-- DRAFT cannot be consumed for fiscal rule selection. No active classification.
CREATE TABLE public."TaxpayerProfileVersion" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE RESTRICT,
  "version" integer NOT NULL CHECK ("version">0),
  "rifSnapshot" text NOT NULL CHECK (length(btrim("rifSnapshot"))>0),
  "effectiveFrom" timestamptz NOT NULL,
  "effectiveTo" timestamptz,
  "jurisdiction" varchar(120) NOT NULL,
  "taxpayerCategory" varchar(80) NOT NULL,
  "activityCodes" jsonb NOT NULL CHECK (jsonb_typeof("activityCodes")='array'),
  "sourceReference" varchar(240) NOT NULL,
  "sourceContentSha256" char(64) NOT NULL CHECK ("sourceContentSha256"~'^[a-f0-9]{64}$'),
  "capturedAt" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT' CHECK ("status"='DRAFT'),
  "createdBy" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "TaxpayerProfileVersion_window" CHECK ("effectiveTo" IS NULL OR "effectiveTo">"effectiveFrom"),
  CONSTRAINT "TaxpayerProfileVersion_tenant_version" UNIQUE ("tenantId","version")
);
CREATE INDEX "TaxpayerProfileVersion_tenant_idx" ON public."TaxpayerProfileVersion"("tenantId","version" DESC);
ALTER TABLE public."TaxpayerProfileVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TaxpayerProfileVersion" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public."TaxpayerProfileVersion" FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','contagest_backup','contagest_monitor'] LOOP
    IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=r) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON public."TaxpayerProfileVersion" FROM %I',r);
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='contagest_runtime') THEN
    GRANT SELECT,INSERT ON public."TaxpayerProfileVersion" TO contagest_runtime;
  END IF;
END $$;

-- Versions are historical snapshots; RLS alone does not make rows immutable.
-- Reject mutations even after sidecar provisioning of tenant runtime grants.
CREATE FUNCTION public.contagest_774_taxpayer_profile_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'TAXPAYER_PROFILE_VERSION_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER contagest_774_taxpayer_profile_immutable
  BEFORE UPDATE OR DELETE ON public."TaxpayerProfileVersion"
  FOR EACH ROW EXECUTE FUNCTION public.contagest_774_taxpayer_profile_immutable();
