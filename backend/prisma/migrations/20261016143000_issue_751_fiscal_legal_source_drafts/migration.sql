-- #751 additive fiscal provenance catalog. Does NOT activate any tax rule or rate.
-- Store only immutable operator-asserted captures in DRAFT. Later review/activation
-- requires a separate, tested state-transition migration and reviewer authority.
CREATE TABLE public."FiscalLegalSource" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" TEXT NOT NULL REFERENCES public."Tenant"("id") ON DELETE RESTRICT,
  "sourceType" TEXT NOT NULL CHECK ("sourceType" IN ('official_gazette','statute','regulation','administrative_ruling','other')),
  "reference" VARCHAR(160) NOT NULL CHECK (length(btrim("reference")) >= 3),
  "title" VARCHAR(240) NOT NULL CHECK (length(btrim("title")) >= 3),
  "sourceUrl" TEXT,
  "publishedAt" TIMESTAMPTZ,
  "capturedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "contentSha256" CHAR(64) NOT NULL CHECK ("contentSha256" ~ '^[0-9a-f]{64}$'),
  "snapshotMetadata" JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof("snapshotMetadata") = 'object'),
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" = 'DRAFT'),
  "createdBy" TEXT NOT NULL CHECK (length(btrim("createdBy")) > 0),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "FiscalLegalSource_unique_capture" UNIQUE ("tenantId", "reference", "contentSha256"),
  CONSTRAINT "FiscalLegalSource_tenant_id" UNIQUE ("tenantId", "id")
);
CREATE INDEX "FiscalLegalSource_tenant_captured_idx"
  ON public."FiscalLegalSource" ("tenantId", "capturedAt" DESC);

-- Before the canonical v845 sidecar is installed, deny all reads/writes even
-- from the low-privilege runtime. Sidecar creates tenant policy dynamically for
-- PascalCase tables with tenantId and must run after Prisma migrations.
ALTER TABLE public."FiscalLegalSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FiscalLegalSource" FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public."FiscalLegalSource" FROM PUBLIC;
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','contagest_backup','contagest_monitor'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE public."FiscalLegalSource" FROM %I', role_name);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'contagest_runtime') THEN
    GRANT SELECT, INSERT ON public."FiscalLegalSource" TO contagest_runtime;
  END IF;
END $$;
