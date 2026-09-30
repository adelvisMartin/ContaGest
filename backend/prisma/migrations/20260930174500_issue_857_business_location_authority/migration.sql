-- #857 canonical tenant Business Location authority.
-- No legacy free-text location/room fields are reinterpreted without an explicit mapping.
CREATE TABLE IF NOT EXISTS "BusinessLocation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "timezone" TEXT NOT NULL,
  "addressGeocodeId" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessLocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessLocation_status_check" CHECK ("status" IN ('active','inactive','closed')),
  CONSTRAINT "BusinessLocation_code_check" CHECK ("code" = upper(btrim("code")) AND "code" ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'),
  CONSTRAINT "BusinessLocation_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BusinessLocation_address_fkey" FOREIGN KEY ("addressGeocodeId") REFERENCES "AddressGeocode"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "BusinessLocation_tenantId_code_key" ON "BusinessLocation"("tenantId","code");
CREATE INDEX IF NOT EXISTS "BusinessLocation_tenantId_status_idx" ON "BusinessLocation"("tenantId","status");
CREATE INDEX IF NOT EXISTS "BusinessLocation_tenantId_addressGeocodeId_idx" ON "BusinessLocation"("tenantId","addressGeocodeId");

CREATE OR REPLACE FUNCTION public.contagest_business_location_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW."timezone") THEN
    RAISE EXCEPTION 'BUSINESS_LOCATION_TIMEZONE_INVALID:%', NEW."timezone" USING ERRCODE='23514';
  END IF;
  IF NEW."addressGeocodeId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "AddressGeocode" a WHERE a."id"=NEW."addressGeocodeId" AND a."tenantId"=NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'BUSINESS_LOCATION_ADDRESS_TENANT_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "BusinessLocation_guard" ON "BusinessLocation";
CREATE TRIGGER "BusinessLocation_guard"
BEFORE INSERT OR UPDATE OF "tenantId","timezone","addressGeocodeId" ON "BusinessLocation"
FOR EACH ROW EXECUTE FUNCTION public.contagest_business_location_guard();
