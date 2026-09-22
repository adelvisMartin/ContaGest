-- 28/51 · Veterinaria · trazabilidad de prescripción hacia el producto canónico.
-- CarePrescription continúa siendo la autoridad clínica; Product continúa siendo la autoridad de inventario.
-- No se crea lote ni movimiento de stock aquí: 29/51 es la frontera de inventario clínico.

ALTER TABLE public."CarePrescription"
  ADD COLUMN IF NOT EXISTS "productId" text,
  ADD COLUMN IF NOT EXISTS "labelSnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "veterinaryMeta" jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  ALTER TABLE public."CarePrescription"
    ADD CONSTRAINT "CarePrescription_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES public."Product"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "CarePrescription_tenant_product_idx"
  ON public."CarePrescription" ("tenantId","productId","createdAt" DESC);
