-- ContaGest-VE Enterprise v8.3 - Full Supabase Schema Bundle
-- Ejecutar en Supabase SQL Editor si prefieres crear todo sin Prisma CLI.
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;


-- =====================================================
-- Migration: 0001_init
-- =====================================================
-- Supabase/PostgreSQL hardening baseline for ContaGest-VE.
-- Run after `prisma migrate dev` or paste in Supabase SQL editor if using SQL-first.
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- RLS examples. Prisma creates tables with quoted PascalCase model names by default.
-- If you map to snake_case later, update table names accordingly.
alter table if exists "Tenant" enable row level security;
alter table if exists "Client" enable row level security;
alter table if exists "Supplier" enable row level security;
alter table if exists "Product" enable row level security;
alter table if exists "SalesInvoice" enable row level security;
alter table if exists "PurchaseInvoice" enable row level security;
alter table if exists "LedgerEntry" enable row level security;
alter table if exists "BankAccount" enable row level security;
alter table if exists "Employee" enable row level security;
alter table if exists "TaxPeriod" enable row level security;
alter table if exists "AuditLog" enable row level security;

-- Policy pattern for Supabase Auth. Requires UserProfile.authUserId = auth.uid()::text.
-- Apply per table after migration in Supabase SQL Editor.
-- create policy "tenant members can read clients" on "Client" for select using (
--   "tenantId" in (select "tenantId" from "UserProfile" where "authUserId" = auth.uid()::text)
-- );


-- =====================================================
-- Migration: 0003_accounting_hr_fiscal_hardening
-- =====================================================
-- ContaGest-VE v6: catálogo contable, reglas contables, documentos fiscales inmutables, parámetros RRHH y cierres por período.
CREATE TABLE IF NOT EXISTS "ChartAccount" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "nature" TEXT NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 1,
  "parentCode" TEXT,
  "allowPosting" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChartAccount_tenantId_code_key" ON "ChartAccount"("tenantId","code");
CREATE INDEX IF NOT EXISTS "ChartAccount_tenantId_type_idx" ON "ChartAccount"("tenantId","type");
CREATE INDEX IF NOT EXISTS "ChartAccount_tenantId_parentCode_idx" ON "ChartAccount"("tenantId","parentCode");

CREATE TABLE IF NOT EXISTS "AccountingRule" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "source" "LedgerSource" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "template" JSONB NOT NULL DEFAULT '{}',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingRule_tenantId_source_name_key" ON "AccountingRule"("tenantId","source","name");

CREATE TABLE IF NOT EXISTS "FiscalDocument" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'issued',
  "hash" TEXT NOT NULL,
  "fileUrl" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "FiscalDocument_tenantId_kind_number_key" ON "FiscalDocument"("tenantId","kind","number");
CREATE INDEX IF NOT EXISTS "FiscalDocument_tenantId_period_idx" ON "FiscalDocument"("tenantId","period");

CREATE TABLE IF NOT EXISTS "HrParameter" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "value" DECIMAL(18,4) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'percent',
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "HrParameter_tenantId_code_effectiveFrom_idx" ON "HrParameter"("tenantId","code","effectiveFrom");

CREATE TABLE IF NOT EXISTS "ClosingPeriod" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "period" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "closedAt" TIMESTAMP(3),
  "closedBy" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClosingPeriod_tenantId_period_module_key" ON "ClosingPeriod"("tenantId","period","module");
CREATE INDEX IF NOT EXISTS "ClosingPeriod_tenantId_status_idx" ON "ClosingPeriod"("tenantId","status");


-- =====================================================
-- Migration: 0004_analytics_qr_barcode
-- =====================================================
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


-- =====================================================
-- Migration: 0005_food_orders_notifications_ai_demo
-- =====================================================
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


-- =====================================================
-- RLS Policies
-- =====================================================
-- ContaGest-VE v4.1 - Supabase Row Level Security para tablas creadas por Prisma
-- Ejecutar después de `npx prisma migrate deploy`.
-- La función conecta auth.users.id con UserProfile.authUserId y devuelve el tenant activo.

create or replace function public.current_tenant_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select up."tenantId"
  from public."UserProfile" up
  where up."authUserId" = auth.uid()::text
    and up."status" = 'active'
  limit 1;
$$;

create or replace function public.current_profile_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select up."id"
  from public."UserProfile" up
  where up."authUserId" = auth.uid()::text
    and up."status" = 'active'
  limit 1;
$$;

-- Activación RLS en tablas con tenantId directo.
alter table public."Tenant" enable row level security;
alter table public."UserProfile" enable row level security;
alter table public."Role" enable row level security;
alter table public."Client" enable row level security;
alter table public."Supplier" enable row level security;
alter table public."Product" enable row level security;
alter table public."InventoryMovement" enable row level security;
alter table public."SalesInvoice" enable row level security;
alter table public."PurchaseInvoice" enable row level security;
alter table public."LedgerEntry" enable row level security;
alter table public."BankAccount" enable row level security;
alter table public."BankMovement" enable row level security;
alter table public."Employee" enable row level security;
alter table public."PayrollPeriod" enable row level security;
alter table public."TaxPeriod" enable row level security;
alter table public."AuditLog" enable row level security;

