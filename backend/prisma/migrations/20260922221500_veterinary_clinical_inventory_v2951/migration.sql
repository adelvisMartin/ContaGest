-- 29/51 · Inventario clínico veterinario.
-- InventoryLot sólo conserva metadata de lote/vencimiento.
-- El saldo continúa derivado exclusivamente de InventoryMovement + Product.stock.

CREATE TABLE IF NOT EXISTS public."InventoryLot" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL,
  "productId" text NOT NULL REFERENCES public."Product"("id") ON DELETE RESTRICT,
  "lotNumber" text NOT NULL,
  "expiresAt" date,
  "receivedAt" timestamptz NOT NULL DEFAULT now(),
  "notes" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "InventoryLot_tenant_product_lot_unique" UNIQUE ("tenantId","productId","lotNumber")
);

CREATE INDEX IF NOT EXISTS "InventoryLot_tenant_product_expiry_idx"
  ON public."InventoryLot" ("tenantId","productId","expiresAt");

ALTER TABLE public."InventoryMovement"
  ADD COLUMN IF NOT EXISTS "lotId" text;

DO $$
BEGIN
  ALTER TABLE public."InventoryMovement"
    ADD CONSTRAINT "InventoryMovement_lotId_fkey"
    FOREIGN KEY ("lotId") REFERENCES public."InventoryLot"("id") ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "InventoryMovement_tenant_lot_created_idx"
  ON public."InventoryMovement" ("tenantId","lotId","createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryMovement_vet_clinical_act_unique"
  ON public."InventoryMovement" ("tenantId","source","sourceId")
  WHERE "source"='veterinary-prescription' AND "sourceId" IS NOT NULL;

ALTER TABLE public."InventoryLot" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."InventoryLot" FROM anon, authenticated;
