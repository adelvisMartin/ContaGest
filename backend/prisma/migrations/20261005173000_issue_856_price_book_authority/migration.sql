-- #856 canonical Price Book authority.
-- Pricing owns commercial base-price selection only. Tax, FX discovery, promotions and entitlements remain separate authorities.

CREATE TABLE IF NOT EXISTS "PriceBook" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "priceMode" TEXT NOT NULL DEFAULT 'fixed',
  "status" TEXT NOT NULL DEFAULT 'active',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "locationScope" TEXT NOT NULL DEFAULT 'global',
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceBook_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PriceBook_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PriceBook_code_check" CHECK ("code" = upper(btrim("code")) AND "code" ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'),
  CONSTRAINT "PriceBook_currency_check" CHECK ("currency" = upper(btrim("currency")) AND char_length("currency") BETWEEN 3 AND 8),
  CONSTRAINT "PriceBook_mode_check" CHECK ("priceMode" IN ('fixed','fx_derived')),
  CONSTRAINT "PriceBook_status_check" CHECK ("status" IN ('active','archived')),
  CONSTRAINT "PriceBook_location_scope_check" CHECK ("locationScope" IN ('global','specific_locations')),
  CONSTRAINT "PriceBook_priority_check" CHECK ("priority" BETWEEN -1000000 AND 1000000),
  CONSTRAINT "PriceBook_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "PriceBook_tenantId_code_key" ON "PriceBook"("tenantId","code");
CREATE UNIQUE INDEX IF NOT EXISTS "PriceBook_tenantId_id_key" ON "PriceBook"("tenantId","id");
CREATE INDEX IF NOT EXISTS "PriceBook_tenantId_status_currency_idx" ON "PriceBook"("tenantId","status","currency","priority");

CREATE TABLE IF NOT EXISTS "PriceBookLocation" (
  "tenantId" TEXT NOT NULL,
  "priceBookId" TEXT NOT NULL,
  "businessLocationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceBookLocation_pkey" PRIMARY KEY ("priceBookId","businessLocationId"),
  CONSTRAINT "PriceBookLocation_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PriceBookLocation_book_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PriceBookLocation_location_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PriceBookLocation_tenant_location_idx" ON "PriceBookLocation"("tenantId","businessLocationId");

CREATE TABLE IF NOT EXISTS "PriceEntry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "priceBookId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'active',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PriceEntry_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PriceEntry_book_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PriceEntry_target_type_check" CHECK ("targetType" IN ('product','service')),
  CONSTRAINT "PriceEntry_amount_check" CHECK ("amount" >= 0),
  CONSTRAINT "PriceEntry_effective_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  CONSTRAINT "PriceEntry_status_check" CHECK ("status" IN ('active','archived')),
  CONSTRAINT "PriceEntry_version_check" CHECK ("version" > 0)
);
CREATE INDEX IF NOT EXISTS "PriceEntry_resolution_idx" ON "PriceEntry"("tenantId","targetType","targetId","status","effectiveFrom");
CREATE INDEX IF NOT EXISTS "PriceEntry_book_target_idx" ON "PriceEntry"("priceBookId","targetType","targetId","effectiveFrom");

CREATE TABLE IF NOT EXISTS "SalesLinePriceSnapshot" (
  "salesInvoiceLineId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "priceBookId" TEXT NOT NULL,
  "priceEntryId" TEXT NOT NULL,
  "priceBookVersion" INTEGER NOT NULL,
  "priceEntryVersion" INTEGER NOT NULL,
  "priceMode" TEXT NOT NULL,
  "sourceAmount" DECIMAL(18,2) NOT NULL,
  "sourceCurrency" TEXT NOT NULL,
  "finalUnitPrice" DECIMAL(18,2) NOT NULL,
  "documentCurrency" TEXT NOT NULL,
  "fxRate" DECIMAL(18,4),
  "fxRateDate" TIMESTAMP(3),
  "fxRateSource" TEXT,
  "businessLocationId" TEXT,
  "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesLinePriceSnapshot_pkey" PRIMARY KEY ("salesInvoiceLineId"),
  CONSTRAINT "SalesLinePriceSnapshot_line_fkey" FOREIGN KEY ("salesInvoiceLineId") REFERENCES "SalesInvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SalesLinePriceSnapshot_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SalesLinePriceSnapshot_book_fkey" FOREIGN KEY ("priceBookId") REFERENCES "PriceBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SalesLinePriceSnapshot_entry_fkey" FOREIGN KEY ("priceEntryId") REFERENCES "PriceEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SalesLinePriceSnapshot_location_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SalesLinePriceSnapshot_mode_check" CHECK ("priceMode" IN ('fixed','fx_derived'))
);
CREATE INDEX IF NOT EXISTS "SalesLinePriceSnapshot_tenant_book_idx" ON "SalesLinePriceSnapshot"("tenantId","priceBookId","resolvedAt");