-- Tablas relacionales / hijas.
alter table public."Permission" enable row level security;
alter table public."RolePermission" enable row level security;
alter table public."UserRole" enable row level security;
alter table public."SalesInvoiceLine" enable row level security;
alter table public."PurchaseInvoiceLine" enable row level security;
alter table public."LedgerLine" enable row level security;
alter table public."PayrollReceipt" enable row level security;
alter table public."TaxDeclaration" enable row level security;

-- Limpieza idempotente de políticas.
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'Tenant','UserProfile','Role','Client','Supplier','Product','InventoryMovement','SalesInvoice','PurchaseInvoice',
        'LedgerEntry','BankAccount','BankMovement','Employee','PayrollPeriod','TaxPeriod','AuditLog','Permission','RolePermission',
        'UserRole','SalesInvoiceLine','PurchaseInvoiceLine','LedgerLine','PayrollReceipt','TaxDeclaration'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- Tenant visible solo si coincide con el tenant del usuario.
create policy tenant_select_own on public."Tenant"
for select to authenticated
using ("id" = public.current_tenant_id());

create policy tenant_update_own on public."Tenant"
for update to authenticated
using ("id" = public.current_tenant_id())
with check ("id" = public.current_tenant_id());

-- Perfil: cada usuario ve su tenant, pero no otros tenants.
create policy user_profile_tenant_select on public."UserProfile"
for select to authenticated
using ("tenantId" = public.current_tenant_id());

create policy user_profile_tenant_write on public."UserProfile"
for all to authenticated
using ("tenantId" = public.current_tenant_id())
with check ("tenantId" = public.current_tenant_id());

-- Tablas con tenantId directo: CRUD aislado por tenant.
create policy role_tenant_all on public."Role" for all to authenticated using ("tenantId" = public.current_tenant_id()) with check ("tenantId" = public.current_tenant_id());
create policy client_tenant_all on public."Client" for all to authenticated using ("tenantId" = public.current_tenant_id()) with check ("tenantId" = public.current_tenant_id());
create policy supplier_tenant_all on public."Supplier" for all to authenticated using ("tenantId" = public.current_tenant_id()) with check ("tenantId" = public.current_tenant_id());
create policy product_tenant_all on public."Product" for all to authenticated using ("tenantId" = public.current_tenant_id()) with check ("tenantId" = public.current_tenant_id());
create policy inventory_movement_tenant_all on public."InventoryMovement" for all to authenticated using ("tenantId" = public.current_tenant_id()) with check ("tenantId" = public.current_tenant_id());
create policy sales_invoice_tenant_all on public."SalesInvoice" for all to authenticated using ("tenantId" = public.current_tenant_id()) with check ("tenantId" = public.current_tenant_id());
create policy purchase_invoice_tenant_all on public."PurchaseInvoice" for all to authenticated using ("tenantId" = public.current_tenant_id()) with check ("tenantId" = public.current_tenant_id());
create policy ledger_entry_tenant_all on public."LedgerEntry" for all to authenticated using ("tenantId" = public.current_tenant_id()) with check ("tenantId" = public.current_tenant_id());
create policy bank_account_tenant_all on public."BankAccount" for all to authenticated using ("tenantId" = public.current_tenant_id()) with check ("tenantId" = public.current_tenant_id());
create policy bank_movement_tenant_all on public."BankMovement" for all to authenticated using ("tenantId" = public.current_tenant_id()) with check ("tenantId" = public.current_tenant_id());
create policy employee_tenant_all on public."Employee" for all to authenticated using ("tenantId" = public.current_tenant_id()) with check ("tenantId" = public.current_tenant_id());
create policy payroll_period_tenant_all on public."PayrollPeriod" for all to authenticated using ("tenantId" = public.current_tenant_id()) with check ("tenantId" = public.current_tenant_id());
create policy tax_period_tenant_all on public."TaxPeriod" for all to authenticated using ("tenantId" = public.current_tenant_id()) with check ("tenantId" = public.current_tenant_id());
create policy audit_log_tenant_select on public."AuditLog" for select to authenticated using ("tenantId" = public.current_tenant_id());
create policy audit_log_tenant_insert on public."AuditLog" for insert to authenticated with check ("tenantId" = public.current_tenant_id());

-- Catálogo de permisos: lectura autenticada. Escritura solo service role/backend.
create policy permission_read on public."Permission" for select to authenticated using (true);

-- Relaciones con rol/usuario: heredan tenant desde tabla padre.
create policy role_permission_tenant_all on public."RolePermission"
for all to authenticated
using (exists (select 1 from public."Role" r where r."id" = "roleId" and r."tenantId" = public.current_tenant_id()))
with check (exists (select 1 from public."Role" r where r."id" = "roleId" and r."tenantId" = public.current_tenant_id()));

create policy user_role_tenant_all on public."UserRole"
for all to authenticated
using (exists (select 1 from public."UserProfile" u where u."id" = "userId" and u."tenantId" = public.current_tenant_id()))
with check (exists (select 1 from public."UserProfile" u where u."id" = "userId" and u."tenantId" = public.current_tenant_id()));

