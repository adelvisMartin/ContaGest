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
