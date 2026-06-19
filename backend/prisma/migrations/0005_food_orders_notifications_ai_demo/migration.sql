-- v6.2: pedidos fast-food, notificaciones, mapas, IA y demos controlados.
-- Prisma genera el SQL definitivo con prisma migrate; este archivo documenta las tablas esperadas para Supabase/PostgreSQL.

CREATE TABLE IF NOT EXISTS "FoodOrder" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "number" text NOT NULL,
  "source" text NOT NULL DEFAULT 'counter',
  "serviceMode" text NOT NULL DEFAULT 'dine_in',
  "status" text NOT NULL DEFAULT 'new',
  "paymentStatus" text NOT NULL DEFAULT 'pending',
  "customer" text,
  "phone" text,
  "table" text,
  "address" text,
  "subtotal" numeric(18,2) NOT NULL DEFAULT 0,
  "iva" numeric(18,2) NOT NULL DEFAULT 0,
  "total" numeric(18,2) NOT NULL DEFAULT 0,
  "notes" text,
  "payload" jsonb NOT NULL DEFAULT '{}',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "NotificationLog" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "userId" text,
  "channel" text NOT NULL,
  "recipient" text,
  "subject" text,
  "message" text,
  "status" text NOT NULL DEFAULT 'queued',
  "provider" text,
  "providerId" text,
  "error" text,
  "payload" jsonb NOT NULL DEFAULT '{}',
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "FoodOrder_tenant_status_idx" ON "FoodOrder" ("tenantId","status","createdAt");
CREATE INDEX IF NOT EXISTS "NotificationLog_tenant_channel_idx" ON "NotificationLog" ("tenantId","channel","createdAt");