CREATE OR REPLACE FUNCTION public.contagest_price_book_location_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "PriceBook" b WHERE b."id"=NEW."priceBookId" AND b."tenantId"=NEW."tenantId") THEN
    RAISE EXCEPTION 'PRICE_BOOK_TENANT_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "BusinessLocation" l WHERE l."id"=NEW."businessLocationId" AND l."tenantId"=NEW."tenantId") THEN
    RAISE EXCEPTION 'PRICE_LOCATION_TENANT_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PriceBookLocation_tenant_guard" ON "PriceBookLocation";
CREATE TRIGGER "PriceBookLocation_tenant_guard"
BEFORE INSERT OR UPDATE ON "PriceBookLocation"
FOR EACH ROW EXECUTE FUNCTION public.contagest_price_book_location_guard();

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
  -- Service Catalog #849 is not yet an authority on this baseline. Fail closed instead of accepting an unverifiable cross-tenant service id.
  IF NEW."targetType"='service' THEN
    RAISE EXCEPTION 'PRICE_SERVICE_AUTHORITY_UNAVAILABLE' USING ERRCODE='23514';
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
DROP TRIGGER IF EXISTS "PriceEntry_guard" ON "PriceEntry";
CREATE TRIGGER "PriceEntry_guard"
BEFORE INSERT OR UPDATE OF "tenantId","priceBookId","targetType","targetId","status","effectiveFrom","effectiveTo" ON "PriceEntry"
FOR EACH ROW EXECUTE FUNCTION public.contagest_price_entry_guard();

CREATE OR REPLACE FUNCTION public.contagest_used_price_entry_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE latest_use timestamp;
BEGIN
  IF TG_OP='DELETE' THEN
    IF EXISTS (SELECT 1 FROM "SalesLinePriceSnapshot" s WHERE s."priceEntryId"=OLD."id") THEN
      RAISE EXCEPTION 'USED_PRICE_ENTRY_IMMUTABLE' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  SELECT max(s."resolvedAt") INTO latest_use FROM "SalesLinePriceSnapshot" s WHERE s."priceEntryId"=OLD."id";
  IF latest_use IS NOT NULL THEN
    IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
       OR NEW."priceBookId" IS DISTINCT FROM OLD."priceBookId"
       OR NEW."targetType" IS DISTINCT FROM OLD."targetType"
       OR NEW."targetId" IS DISTINCT FROM OLD."targetId"
       OR NEW."amount" IS DISTINCT FROM OLD."amount"
       OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom"
       OR NEW."version" IS DISTINCT FROM OLD."version" THEN
      RAISE EXCEPTION 'USED_PRICE_ENTRY_IMMUTABLE' USING ERRCODE='23514';
    END IF;
    IF NEW."effectiveTo" IS NOT NULL AND NEW."effectiveTo" < latest_use THEN
      RAISE EXCEPTION 'USED_PRICE_ENTRY_INTERVAL_INVALID' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "PriceEntry_used_immutability" ON "PriceEntry";
CREATE TRIGGER "PriceEntry_used_immutability"
BEFORE UPDATE OR DELETE ON "PriceEntry"
FOR EACH ROW EXECUTE FUNCTION public.contagest_used_price_entry_immutability();

CREATE OR REPLACE FUNCTION public.contagest_price_snapshot_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PRICE_SNAPSHOT_IMMUTABLE' USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS "SalesLinePriceSnapshot_immutable" ON "SalesLinePriceSnapshot";
CREATE TRIGGER "SalesLinePriceSnapshot_immutable"
BEFORE UPDATE OR DELETE ON "SalesLinePriceSnapshot"
FOR EACH ROW EXECUTE FUNCTION public.contagest_price_snapshot_immutable();

-- Backward-compatible migration: Product.price historically had no explicit currency.
-- Sales already defaults legacy documents to VES, so legacy product prices are fixed in VES.
INSERT INTO "PriceBook" ("id","tenantId","code","name","currency","priceMode","status","priority","locationScope","isSystem","version")
SELECT 'legacy-product:' || t."id", t."id", 'LEGACY_PRODUCT', 'Precio legacy de productos', 'VES', 'fixed', 'active', 0, 'global', true, 1
FROM "Tenant" t
ON CONFLICT ("tenantId","code") DO NOTHING;

