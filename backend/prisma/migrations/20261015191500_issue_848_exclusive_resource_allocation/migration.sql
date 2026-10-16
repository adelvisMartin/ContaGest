-- #848 Shared Scheduling resource allocation authority, stage 1: exclusive capacity=1.
-- DRAFT: DO NOT APPLY without PG17 from-zero/upgrade/two-writer/tenant tests.
-- Source is authoritative: Product, fiscal, entitlement and vertical state are untouched.
BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- A scoped FK cannot rely only on a globally unique location ID: tenant congruence
-- is checked by the FK itself, including writes outside the HTTP boundary.
CREATE UNIQUE INDEX IF NOT EXISTS "BusinessLocation_tenantId_id_key"
  ON public."BusinessLocation" ("tenantId", "id");

CREATE TABLE public."SchedulingResource" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "capacity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchedulingResource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchedulingResource_location_fkey" FOREIGN KEY ("tenantId", "locationId")
    REFERENCES public."BusinessLocation" ("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "SchedulingResource_tenant_fkey" FOREIGN KEY ("tenantId")
    REFERENCES public."Tenant" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "SchedulingResource_code_chk" CHECK (
    "code" = upper(btrim("code")) AND "code" ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'),
  CONSTRAINT "SchedulingResource_status_chk" CHECK ("status" IN ('active','inactive','retired')),
  -- Capacity >1 requires the separately tested transactional capacity authority;
  -- relaxing this CHECK before shipping that authority would overbook a resource.
  CONSTRAINT "SchedulingResource_capacity_chk" CHECK ("capacity" = 1),
  CONSTRAINT "SchedulingResource_kind_chk" CHECK (
    char_length("kind") BETWEEN 1 AND 64 AND "kind" ~ '^[a-z][a-z0-9_-]*$')
);
CREATE UNIQUE INDEX "SchedulingResource_tenant_location_id_key"
  ON public."SchedulingResource" ("tenantId","locationId","id");
CREATE UNIQUE INDEX "SchedulingResource_tenant_location_code_key"
  ON public."SchedulingResource" ("tenantId","locationId","code");
CREATE INDEX "SchedulingResource_tenant_location_status_idx"
  ON public."SchedulingResource" ("tenantId","locationId","status");

CREATE TABLE public."SchedulingBooking" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'confirmed',
  "startsAtUtc" TIMESTAMPTZ(3) NOT NULL,
  "endsAtUtc" TIMESTAMPTZ(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchedulingBooking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchedulingBooking_location_fkey" FOREIGN KEY ("tenantId","locationId")
    REFERENCES public."BusinessLocation" ("tenantId","id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "SchedulingBooking_tenant_fkey" FOREIGN KEY ("tenantId")
    REFERENCES public."Tenant" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "SchedulingBooking_dates_chk" CHECK ("endsAtUtc" > "startsAtUtc"),
  CONSTRAINT "SchedulingBooking_status_chk" CHECK ("status" IN ('confirmed','cancelled')),
  CONSTRAINT "SchedulingBooking_source_chk" CHECK (
    char_length("sourceType") BETWEEN 1 AND 64 AND "sourceType" ~ '^[a-z][a-z0-9_-]*$'
    AND char_length("sourceId") BETWEEN 1 AND 128),
  CONSTRAINT "SchedulingBooking_actor_chk" CHECK (char_length("createdBy") BETWEEN 1 AND 128),
  CONSTRAINT "SchedulingBooking_idempotency_chk" CHECK (
    "idempotencyKey" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
);
CREATE UNIQUE INDEX "SchedulingBooking_tenant_location_id_key"
  ON public."SchedulingBooking" ("tenantId","locationId","id");
CREATE UNIQUE INDEX "SchedulingBooking_tenant_idempotency_key"
  ON public."SchedulingBooking" ("tenantId","idempotencyKey");
CREATE INDEX "SchedulingBooking_tenant_location_startsAtUtc_idx"
  ON public."SchedulingBooking" ("tenantId","locationId","startsAtUtc");

CREATE TABLE public."SchedulingResourceAllocation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "occupiedStartAt" TIMESTAMPTZ(3) NOT NULL,
  "occupiedEndAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchedulingResourceAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SchedulingResourceAllocation_booking_fkey"
    FOREIGN KEY ("tenantId","locationId","bookingId")
    REFERENCES public."SchedulingBooking" ("tenantId","locationId","id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "SchedulingResourceAllocation_resource_fkey"
    FOREIGN KEY ("resourceId") REFERENCES public."SchedulingResource" ("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "SchedulingResourceAllocation_resource_tenant_location_fk"
    FOREIGN KEY ("tenantId","locationId","resourceId")
    REFERENCES public."SchedulingResource" ("tenantId","locationId","id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "SchedulingResourceAllocation_dates_chk" CHECK ("occupiedEndAt" > "occupiedStartAt"),
  CONSTRAINT "SchedulingResourceAllocation_status_chk" CHECK ("status" IN ('active','released')),
  CONSTRAINT "SchedulingResourceAllocation_step_chk" CHECK (
    char_length("stepId") BETWEEN 1 AND 64 AND "stepId" ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$')
);
CREATE UNIQUE INDEX "SchedulingResourceAllocation_booking_step_resource_key"
  ON public."SchedulingResourceAllocation" ("bookingId","stepId","resourceId");
CREATE INDEX "SchedulingResourceAllocation_tenant_resource_start_idx"
  ON public."SchedulingResourceAllocation" ("tenantId","resourceId","occupiedStartAt");
CREATE INDEX "SchedulingResourceAllocation_tenant_booking_idx"
  ON public."SchedulingResourceAllocation" ("tenantId","bookingId");

-- GiST runs in PostgreSQL, not a SELECT-before-INSERT application check.
-- Two concurrent writers can NEVER commit overlapping active claims on one
-- resource (including cross-vertical): the database rejects SQLSTATE 23P01.
ALTER TABLE public."SchedulingResourceAllocation"
  ADD CONSTRAINT "SchedulingResourceAllocation_no_active_overlap"
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "resourceId" WITH =,
    tstzrange("occupiedStartAt","occupiedEndAt",'[)') WITH &&
  ) WHERE ("status" = 'active');

-- Runtime session binding is transaction-scoped in #845. Missing tenant context
-- yields NULL and therefore no row visibility/write permission. Never trust a
-- client-provided tenantId or a user-provided SET inside an API.
ALTER TABLE public."SchedulingResource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SchedulingResource" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."SchedulingBooking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SchedulingBooking" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."SchedulingResourceAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SchedulingResourceAllocation" FORCE ROW LEVEL SECURITY;

CREATE POLICY "SchedulingResource_tenant_guard" ON public."SchedulingResource"
  FOR ALL USING ("tenantId" = NULLIF(current_setting('contagest.tenant_id',true),''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('contagest.tenant_id',true),''));
CREATE POLICY "SchedulingBooking_tenant_guard" ON public."SchedulingBooking"
  FOR ALL USING ("tenantId" = NULLIF(current_setting('contagest.tenant_id',true),''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('contagest.tenant_id',true),''));
CREATE POLICY "SchedulingResourceAllocation_tenant_guard" ON public."SchedulingResourceAllocation"
  FOR ALL USING ("tenantId" = NULLIF(current_setting('contagest.tenant_id',true),''))
  WITH CHECK ("tenantId" = NULLIF(current_setting('contagest.tenant_id',true),''));

REVOKE ALL ON TABLE public."SchedulingResource",
                    public."SchedulingBooking",
                    public."SchedulingResourceAllocation" FROM PUBLIC;
DO $grants$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL ON TABLE public."SchedulingResource", public."SchedulingBooking", public."SchedulingResourceAllocation" FROM %I',
        role_name
      );
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='contagest_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE
      public."SchedulingResource", public."SchedulingBooking",
      public."SchedulingResourceAllocation" TO contagest_runtime;
  END IF;
END $grants$;

COMMIT;
