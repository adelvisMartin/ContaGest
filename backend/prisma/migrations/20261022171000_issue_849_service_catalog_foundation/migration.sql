-- #849 additive relational Service Catalog foundation; no migration of existing Products.
-- Product remains the only commercial pricing/tax authority.
CREATE UNIQUE INDEX "Product_tenantId_id_key" ON public."Product"("tenantId","id");
CREATE UNIQUE INDEX "Employee_tenantId_id_key" ON public."Employee"("tenantId","id");

CREATE TABLE public."ServiceCatalogCategory" (
  "id" TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  "tenantId" TEXT NOT NULL REFERENCES public."Tenant"("id") ON DELETE RESTRICT,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','archived')),
  "displayOrder" INTEGER NOT NULL DEFAULT 0 CHECK ("displayOrder" BETWEEN -10000 AND 10000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceCatalogCategory_tenantId_id_key" UNIQUE ("tenantId","id"),
  CONSTRAINT "ServiceCatalogCategory_tenantId_slug_key" UNIQUE ("tenantId","slug"),
  CONSTRAINT service_catalog_category_slug CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  CONSTRAINT service_catalog_category_name CHECK (char_length(trim("name")) BETWEEN 1 AND 160)
);
CREATE INDEX "ServiceCatalogCategory_tenantId_status_displayOrder_idx"
  ON public."ServiceCatalogCategory"("tenantId","status","displayOrder");

CREATE TABLE public."ServiceDefinition" (
  "id" TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  "tenantId" TEXT NOT NULL REFERENCES public."Tenant"("id") ON DELETE RESTRICT,
  "categoryId" TEXT,
  "productId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','active','archived')),
  "visibility" TEXT NOT NULL DEFAULT 'internal' CHECK ("visibility" IN ('internal','public')),
  "modality" TEXT NOT NULL DEFAULT 'onsite' CHECK ("modality" IN ('onsite','remote','hybrid')),
  "durationMinutes" INTEGER NOT NULL CHECK ("durationMinutes" BETWEEN 1 AND 2880),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceDefinition_tenantId_id_key" UNIQUE ("tenantId","id"),
  CONSTRAINT service_definition_name CHECK (char_length(trim("name")) BETWEEN 1 AND 160),
  CONSTRAINT "ServiceDefinition_tenantId_categoryId_fkey" FOREIGN KEY ("tenantId","categoryId")
    REFERENCES public."ServiceCatalogCategory"("tenantId","id") ON DELETE RESTRICT,
  CONSTRAINT "ServiceDefinition_tenantId_productId_fkey" FOREIGN KEY ("tenantId","productId")
    REFERENCES public."Product"("tenantId","id") ON DELETE RESTRICT
);
CREATE INDEX "ServiceDefinition_tenantId_status_visibility_name_idx"
  ON public."ServiceDefinition"("tenantId","status","visibility","name");
CREATE INDEX "ServiceDefinition_tenantId_categoryId_idx" ON public."ServiceDefinition"("tenantId","categoryId");
CREATE INDEX "ServiceDefinition_tenantId_productId_idx" ON public."ServiceDefinition"("tenantId","productId");

CREATE TABLE public."ServiceStep" (
  "id" TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  "tenantId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "position" INTEGER NOT NULL CHECK ("position" BETWEEN 1 AND 24),
  "label" TEXT NOT NULL CHECK (char_length(trim("label")) BETWEEN 1 AND 120),
  "durationMinutes" INTEGER NOT NULL CHECK ("durationMinutes" BETWEEN 1 AND 480),
  "gapAfterMinutes" INTEGER NOT NULL DEFAULT 0 CHECK ("gapAfterMinutes" BETWEEN 0 AND 180),
  CONSTRAINT "ServiceStep_tenantId_serviceId_id_key" UNIQUE ("tenantId","serviceId","id"),
  CONSTRAINT "ServiceStep_tenantId_serviceId_position_key" UNIQUE ("tenantId","serviceId","position"),
  CONSTRAINT "ServiceStep_tenantId_serviceId_fkey" FOREIGN KEY ("tenantId","serviceId")
    REFERENCES public."ServiceDefinition"("tenantId","id") ON DELETE RESTRICT
);

CREATE TABLE public."ServiceDefinitionRevision" (
  "id" TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  "tenantId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "version" INTEGER NOT NULL CHECK ("version" >= 1),
  "snapshot" JSONB NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceDefinitionRevision_tenantId_serviceId_version_key" UNIQUE ("tenantId","serviceId","version"),
  CONSTRAINT "ServiceDefinitionRevision_tenantId_serviceId_fkey" FOREIGN KEY ("tenantId","serviceId")
    REFERENCES public."ServiceDefinition"("tenantId","id") ON DELETE RESTRICT
);
CREATE INDEX "ServiceDefinitionRevision_tenantId_createdAt_idx"
  ON public."ServiceDefinitionRevision"("tenantId","createdAt");

CREATE TABLE public."ServiceStaffCapability" (
  "id" TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  "tenantId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "ServiceStaffCapability_tenantId_serviceId_employeeId_key" UNIQUE ("tenantId","serviceId","employeeId"),
  CONSTRAINT "ServiceStaffCapability_tenantId_serviceId_fkey" FOREIGN KEY ("tenantId","serviceId")
    REFERENCES public."ServiceDefinition"("tenantId","id") ON DELETE RESTRICT,
  CONSTRAINT "ServiceStaffCapability_tenantId_employeeId_fkey" FOREIGN KEY ("tenantId","employeeId")
    REFERENCES public."Employee"("tenantId","id") ON DELETE RESTRICT
);
CREATE INDEX "ServiceStaffCapability_tenantId_employeeId_serviceId_idx"
  ON public."ServiceStaffCapability"("tenantId","employeeId","serviceId");

CREATE TABLE public."ServiceLocationEligibility" (
  "id" TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  "tenantId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "ServiceLocationEligibility_tenantId_serviceId_locationId_key" UNIQUE ("tenantId","serviceId","locationId"),
  CONSTRAINT "ServiceLocationEligibility_tenantId_serviceId_fkey" FOREIGN KEY ("tenantId","serviceId")
    REFERENCES public."ServiceDefinition"("tenantId","id") ON DELETE RESTRICT,
  CONSTRAINT "ServiceLocationEligibility_tenantId_locationId_fkey" FOREIGN KEY ("tenantId","locationId")
    REFERENCES public."BusinessLocation"("tenantId","id") ON DELETE RESTRICT
);
CREATE INDEX "ServiceLocationEligibility_tenantId_locationId_serviceId_idx"
  ON public."ServiceLocationEligibility"("tenantId","locationId","serviceId");

-- Historical service revisions are append-only, even if future adapters
-- accidentally get a generic Prisma CRUD permission.
CREATE FUNCTION public.service_catalog_revision_immutable() RETURNS trigger
LANGUAGE plpgsql AS $
BEGIN
  RAISE EXCEPTION 'SERVICE_CATALOG_REVISION_IMMUTABLE' USING ERRCODE = '23514';
END;
$;
CREATE TRIGGER service_definition_revision_no_mutation
  BEFORE UPDATE OR DELETE ON public."ServiceDefinitionRevision"
  FOR EACH ROW EXECUTE FUNCTION public.service_catalog_revision_immutable();

-- Separate RLS enforcement for every table. Canonical v845 tenant sidecar must
-- install runtime tenant policies *after* deploying this migration.
DO $$
DECLARE t TEXT;
  role_name TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ServiceCatalogCategory','ServiceDefinition','ServiceStep',
    'ServiceDefinitionRevision','ServiceStaffCapability','ServiceLocationEligibility'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='contagest_runtime') THEN
      IF t = 'ServiceDefinitionRevision' THEN
        EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO contagest_runtime',t);
      ELSE
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO contagest_runtime',t);
      END IF;
    END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','contagest_backup','contagest_monitor'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',t,role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;