-- Líneas hijas: heredan tenant desde factura/asiento/período.
create policy sales_invoice_line_tenant_all on public."SalesInvoiceLine"
for all to authenticated
using (exists (select 1 from public."SalesInvoice" i where i."id" = "invoiceId" and i."tenantId" = public.current_tenant_id()))
with check (exists (select 1 from public."SalesInvoice" i where i."id" = "invoiceId" and i."tenantId" = public.current_tenant_id()));

create policy purchase_invoice_line_tenant_all on public."PurchaseInvoiceLine"
for all to authenticated
using (exists (select 1 from public."PurchaseInvoice" i where i."id" = "invoiceId" and i."tenantId" = public.current_tenant_id()))
with check (exists (select 1 from public."PurchaseInvoice" i where i."id" = "invoiceId" and i."tenantId" = public.current_tenant_id()));

create policy ledger_line_tenant_all on public."LedgerLine"
for all to authenticated
using (exists (select 1 from public."LedgerEntry" e where e."id" = "entryId" and e."tenantId" = public.current_tenant_id()))
with check (exists (select 1 from public."LedgerEntry" e where e."id" = "entryId" and e."tenantId" = public.current_tenant_id()));

create policy payroll_receipt_tenant_all on public."PayrollReceipt"
for all to authenticated
using (exists (select 1 from public."PayrollPeriod" p where p."id" = "periodId" and p."tenantId" = public.current_tenant_id()))
with check (exists (select 1 from public."PayrollPeriod" p where p."id" = "periodId" and p."tenantId" = public.current_tenant_id()));

create policy tax_declaration_tenant_all on public."TaxDeclaration"
for all to authenticated
using (exists (select 1 from public."TaxPeriod" p where p."id" = "periodId" and p."tenantId" = public.current_tenant_id()))
with check (exists (select 1 from public."TaxPeriod" p where p."id" = "periodId" and p."tenantId" = public.current_tenant_id()));


-- Generic dynamic records imported from Stitch module library
ALTER TABLE "ModuleRecord" ENABLE ROW LEVEL SECURITY;
CREATE POLICY module_record_tenant_isolation ON "ModuleRecord"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- v6 additional tenant-scoped tables
ALTER TABLE IF EXISTS public."ChartAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AccountingRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."FiscalDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."HrParameter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ClosingPeriod" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_chart_account ON public."ChartAccount";
CREATE POLICY tenant_isolation_chart_account ON public."ChartAccount" FOR ALL USING ("tenantId" = current_setting('request.jwt.claims', true)::json->>'tenant_id') WITH CHECK ("tenantId" = current_setting('request.jwt.claims', true)::json->>'tenant_id');
DROP POLICY IF EXISTS tenant_isolation_accounting_rule ON public."AccountingRule";
CREATE POLICY tenant_isolation_accounting_rule ON public."AccountingRule" FOR ALL USING ("tenantId" = current_setting('request.jwt.claims', true)::json->>'tenant_id') WITH CHECK ("tenantId" = current_setting('request.jwt.claims', true)::json->>'tenant_id');
DROP POLICY IF EXISTS tenant_isolation_fiscal_document ON public."FiscalDocument";
CREATE POLICY tenant_isolation_fiscal_document ON public."FiscalDocument" FOR ALL USING ("tenantId" = current_setting('request.jwt.claims', true)::json->>'tenant_id') WITH CHECK ("tenantId" = current_setting('request.jwt.claims', true)::json->>'tenant_id');
DROP POLICY IF EXISTS tenant_isolation_hr_parameter ON public."HrParameter";
CREATE POLICY tenant_isolation_hr_parameter ON public."HrParameter" FOR ALL USING ("tenantId" = current_setting('request.jwt.claims', true)::json->>'tenant_id') WITH CHECK ("tenantId" = current_setting('request.jwt.claims', true)::json->>'tenant_id');
DROP POLICY IF EXISTS tenant_isolation_closing_period ON public."ClosingPeriod";
CREATE POLICY tenant_isolation_closing_period ON public."ClosingPeriod" FOR ALL USING ("tenantId" = current_setting('request.jwt.claims', true)::json->>'tenant_id') WITH CHECK ("tenantId" = current_setting('request.jwt.claims', true)::json->>'tenant_id');

-- v6.1 QR/barcode and analytics tenant-scoped tables
ALTER TABLE IF EXISTS public."ProductCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AnalyticsEvent" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_code_tenant_all ON public."ProductCode";
CREATE POLICY product_code_tenant_all ON public."ProductCode"
FOR ALL TO authenticated
USING ("tenantId" = public.current_tenant_id())
WITH CHECK ("tenantId" = public.current_tenant_id());

DROP POLICY IF EXISTS analytics_event_tenant_all ON public."AnalyticsEvent";
CREATE POLICY analytics_event_tenant_all ON public."AnalyticsEvent"
FOR ALL TO authenticated
USING ("tenantId" = public.current_tenant_id())
WITH CHECK ("tenantId" = public.current_tenant_id());

