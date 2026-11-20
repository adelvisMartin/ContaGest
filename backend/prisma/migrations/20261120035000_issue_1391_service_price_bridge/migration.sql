-- #1391 / #849 / #856: enable tenant-scoped service PriceEntry.
-- Historical price entries/snapshots and applied migrations remain unchanged.
-- ServiceDefinition must exist (migration #849) before applying this patch.
CREATE OR REPLACE FUNCTION public.contagest_price_entry_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "PriceBook" b WHERE b."id"=NEW."priceBookId" AND b."tenantId"=NEW."tenantId") THEN
    RAISE EXCEPTION 'PRICE_BOOK_TENANT_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF NEW."targetType"='product' AND NOT EXISTS (
    SELECT 1 FROM "Product" p WHERE p."id"=NEW."targetId" AND p."tenantId"=NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'PRICE_PRODUCT_TENANT_MISMATCH' USING ERRCODE='23514';
  END IF;
  -- Canonical service identity is in #849. Archiving does not rewrite history.
  IF NEW."targetType"='service' AND NOT EXISTS (
    SELECT 1 FROM public."ServiceDefinition" s
    WHERE s."id"=NEW."targetId" AND s."tenantId"=NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'PRICE_SERVICE_TENANT_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF NEW."status"='active' AND EXISTS (
    SELECT 1 FROM "PriceEntry" e
    WHERE e."id"<>NEW."id"
      AND e."tenantId"=NEW."tenantId"
      AND e."priceBookId"=NEW."priceBookId"
      AND e."targetType"=NEW."targetType"
      AND e."targetId"=NEW."targetId"
      AND e."status"='active'
      AND COALESCE(e."effectiveTo", 'infinity'::timestamp) > NEW."effectiveFrom"
      AND COALESCE(NEW."effectiveTo", 'infinity'::timestamp) > e."effectiveFrom"
  ) THEN
    RAISE EXCEPTION 'PRICE_ENTRY_EFFECTIVE_OVERLAP' USING ERRCODE='23P01';
  END IF;
  RETURN NEW;
END $$;
