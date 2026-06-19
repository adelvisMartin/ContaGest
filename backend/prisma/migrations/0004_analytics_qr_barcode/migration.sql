ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "barcode" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "qrCode" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "qrPayload" JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS "Product_tenantId_barcode_key" ON "Product"("tenantId", "barcode") WHERE "barcode" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Product_tenantId_qrCode_idx" ON "Product"("tenantId", "qrCode");

CREATE TABLE IF NOT EXISTS "ProductCode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'barcode',
  "value" TEXT NOT NULL,
  "format" TEXT NOT NULL DEFAULT 'code128',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductCode_tenantId_value_key" ON "ProductCode"("tenantId", "value");
CREATE INDEX IF NOT EXISTS "ProductCode_tenantId_productId_idx" ON "ProductCode"("tenantId", "productId");

CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "route" TEXT,
  "userAgent" TEXT,
  "viewport" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_tenantId_type_createdAt_idx" ON "AnalyticsEvent"("tenantId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_tenantId_route_createdAt_idx" ON "AnalyticsEvent"("tenantId", "route", "createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_tenantId_sessionId_idx" ON "AnalyticsEvent"("tenantId", "sessionId");
