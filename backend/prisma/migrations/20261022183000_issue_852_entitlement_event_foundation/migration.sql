-- #852 additive finite benefits; never treated as monetary balances/licensing.
-- Composite FK prevents references to Product, Client, Service and Location of another tenant.
CREATE UNIQUE INDEX "Client_tenantId_id_key" ON public."Client"("tenantId","id");

CREATE TABLE public."BenefitDefinition" (
  "id" TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  "tenantId" TEXT NOT NULL REFERENCES public."Tenant"("id") ON DELETE RESTRICT,
  "productId" TEXT NOT NULL,
  "name" TEXT NOT NULL CHECK (char_length(trim("name")) BETWEEN 1 AND 160),
  "scope" TEXT NOT NULL DEFAULT 'ALL' CHECK ("scope" IN ('ALL','SERVICE','CATEGORY')),
  "serviceId" TEXT,
  "categoryId" TEXT,
  "quantity" DECIMAL(18,3) NOT NULL CHECK ("quantity" > 0),
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','archived')),
  "version" INT NOT NULL DEFAULT 1 CHECK ("version">0),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BenefitDefinition_tenantId_id_key" UNIQUE ("tenantId","id"),
  CONSTRAINT "BenefitDefinition_tenantId_productId_fkey" FOREIGN KEY ("tenantId","productId")
    REFERENCES public."Product"("tenantId","id") ON DELETE RESTRICT,
  CONSTRAINT "BenefitDefinition_tenantId_serviceId_fkey" FOREIGN KEY ("tenantId","serviceId")
    REFERENCES public."ServiceDefinition"("tenantId","id") ON DELETE RESTRICT,
  CONSTRAINT "BenefitDefinition_tenantId_categoryId_fkey" FOREIGN KEY ("tenantId","categoryId")
    REFERENCES public."ServiceCatalogCategory"("tenantId","id") ON DELETE RESTRICT,
  CONSTRAINT benefit_scope_exact CHECK (
    ("scope"='ALL' AND "serviceId" IS NULL AND "categoryId" IS NULL)
    OR ("scope"='SERVICE' AND "serviceId" IS NOT NULL AND "categoryId" IS NULL)
    OR ("scope"='CATEGORY' AND "categoryId" IS NOT NULL AND "serviceId" IS NULL)
  )
);
CREATE INDEX "BenefitDefinition_tenantId_productId_status_idx"
  ON public."BenefitDefinition"("tenantId","productId","status");

CREATE TABLE public."CustomerEntitlement" (
  "id" TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  "tenantId" TEXT NOT NULL REFERENCES public."Tenant"("id") ON DELETE RESTRICT,
  "benefitId" TEXT NOT NULL,
  "beneficiaryId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL CHECK ("sourceType" IN ('manual','order','membership','compensation')),
  "sourceId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "grantedQuantity" DECIMAL(18,3) NOT NULL CHECK ("grantedQuantity">0),
  "validFrom" TIMESTAMPTZ NOT NULL,
  "validUntil" TIMESTAMPTZ NOT NULL,
  "priority" INT NOT NULL DEFAULT 0 CHECK ("priority" BETWEEN -100 AND 100),
  "locationId" TEXT,
  "grantedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT entitlement_window CHECK ("validFrom"<"validUntil"),
  CONSTRAINT "CustomerEntitlement_tenantId_id_key" UNIQUE ("tenantId","id"),
  CONSTRAINT "CustomerEntitlement_tenantId_sourceType_sourceId_beneficiaryId_benefitId_key"
    UNIQUE ("tenantId","sourceType","sourceId","beneficiaryId","benefitId"),
  CONSTRAINT "CustomerEntitlement_tenantId_benefitId_fkey" FOREIGN KEY ("tenantId","benefitId")
    REFERENCES public."BenefitDefinition"("tenantId","id") ON DELETE RESTRICT,
  CONSTRAINT "CustomerEntitlement_tenantId_beneficiaryId_fkey" FOREIGN KEY ("tenantId","beneficiaryId")
    REFERENCES public."Client"("tenantId","id") ON DELETE RESTRICT,
  CONSTRAINT "CustomerEntitlement_tenantId_locationId_fkey" FOREIGN KEY ("tenantId","locationId")
    REFERENCES public."BusinessLocation"("tenantId","id") ON DELETE RESTRICT
);
CREATE INDEX "CustomerEntitlement_tenantId_beneficiaryId_validUntil_idx"
 ON public."CustomerEntitlement"("tenantId","beneficiaryId","validUntil");

CREATE TABLE public."EntitlementLedgerEvent" (
  "id" TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  "tenantId" TEXT NOT NULL,
  "entitlementId" TEXT NOT NULL,
  "sequence" INT NOT NULL CHECK ("sequence">=1),
  "type" TEXT NOT NULL CHECK ("type" IN ('GRANT','CONSUME','RELEASE','EXPIRE','REFUND_REVOKE')),
  "quantity" DECIMAL(18,3) NOT NULL CHECK ("quantity">0),
  "effectKey" TEXT NOT NULL CHECK ("effectKey" ~ '^[A-Za-z0-9:_-]{8,128}$'),
  "bookingId" TEXT,
  "actorId" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EntitlementLedgerEvent_tenantId_entitlementId_sequence_key"
    UNIQUE ("tenantId","entitlementId","sequence"),
  CONSTRAINT "EntitlementLedgerEvent_tenantId_effectKey_key" UNIQUE ("tenantId","effectKey"),
  CONSTRAINT "EntitlementLedgerEvent_tenantId_entitlementId_fkey"
    FOREIGN KEY ("tenantId","entitlementId")
    REFERENCES public."CustomerEntitlement"("tenantId","id") ON DELETE RESTRICT,
  CONSTRAINT entitlement_grant_first CHECK ("type"<>'GRANT' OR "sequence"=1)
);
CREATE INDEX "EntitlementLedgerEvent_tenantId_entitlementId_createdAt_idx"
 ON public."EntitlementLedgerEvent"("tenantId","entitlementId","createdAt");

-- Do not allow rights-history destruction by generic Prisma clients.
CREATE FUNCTION public.customer_entitlement_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ENTITLEMENT_HISTORY_IMMUTABLE' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER customer_entitlement_no_mutation
 BEFORE UPDATE OR DELETE ON public."CustomerEntitlement"
 FOR EACH ROW EXECUTE FUNCTION public.customer_entitlement_immutable();
CREATE TRIGGER entitlement_event_no_mutation
 BEFORE UPDATE OR DELETE ON public."EntitlementLedgerEvent"
 FOR EACH ROW EXECUTE FUNCTION public.customer_entitlement_immutable();

-- FORCE RLS at creation; canonical #845 sidecar owns runtime policy after deploy.
DO $$
DECLARE t text; role_name text;
BEGIN
  FOREACH t IN ARRAY ARRAY['BenefitDefinition','CustomerEntitlement','EntitlementLedgerEvent'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='contagest_runtime') THEN
      IF t IN ('CustomerEntitlement','EntitlementLedgerEvent') THEN
        EXECUTE format('GRANT SELECT, INSERT ON public.%I TO contagest_runtime',t);
      ELSE
        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO contagest_runtime',t);
      END IF;
    END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','contagest_backup','contagest_monitor'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL ON public.%I FROM %I',t,role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;