INSERT INTO "PriceEntry" ("id","tenantId","priceBookId","targetType","targetId","amount","effectiveFrom","status","version")
SELECT 'legacy-entry:' || md5(p."id"), p."tenantId", b."id", 'product', p."id", p."price", TIMESTAMP '1970-01-01 00:00:00', 'active', 1
FROM "Product" p
JOIN "PriceBook" b ON b."tenantId"=p."tenantId" AND b."code"='LEGACY_PRODUCT'
WHERE NOT EXISTS (
  SELECT 1 FROM "PriceEntry" e WHERE e."tenantId"=p."tenantId" AND e."priceBookId"=b."id" AND e."targetType"='product' AND e."targetId"=p."id" AND e."status"='active'
);

CREATE OR REPLACE FUNCTION public.contagest_sync_legacy_product_price()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE book_id text;
DECLARE current_entry "PriceEntry"%ROWTYPE;
DECLARE next_version integer;
DECLARE boundary timestamp := clock_timestamp();
BEGIN
  IF TG_OP='UPDATE' AND NEW."price" IS NOT DISTINCT FROM OLD."price" AND NEW."tenantId" IS NOT DISTINCT FROM OLD."tenantId" THEN
    RETURN NEW;
  END IF;

  INSERT INTO "PriceBook" ("id","tenantId","code","name","currency","priceMode","status","priority","locationScope","isSystem","version")
  VALUES ('legacy-product:' || NEW."tenantId", NEW."tenantId", 'LEGACY_PRODUCT', 'Precio legacy de productos', 'VES', 'fixed', 'active', 0, 'global', true, 1)
  ON CONFLICT ("tenantId","code") DO NOTHING;
  SELECT b."id" INTO book_id FROM "PriceBook" b WHERE b."tenantId"=NEW."tenantId" AND b."code"='LEGACY_PRODUCT' LIMIT 1;

  SELECT e.* INTO current_entry FROM "PriceEntry" e
  WHERE e."tenantId"=NEW."tenantId" AND e."priceBookId"=book_id AND e."targetType"='product' AND e."targetId"=NEW."id" AND e."status"='active' AND e."effectiveTo" IS NULL
  ORDER BY e."effectiveFrom" DESC LIMIT 1 FOR UPDATE;

  IF current_entry."id" IS NULL THEN
    INSERT INTO "PriceEntry" ("id","tenantId","priceBookId","targetType","targetId","amount","effectiveFrom","status","version")
    VALUES (gen_random_uuid()::text,NEW."tenantId",book_id,'product',NEW."id",NEW."price",boundary,'active',1);
  ELSIF current_entry."amount" IS DISTINCT FROM NEW."price" THEN
    next_version := current_entry."version" + 1;
    IF EXISTS (SELECT 1 FROM "SalesLinePriceSnapshot" s WHERE s."priceEntryId"=current_entry."id") THEN
      UPDATE "PriceEntry" SET "effectiveTo"=boundary WHERE "id"=current_entry."id";
      INSERT INTO "PriceEntry" ("id","tenantId","priceBookId","targetType","targetId","amount","effectiveFrom","status","version")
      VALUES (gen_random_uuid()::text,NEW."tenantId",book_id,'product',NEW."id",NEW."price",boundary,'active',next_version);
    ELSE
      UPDATE "PriceEntry" SET "amount"=NEW."price", "version"=next_version WHERE "id"=current_entry."id";
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Product_sync_legacy_price" ON "Product";
CREATE TRIGGER "Product_sync_legacy_price"
AFTER INSERT OR UPDATE OF "price","tenantId" ON "Product"
FOR EACH ROW EXECUTE FUNCTION public.contagest_sync_legacy_product_price();

