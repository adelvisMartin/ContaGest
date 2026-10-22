-- #756: tenant-isolated reorder policy. Policy is NOT stock, purchase order, reservation, or ledger.
-- Forward only, no backfill; existing Product.minStock remains unchanged and authoritative for legacy reports.
CREATE TABLE public."InventoryReorderPolicy" (
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "reorderPoint" NUMERIC(18,3) NOT NULL,
  "targetStock" NUMERIC(18,3) NOT NULL,
  "safetyStock" NUMERIC(18,3) NOT NULL DEFAULT 0,
  "orderMultiple" NUMERIC(18,3) NOT NULL DEFAULT 1,
  "leadTimeDays" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryReorderPolicy_pkey" PRIMARY KEY ("tenantId","productId"),
  CONSTRAINT "InventoryReorderPolicy_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE RESTRICT,
  CONSTRAINT "InventoryReorderPolicy_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES public."Product"("id") ON DELETE RESTRICT,
  -- The composite unique Product index is owned by #634 and prevents cross-tenant references.
  CONSTRAINT "InventoryReorderPolicy_product_tenant_fkey"
    FOREIGN KEY ("tenantId","productId") REFERENCES public."Product"("tenantId","id") ON DELETE RESTRICT,
  CONSTRAINT "InventoryReorderPolicy_values_ck"
    CHECK ("reorderPoint" >= 0 AND "safetyStock" >= 0 AND
           "safetyStock" <= "reorderPoint" AND "targetStock" > "reorderPoint" AND
           "orderMultiple" > 0 AND "leadTimeDays" BETWEEN 0 AND 365 AND
           "revision" BETWEEN 1 AND 2147483646)
);

CREATE INDEX "InventoryReorderPolicy_tenant_enabled_idx"
  ON public."InventoryReorderPolicy" ("tenantId", "enabled");

-- Deny publicly exposed Supabase roles; all operations require backend runtime and tenant RLS.
REVOKE ALL ON public."InventoryReorderPolicy" FROM PUBLIC;
DO $
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public."InventoryReorderPolicy" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public."InventoryReorderPolicy" FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='contagest_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON public."InventoryReorderPolicy" TO contagest_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT, INSERT, UPDATE ON public."InventoryReorderPolicy" TO service_role;
  END IF;
END $$;
ALTER TABLE public."InventoryReorderPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."InventoryReorderPolicy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "InventoryReorderPolicy_tenant_isolation"
  ON public."InventoryReorderPolicy"
  USING ("tenantId" = private.current_tenant_id())
  WITH CHECK ("tenantId" = private.current_tenant_id());

COMMENT ON TABLE public."InventoryReorderPolicy" IS
  '#756 Operational reorder assumptions only. Never calculate or persist stock or execute purchases here.';