CREATE OR REPLACE FUNCTION public.contagest_sales_line_price_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inv record;
DECLARE winner record;
DECLARE winner_count integer;
DECLARE resolved numeric(18,2);
BEGIN
  IF NEW."productId" IS NULL THEN RETURN NEW; END IF;
  SELECT i."tenantId", upper(i."currency") AS currency, i."exchangeRate", i."issueDate", i."status" AS status
  INTO inv FROM "SalesInvoice" i WHERE i."id"=NEW."invoiceId";
  IF inv."tenantId" IS NULL THEN RAISE EXCEPTION 'PRICE_SALES_INVOICE_CONTEXT_MISSING' USING ERRCODE='23514'; END IF;

  WITH eligible AS (
    SELECT e."id" AS entry_id,e."amount",e."version" AS entry_version,b."id" AS book_id,b."version" AS book_version,b."priceMode",b."currency",b."priority",
      CASE WHEN b."priceMode"='fixed' THEN e."amount"
           WHEN upper(b."currency")=inv.currency THEN e."amount"
           ELSE round(e."amount" / NULLIF(inv."exchangeRate",0),2) END AS materialized
    FROM "PriceEntry" e JOIN "PriceBook" b ON b."id"=e."priceBookId" AND b."tenantId"=e."tenantId"
    WHERE e."tenantId"=inv."tenantId" AND e."targetType"='product' AND e."targetId"=NEW."productId" AND e."status"='active'
      AND b."status"='active' AND b."locationScope"='global'
      AND e."effectiveFrom"<=inv."issueDate" AND (e."effectiveTo" IS NULL OR e."effectiveTo">inv."issueDate")
      AND (b."priceMode"='fx_derived' OR upper(b."currency")=inv.currency)
  ), ranked AS (SELECT *,max(priority) OVER() AS top_priority FROM eligible)
  SELECT count(*)::int INTO winner_count FROM ranked WHERE priority=top_priority;

  IF winner_count=0 THEN RAISE EXCEPTION 'PRICE_AUTHORITY_NOT_FOUND' USING ERRCODE='23514'; END IF;
  IF winner_count>1 THEN RAISE EXCEPTION 'PRICE_AUTHORITY_AMBIGUOUS' USING ERRCODE='23514'; END IF;

  SELECT e."id" AS entry_id,e."amount",e."version" AS entry_version,b."id" AS book_id,b."version" AS book_version,b."priceMode",b."currency",b."priority",
    CASE WHEN b."priceMode"='fixed' THEN e."amount"
         WHEN upper(b."currency")=inv.currency THEN e."amount"
         ELSE round(e."amount" / NULLIF(inv."exchangeRate",0),2) END AS materialized
  INTO winner
  FROM "PriceEntry" e JOIN "PriceBook" b ON b."id"=e."priceBookId" AND b."tenantId"=e."tenantId"
  WHERE e."tenantId"=inv."tenantId" AND e."targetType"='product' AND e."targetId"=NEW."productId" AND e."status"='active'
    AND b."status"='active' AND b."locationScope"='global'
    AND e."effectiveFrom"<=inv."issueDate" AND (e."effectiveTo" IS NULL OR e."effectiveTo">inv."issueDate")
    AND (b."priceMode"='fx_derived' OR upper(b."currency")=inv.currency)
  ORDER BY b."priority" DESC LIMIT 1;

  resolved := winner.materialized;
  IF resolved IS NULL OR NEW."unitPrice" IS DISTINCT FROM resolved THEN
    RAISE EXCEPTION 'PRICE_SNAPSHOT_MISMATCH expected=% actual=%', resolved, NEW."unitPrice" USING ERRCODE='23514';
  END IF;

  -- Draft sales remain deletable/editable; immutable price evidence starts on finalized sales.
  IF inv.status='draft' THEN RETURN NEW; END IF;

  INSERT INTO "SalesLinePriceSnapshot" ("salesInvoiceLineId","tenantId","priceBookId","priceEntryId","priceBookVersion","priceEntryVersion","priceMode","sourceAmount","sourceCurrency","finalUnitPrice","documentCurrency","fxRate","fxRateDate","fxRateSource")
  VALUES (NEW."id",inv."tenantId",winner.book_id,winner.entry_id,winner.book_version,winner.entry_version,winner."priceMode",winner.amount,upper(winner.currency),resolved,inv.currency,
    CASE WHEN winner."priceMode"='fx_derived' AND upper(winner.currency)<>inv.currency THEN inv."exchangeRate" ELSE NULL END,
    CASE WHEN winner."priceMode"='fx_derived' AND upper(winner.currency)<>inv.currency THEN inv."issueDate" ELSE NULL END,
    CASE WHEN winner."priceMode"='fx_derived' AND upper(winner.currency)<>inv.currency THEN 'sales-document-exchange-rate' ELSE NULL END);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "SalesInvoiceLine_price_snapshot" ON "SalesInvoiceLine";
CREATE TRIGGER "SalesInvoiceLine_price_snapshot"
AFTER INSERT ON "SalesInvoiceLine"
FOR EACH ROW EXECUTE FUNCTION public.contagest_sales_line_price_snapshot();
