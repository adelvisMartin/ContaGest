-- ContaGest-VE Enterprise v8.5 - FULL BOOTSTRAP SQL
-- Ejecutar completo en Supabase SQL Editor. Crea tablas base + módulos + RLS.
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

DO $$ BEGIN
  CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended', 'trial');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'issued', 'paid', 'cancelled', 'overdue');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MovementType" AS ENUM ('in', 'out', 'adjustment', 'reservation', 'release');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TaxKind" AS ENUM ('iva', 'islr', 'igtf', 'retiva', 'municipal', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LedgerSource" AS ENUM ('manual', 'sales', 'purchase', 'payroll', 'banking', 'tax', 'inventory');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "UserStatus" AS ENUM ('active', 'invited', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PayrollStatus" AS ENUM ('draft', 'approved', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public."Tenant" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "rif" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "legalName" TEXT,
  "plan" TEXT NOT NULL DEFAULT 'enterprise',
  "status" "TenantStatus" NOT NULL DEFAULT 'active',
  "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."UserProfile" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "authUserId" TEXT,
  "email" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."Role" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "system" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."Permission" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "key" TEXT NOT NULL,
  "description" TEXT,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."RolePermission" (
  "roleId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  PRIMARY KEY ("roleId", "permissionId")
);

CREATE TABLE IF NOT EXISTS public."UserRole" (
  "userId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  PRIMARY KEY ("userId", "roleId")
);

CREATE TABLE IF NOT EXISTS public."Client" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "rif" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contact" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "fiscalType" TEXT DEFAULT 'ordinary',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."Supplier" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "rif" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contact" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "retentionProfile" TEXT DEFAULT 'ordinary',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."Product" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'UND',
  "cost" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "price" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "stock" NUMERIC(18,3) NOT NULL DEFAULT 0,
  "reserved" NUMERIC(18,3) NOT NULL DEFAULT 0,
  "minStock" NUMERIC(18,3) NOT NULL DEFAULT 0,
  "taxRate" NUMERIC(5,2) NOT NULL DEFAULT 16,
  "barcode" TEXT,
  "qrCode" TEXT,
  "qrPayload" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ProductCode" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'barcode',
  "value" TEXT NOT NULL,
  "format" TEXT NOT NULL DEFAULT 'code128',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."AnalyticsEvent" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "route" TEXT,
  "userAgent" TEXT,
  "viewport" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."InventoryMovement" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "type" "MovementType" NOT NULL,
  "quantity" NUMERIC(18,3) NOT NULL,
  "unitCost" NUMERIC(18,2),
  "source" TEXT,
  "sourceId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."SalesInvoice" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "clientId" TEXT,
  "number" TEXT NOT NULL,
  "controlNo" TEXT,
  "issueDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "fiscalPeriod" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'VES',
  "exchangeRate" NUMERIC(18,4) NOT NULL DEFAULT 1,
  "subtotal" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "iva" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "igtf" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "islrRetention" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "total" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."SalesInvoiceLine" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "invoiceId" TEXT NOT NULL,
  "productId" TEXT,
  "description" TEXT NOT NULL,
  "quantity" NUMERIC(18,3) NOT NULL,
  "unitPrice" NUMERIC(18,2) NOT NULL,
  "taxRate" NUMERIC(5,2) NOT NULL DEFAULT 16,
  "total" NUMERIC(18,2) NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."PurchaseInvoice" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "supplierId" TEXT,
  "number" TEXT NOT NULL,
  "controlNo" TEXT,
  "issueDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "fiscalPeriod" TEXT NOT NULL,
  "subtotal" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "iva" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "igtf" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "retiva" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "total" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
  "ocrStatus" TEXT DEFAULT 'manual',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."PurchaseInvoiceLine" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "invoiceId" TEXT NOT NULL,
  "productId" TEXT,
  "description" TEXT NOT NULL,
  "quantity" NUMERIC(18,3) NOT NULL,
  "unitCost" NUMERIC(18,2) NOT NULL,
  "taxRate" NUMERIC(5,2) NOT NULL DEFAULT 16,
  "total" NUMERIC(18,2) NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."LedgerEntry" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "date" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "fiscalPeriod" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "source" "LedgerSource" NOT NULL DEFAULT 'manual',
  "sourceId" TEXT,
  "salesInvoiceId" TEXT,
  "purchaseInvoiceId" TEXT,
  "posted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."LedgerLine" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "entryId" TEXT NOT NULL,
  "accountCode" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "debit" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "credit" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'VES',
  "exchangeRate" NUMERIC(18,4) NOT NULL DEFAULT 1,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."BankAccount" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "accountNo" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'VES',
  "balance" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."BankMovement" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "date" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "description" TEXT NOT NULL,
  "reference" TEXT,
  "debit" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "credit" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "matched" BOOLEAN NOT NULL DEFAULT false,
  "ledgerEntryId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."Employee" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "idNumber" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "position" TEXT NOT NULL,
  "salary" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."PayrollPeriod" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "status" "PayrollStatus" NOT NULL DEFAULT 'draft',
  "totalGross" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "totalDeductions" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "totalNet" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."PayrollReceipt" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "periodId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "gross" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "deductions" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "net" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."TaxPeriod" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "ivaDebit" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "ivaCredit" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "igtfPaid" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."TaxDeclaration" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "periodId" TEXT NOT NULL,
  "kind" "TaxKind" NOT NULL,
  "amount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."AuditLog" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "before" JSONB,
  "after" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ChartAccount" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "nature" TEXT NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 1,
  "parentCode" TEXT,
  "allowPosting" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."AccountingRule" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "source" "LedgerSource" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "template" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."FiscalDocument" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'issued',
  "hash" TEXT NOT NULL,
  "fileUrl" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."HrParameter" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "value" NUMERIC(18,4) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'percent',
  "effectiveFrom" TIMESTAMPTZ NOT NULL,
  "effectiveTo" TIMESTAMPTZ,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ClosingPeriod" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "closedAt" TIMESTAMPTZ,
  "closedBy" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ModuleRecord" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "moduleSlug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."FoodOrder" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'counter',
  "serviceMode" TEXT NOT NULL DEFAULT 'dine_in',
  "status" TEXT NOT NULL DEFAULT 'new',
  "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
  "customer" TEXT,
  "phone" TEXT,
  "table" TEXT,
  "address" TEXT,
  "subtotal" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "iva" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "total" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."FoodOrderItem" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "orderId" TEXT NOT NULL,
  "sku" TEXT,
  "name" TEXT NOT NULL,
  "quantity" NUMERIC(18,3) NOT NULL,
  "price" NUMERIC(18,2) NOT NULL,
  "total" NUMERIC(18,2) NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."OrderEvent" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "orderId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT,
  "message" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."NotificationLog" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "channel" TEXT NOT NULL,
  "recipient" TEXT,
  "subject" TEXT,
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "provider" TEXT,
  "providerId" TEXT,
  "error" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."AddressGeocode" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "formattedAddress" TEXT,
  "lat" NUMERIC(10,7),
  "lng" NUMERIC(10,7),
  "placeId" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."DemoAccess" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "prospect" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "enabledModules" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "maxUsers" INTEGER NOT NULL DEFAULT 3,
  "status" TEXT NOT NULL DEFAULT 'active',
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."AiConversation" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "title" TEXT,
  "messages" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."LicenseKey" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "userEmail" TEXT NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'trial',
  "keyHash" TEXT NOT NULL,
  "keyPreview" TEXT NOT NULL,
  "modules" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "lastSeenAt" TIMESTAMPTZ,
  "lastRoute" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ImportBatch" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "filename" TEXT,
  "accepted" INTEGER NOT NULL DEFAULT 0,
  "rejected" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'preview',
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."RegulatoryFeed" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'watch',
  "lastCheckedAt" TIMESTAMPTZ,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserProfile_tenantId_fkey') THEN
    ALTER TABLE public."UserProfile" ADD CONSTRAINT "UserProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Role_tenantId_fkey') THEN
    ALTER TABLE public."Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RolePermission_roleId_fkey') THEN
    ALTER TABLE public."RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public."Role"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RolePermission_permissionId_fkey') THEN
    ALTER TABLE public."RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES public."Permission"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserRole_userId_fkey') THEN
    ALTER TABLE public."UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."UserProfile"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserRole_roleId_fkey') THEN
    ALTER TABLE public."UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public."Role"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Client_tenantId_fkey') THEN
    ALTER TABLE public."Client" ADD CONSTRAINT "Client_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Supplier_tenantId_fkey') THEN
    ALTER TABLE public."Supplier" ADD CONSTRAINT "Supplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_tenantId_fkey') THEN
    ALTER TABLE public."Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductCode_tenantId_fkey') THEN
    ALTER TABLE public."ProductCode" ADD CONSTRAINT "ProductCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductCode_productId_fkey') THEN
    ALTER TABLE public."ProductCode" ADD CONSTRAINT "ProductCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AnalyticsEvent_tenantId_fkey') THEN
    ALTER TABLE public."AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_productId_fkey') THEN
    ALTER TABLE public."InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"("id") ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesInvoice_tenantId_fkey') THEN
    ALTER TABLE public."SalesInvoice" ADD CONSTRAINT "SalesInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesInvoice_clientId_fkey') THEN
    ALTER TABLE public."SalesInvoice" ADD CONSTRAINT "SalesInvoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesInvoiceLine_invoiceId_fkey') THEN
    ALTER TABLE public."SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public."SalesInvoice"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesInvoiceLine_productId_fkey') THEN
    ALTER TABLE public."SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseInvoice_tenantId_fkey') THEN
    ALTER TABLE public."PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseInvoice_supplierId_fkey') THEN
    ALTER TABLE public."PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public."Supplier"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseInvoiceLine_invoiceId_fkey') THEN
    ALTER TABLE public."PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public."PurchaseInvoice"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseInvoiceLine_productId_fkey') THEN
    ALTER TABLE public."PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LedgerEntry_tenantId_fkey') THEN
    ALTER TABLE public."LedgerEntry" ADD CONSTRAINT "LedgerEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LedgerEntry_salesInvoiceId_fkey') THEN
    ALTER TABLE public."LedgerEntry" ADD CONSTRAINT "LedgerEntry_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES public."SalesInvoice"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LedgerEntry_purchaseInvoiceId_fkey') THEN
    ALTER TABLE public."LedgerEntry" ADD CONSTRAINT "LedgerEntry_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES public."PurchaseInvoice"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LedgerLine_entryId_fkey') THEN
    ALTER TABLE public."LedgerLine" ADD CONSTRAINT "LedgerLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES public."LedgerEntry"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BankAccount_tenantId_fkey') THEN
    ALTER TABLE public."BankAccount" ADD CONSTRAINT "BankAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BankMovement_accountId_fkey') THEN
    ALTER TABLE public."BankMovement" ADD CONSTRAINT "BankMovement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."BankAccount"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Employee_tenantId_fkey') THEN
    ALTER TABLE public."Employee" ADD CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayrollPeriod_tenantId_fkey') THEN
    ALTER TABLE public."PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayrollReceipt_periodId_fkey') THEN
    ALTER TABLE public."PayrollReceipt" ADD CONSTRAINT "PayrollReceipt_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES public."PayrollPeriod"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayrollReceipt_employeeId_fkey') THEN
    ALTER TABLE public."PayrollReceipt" ADD CONSTRAINT "PayrollReceipt_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public."Employee"("id") ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaxPeriod_tenantId_fkey') THEN
    ALTER TABLE public."TaxPeriod" ADD CONSTRAINT "TaxPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaxDeclaration_periodId_fkey') THEN
    ALTER TABLE public."TaxDeclaration" ADD CONSTRAINT "TaxDeclaration_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES public."TaxPeriod"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_tenantId_fkey') THEN
    ALTER TABLE public."AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_userId_fkey') THEN
    ALTER TABLE public."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."UserProfile"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChartAccount_tenantId_fkey') THEN
    ALTER TABLE public."ChartAccount" ADD CONSTRAINT "ChartAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccountingRule_tenantId_fkey') THEN
    ALTER TABLE public."AccountingRule" ADD CONSTRAINT "AccountingRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FiscalDocument_tenantId_fkey') THEN
    ALTER TABLE public."FiscalDocument" ADD CONSTRAINT "FiscalDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrParameter_tenantId_fkey') THEN
    ALTER TABLE public."HrParameter" ADD CONSTRAINT "HrParameter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClosingPeriod_tenantId_fkey') THEN
    ALTER TABLE public."ClosingPeriod" ADD CONSTRAINT "ClosingPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ModuleRecord_tenantId_fkey') THEN
    ALTER TABLE public."ModuleRecord" ADD CONSTRAINT "ModuleRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FoodOrder_tenantId_fkey') THEN
    ALTER TABLE public."FoodOrder" ADD CONSTRAINT "FoodOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FoodOrderItem_orderId_fkey') THEN
    ALTER TABLE public."FoodOrderItem" ADD CONSTRAINT "FoodOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."FoodOrder"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderEvent_orderId_fkey') THEN
    ALTER TABLE public."OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."FoodOrder"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NotificationLog_tenantId_fkey') THEN
    ALTER TABLE public."NotificationLog" ADD CONSTRAINT "NotificationLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NotificationLog_userId_fkey') THEN
    ALTER TABLE public."NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."UserProfile"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AddressGeocode_tenantId_fkey') THEN
    ALTER TABLE public."AddressGeocode" ADD CONSTRAINT "AddressGeocode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DemoAccess_tenantId_fkey') THEN
    ALTER TABLE public."DemoAccess" ADD CONSTRAINT "DemoAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiConversation_tenantId_fkey') THEN
    ALTER TABLE public."AiConversation" ADD CONSTRAINT "AiConversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiConversation_userId_fkey') THEN
    ALTER TABLE public."AiConversation" ADD CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."UserProfile"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LicenseKey_tenantId_fkey') THEN
    ALTER TABLE public."LicenseKey" ADD CONSTRAINT "LicenseKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LicenseKey_userId_fkey') THEN
    ALTER TABLE public."LicenseKey" ADD CONSTRAINT "LicenseKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."UserProfile"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ImportBatch_tenantId_fkey') THEN
    ALTER TABLE public."ImportBatch" ADD CONSTRAINT "ImportBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RegulatoryFeed_tenantId_fkey') THEN
    ALTER TABLE public."RegulatoryFeed" ADD CONSTRAINT "RegulatoryFeed_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_rif_key" ON public."Tenant"("rif");
CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_authUserId_key" ON public."UserProfile"("authUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "Permission_key_key" ON public."Permission"("key");
CREATE UNIQUE INDEX IF NOT EXISTS "LicenseKey_keyHash_key" ON public."LicenseKey"("keyHash");
CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_tenantId_email_key" ON public."UserProfile"("tenantId", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "Role_tenantId_name_key" ON public."Role"("tenantId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "Client_tenantId_rif_key" ON public."Client"("tenantId", "rif");
CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_tenantId_rif_key" ON public."Supplier"("tenantId", "rif");
CREATE UNIQUE INDEX IF NOT EXISTS "Product_tenantId_sku_key" ON public."Product"("tenantId", "sku");
CREATE UNIQUE INDEX IF NOT EXISTS "Product_tenantId_barcode_key" ON public."Product"("tenantId", "barcode");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductCode_tenantId_value_key" ON public."ProductCode"("tenantId", "value");
CREATE UNIQUE INDEX IF NOT EXISTS "SalesInvoice_tenantId_number_key" ON public."SalesInvoice"("tenantId", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseInvoice_tenantId_number_key" ON public."PurchaseInvoice"("tenantId", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "BankAccount_tenantId_accountNo_key" ON public."BankAccount"("tenantId", "accountNo");
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_tenantId_idNumber_key" ON public."Employee"("tenantId", "idNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPeriod_tenantId_period_key" ON public."PayrollPeriod"("tenantId", "period");
CREATE UNIQUE INDEX IF NOT EXISTS "TaxPeriod_tenantId_period_key" ON public."TaxPeriod"("tenantId", "period");
CREATE UNIQUE INDEX IF NOT EXISTS "ChartAccount_tenantId_code_key" ON public."ChartAccount"("tenantId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "AccountingRule_tenantId_source_name_key" ON public."AccountingRule"("tenantId", "source", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "FiscalDocument_tenantId_kind_number_key" ON public."FiscalDocument"("tenantId", "kind", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "ClosingPeriod_tenantId_period_module_key" ON public."ClosingPeriod"("tenantId", "period", "module");
CREATE UNIQUE INDEX IF NOT EXISTS "FoodOrder_tenantId_number_key" ON public."FoodOrder"("tenantId", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "RegulatoryFeed_tenantId_sourceKey_key" ON public."RegulatoryFeed"("tenantId", "sourceKey");

CREATE INDEX IF NOT EXISTS "Tenant_rif_idx" ON public."Tenant"("rif");
CREATE INDEX IF NOT EXISTS "UserProfile_tenantId_idx" ON public."UserProfile"("tenantId");
CREATE INDEX IF NOT EXISTS "Role_tenantId_idx" ON public."Role"("tenantId");
CREATE INDEX IF NOT EXISTS "Client_tenantId_name_idx" ON public."Client"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "Supplier_tenantId_name_idx" ON public."Supplier"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "Product_tenantId_name_idx" ON public."Product"("tenantId", "name");
CREATE INDEX IF NOT EXISTS "Product_tenantId_qrCode_idx" ON public."Product"("tenantId", "qrCode");
CREATE INDEX IF NOT EXISTS "ProductCode_tenantId_productId_idx" ON public."ProductCode"("tenantId", "productId");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_tenantId_type_createdAt_idx" ON public."AnalyticsEvent"("tenantId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_tenantId_route_createdAt_idx" ON public."AnalyticsEvent"("tenantId", "route", "createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_tenantId_sessionId_idx" ON public."AnalyticsEvent"("tenantId", "sessionId");
CREATE INDEX IF NOT EXISTS "InventoryMovement_tenantId_productId_createdAt_idx" ON public."InventoryMovement"("tenantId", "productId", "createdAt");
CREATE INDEX IF NOT EXISTS "SalesInvoice_tenantId_fiscalPeriod_idx" ON public."SalesInvoice"("tenantId", "fiscalPeriod");
CREATE INDEX IF NOT EXISTS "PurchaseInvoice_tenantId_fiscalPeriod_idx" ON public."PurchaseInvoice"("tenantId", "fiscalPeriod");
CREATE INDEX IF NOT EXISTS "LedgerEntry_tenantId_fiscalPeriod_idx" ON public."LedgerEntry"("tenantId", "fiscalPeriod");
CREATE INDEX IF NOT EXISTS "LedgerLine_accountCode_idx" ON public."LedgerLine"("accountCode");
CREATE INDEX IF NOT EXISTS "BankMovement_tenantId_date_idx" ON public."BankMovement"("tenantId", "date");
CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_entity_createdAt_idx" ON public."AuditLog"("tenantId", "entity", "createdAt");
CREATE INDEX IF NOT EXISTS "ChartAccount_tenantId_type_idx" ON public."ChartAccount"("tenantId", "type");
CREATE INDEX IF NOT EXISTS "ChartAccount_tenantId_parentCode_idx" ON public."ChartAccount"("tenantId", "parentCode");
CREATE INDEX IF NOT EXISTS "AccountingRule_tenantId_source_idx" ON public."AccountingRule"("tenantId", "source");
CREATE INDEX IF NOT EXISTS "FiscalDocument_tenantId_period_idx" ON public."FiscalDocument"("tenantId", "period");
CREATE INDEX IF NOT EXISTS "FiscalDocument_tenantId_hash_idx" ON public."FiscalDocument"("tenantId", "hash");
CREATE INDEX IF NOT EXISTS "HrParameter_tenantId_code_effectiveFrom_idx" ON public."HrParameter"("tenantId", "code", "effectiveFrom");
CREATE INDEX IF NOT EXISTS "ClosingPeriod_tenantId_status_idx" ON public."ClosingPeriod"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "ModuleRecord_tenantId_moduleSlug_idx" ON public."ModuleRecord"("tenantId", "moduleSlug");
CREATE INDEX IF NOT EXISTS "ModuleRecord_tenantId_status_idx" ON public."ModuleRecord"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "FoodOrder_tenantId_status_createdAt_idx" ON public."FoodOrder"("tenantId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "OrderEvent_orderId_createdAt_idx" ON public."OrderEvent"("orderId", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationLog_tenantId_channel_createdAt_idx" ON public."NotificationLog"("tenantId", "channel", "createdAt");
CREATE INDEX IF NOT EXISTS "AddressGeocode_tenantId_address_idx" ON public."AddressGeocode"("tenantId", "address");
CREATE INDEX IF NOT EXISTS "DemoAccess_tenantId_status_expiresAt_idx" ON public."DemoAccess"("tenantId", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "AiConversation_tenantId_updatedAt_idx" ON public."AiConversation"("tenantId", "updatedAt");
CREATE INDEX IF NOT EXISTS "LicenseKey_tenantId_userEmail_idx" ON public."LicenseKey"("tenantId", "userEmail");
CREATE INDEX IF NOT EXISTS "LicenseKey_tenantId_status_expiresAt_idx" ON public."LicenseKey"("tenantId", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "ImportBatch_tenantId_type_createdAt_idx" ON public."ImportBatch"("tenantId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "RegulatoryFeed_tenantId_kind_idx" ON public."RegulatoryFeed"("tenantId", "kind");

-- Minimal seed para pruebas
INSERT INTO public."Tenant" ("id","rif","name","legalName","plan","status","settings") VALUES ('demo-tenant','J123456789','ContaGest Demo','ContaGest Demo C.A.','enterprise','active','{}'::jsonb) ON CONFLICT ("rif") DO NOTHING;
INSERT INTO public."UserProfile" ("id","tenantId","email","fullName","status") VALUES ('demo-admin','demo-tenant','admin@empresa.com','Admin ContaGest','active') ON CONFLICT ("tenantId","email") DO NOTHING;
INSERT INTO public."Client" ("id","tenantId","rif","name","email","phone","address") VALUES ('demo-client','demo-tenant','J987654321','Cliente Demo C.A.','compras@clientedemo.com','+58 412-0000000','Caracas, Venezuela') ON CONFLICT ("tenantId","rif") DO NOTHING;
INSERT INTO public."Product" ("id","tenantId","sku","name","unit","cost","price","stock","reserved","minStock","taxRate","barcode") VALUES ('demo-product','demo-tenant','CG-DEMO-001','Producto Demo','UND',10,20,50,0,5,16,'7591000000001') ON CONFLICT ("tenantId","sku") DO NOTHING;

-- RLS básico para Supabase Auth / Backend
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

ALTER TABLE IF EXISTS public."Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."UserProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Permission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."UserRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ProductCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AnalyticsEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."InventoryMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."SalesInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."SalesInvoiceLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."PurchaseInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."PurchaseInvoiceLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."LedgerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."LedgerLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."BankAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."BankMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Employee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."PayrollPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."PayrollReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."TaxPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."TaxDeclaration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ChartAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AccountingRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."FiscalDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."HrParameter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ClosingPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ModuleRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."FoodOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."FoodOrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."OrderEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."NotificationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AddressGeocode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."DemoAccess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."AiConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."LicenseKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."ImportBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."RegulatoryFeed" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant_service_role_all" ON public."Tenant";
CREATE POLICY "Tenant_service_role_all" ON public."Tenant" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "UserProfile_service_role_all" ON public."UserProfile";
CREATE POLICY "UserProfile_service_role_all" ON public."UserProfile" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "UserProfile_tenant_authenticated_all" ON public."UserProfile";
CREATE POLICY "UserProfile_tenant_authenticated_all" ON public."UserProfile" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "Role_service_role_all" ON public."Role";
CREATE POLICY "Role_service_role_all" ON public."Role" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Role_tenant_authenticated_all" ON public."Role";
CREATE POLICY "Role_tenant_authenticated_all" ON public."Role" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "Permission_service_role_all" ON public."Permission";
CREATE POLICY "Permission_service_role_all" ON public."Permission" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "RolePermission_service_role_all" ON public."RolePermission";
CREATE POLICY "RolePermission_service_role_all" ON public."RolePermission" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "UserRole_service_role_all" ON public."UserRole";
CREATE POLICY "UserRole_service_role_all" ON public."UserRole" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Client_service_role_all" ON public."Client";
CREATE POLICY "Client_service_role_all" ON public."Client" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Client_tenant_authenticated_all" ON public."Client";
CREATE POLICY "Client_tenant_authenticated_all" ON public."Client" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "Supplier_service_role_all" ON public."Supplier";
CREATE POLICY "Supplier_service_role_all" ON public."Supplier" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Supplier_tenant_authenticated_all" ON public."Supplier";
CREATE POLICY "Supplier_tenant_authenticated_all" ON public."Supplier" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "Product_service_role_all" ON public."Product";
CREATE POLICY "Product_service_role_all" ON public."Product" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Product_tenant_authenticated_all" ON public."Product";
CREATE POLICY "Product_tenant_authenticated_all" ON public."Product" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "ProductCode_service_role_all" ON public."ProductCode";
CREATE POLICY "ProductCode_service_role_all" ON public."ProductCode" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ProductCode_tenant_authenticated_all" ON public."ProductCode";
CREATE POLICY "ProductCode_tenant_authenticated_all" ON public."ProductCode" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "AnalyticsEvent_service_role_all" ON public."AnalyticsEvent";
CREATE POLICY "AnalyticsEvent_service_role_all" ON public."AnalyticsEvent" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "AnalyticsEvent_tenant_authenticated_all" ON public."AnalyticsEvent";
CREATE POLICY "AnalyticsEvent_tenant_authenticated_all" ON public."AnalyticsEvent" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "InventoryMovement_service_role_all" ON public."InventoryMovement";
CREATE POLICY "InventoryMovement_service_role_all" ON public."InventoryMovement" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "InventoryMovement_tenant_authenticated_all" ON public."InventoryMovement";
CREATE POLICY "InventoryMovement_tenant_authenticated_all" ON public."InventoryMovement" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "SalesInvoice_service_role_all" ON public."SalesInvoice";
CREATE POLICY "SalesInvoice_service_role_all" ON public."SalesInvoice" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "SalesInvoice_tenant_authenticated_all" ON public."SalesInvoice";
CREATE POLICY "SalesInvoice_tenant_authenticated_all" ON public."SalesInvoice" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "SalesInvoiceLine_service_role_all" ON public."SalesInvoiceLine";
CREATE POLICY "SalesInvoiceLine_service_role_all" ON public."SalesInvoiceLine" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "PurchaseInvoice_service_role_all" ON public."PurchaseInvoice";
CREATE POLICY "PurchaseInvoice_service_role_all" ON public."PurchaseInvoice" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "PurchaseInvoice_tenant_authenticated_all" ON public."PurchaseInvoice";
CREATE POLICY "PurchaseInvoice_tenant_authenticated_all" ON public."PurchaseInvoice" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "PurchaseInvoiceLine_service_role_all" ON public."PurchaseInvoiceLine";
CREATE POLICY "PurchaseInvoiceLine_service_role_all" ON public."PurchaseInvoiceLine" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "LedgerEntry_service_role_all" ON public."LedgerEntry";
CREATE POLICY "LedgerEntry_service_role_all" ON public."LedgerEntry" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "LedgerEntry_tenant_authenticated_all" ON public."LedgerEntry";
CREATE POLICY "LedgerEntry_tenant_authenticated_all" ON public."LedgerEntry" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "LedgerLine_service_role_all" ON public."LedgerLine";
CREATE POLICY "LedgerLine_service_role_all" ON public."LedgerLine" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "BankAccount_service_role_all" ON public."BankAccount";
CREATE POLICY "BankAccount_service_role_all" ON public."BankAccount" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "BankAccount_tenant_authenticated_all" ON public."BankAccount";
CREATE POLICY "BankAccount_tenant_authenticated_all" ON public."BankAccount" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "BankMovement_service_role_all" ON public."BankMovement";
CREATE POLICY "BankMovement_service_role_all" ON public."BankMovement" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "BankMovement_tenant_authenticated_all" ON public."BankMovement";
CREATE POLICY "BankMovement_tenant_authenticated_all" ON public."BankMovement" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "Employee_service_role_all" ON public."Employee";
CREATE POLICY "Employee_service_role_all" ON public."Employee" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Employee_tenant_authenticated_all" ON public."Employee";
CREATE POLICY "Employee_tenant_authenticated_all" ON public."Employee" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "PayrollPeriod_service_role_all" ON public."PayrollPeriod";
CREATE POLICY "PayrollPeriod_service_role_all" ON public."PayrollPeriod" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "PayrollPeriod_tenant_authenticated_all" ON public."PayrollPeriod";
CREATE POLICY "PayrollPeriod_tenant_authenticated_all" ON public."PayrollPeriod" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "PayrollReceipt_service_role_all" ON public."PayrollReceipt";
CREATE POLICY "PayrollReceipt_service_role_all" ON public."PayrollReceipt" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "TaxPeriod_service_role_all" ON public."TaxPeriod";
CREATE POLICY "TaxPeriod_service_role_all" ON public."TaxPeriod" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "TaxPeriod_tenant_authenticated_all" ON public."TaxPeriod";
CREATE POLICY "TaxPeriod_tenant_authenticated_all" ON public."TaxPeriod" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "TaxDeclaration_service_role_all" ON public."TaxDeclaration";
CREATE POLICY "TaxDeclaration_service_role_all" ON public."TaxDeclaration" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "AuditLog_service_role_all" ON public."AuditLog";
CREATE POLICY "AuditLog_service_role_all" ON public."AuditLog" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "AuditLog_tenant_authenticated_all" ON public."AuditLog";
CREATE POLICY "AuditLog_tenant_authenticated_all" ON public."AuditLog" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "ChartAccount_service_role_all" ON public."ChartAccount";
CREATE POLICY "ChartAccount_service_role_all" ON public."ChartAccount" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ChartAccount_tenant_authenticated_all" ON public."ChartAccount";
CREATE POLICY "ChartAccount_tenant_authenticated_all" ON public."ChartAccount" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "AccountingRule_service_role_all" ON public."AccountingRule";
CREATE POLICY "AccountingRule_service_role_all" ON public."AccountingRule" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "AccountingRule_tenant_authenticated_all" ON public."AccountingRule";
CREATE POLICY "AccountingRule_tenant_authenticated_all" ON public."AccountingRule" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "FiscalDocument_service_role_all" ON public."FiscalDocument";
CREATE POLICY "FiscalDocument_service_role_all" ON public."FiscalDocument" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "FiscalDocument_tenant_authenticated_all" ON public."FiscalDocument";
CREATE POLICY "FiscalDocument_tenant_authenticated_all" ON public."FiscalDocument" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "HrParameter_service_role_all" ON public."HrParameter";
CREATE POLICY "HrParameter_service_role_all" ON public."HrParameter" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "HrParameter_tenant_authenticated_all" ON public."HrParameter";
CREATE POLICY "HrParameter_tenant_authenticated_all" ON public."HrParameter" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "ClosingPeriod_service_role_all" ON public."ClosingPeriod";
CREATE POLICY "ClosingPeriod_service_role_all" ON public."ClosingPeriod" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ClosingPeriod_tenant_authenticated_all" ON public."ClosingPeriod";
CREATE POLICY "ClosingPeriod_tenant_authenticated_all" ON public."ClosingPeriod" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "ModuleRecord_service_role_all" ON public."ModuleRecord";
CREATE POLICY "ModuleRecord_service_role_all" ON public."ModuleRecord" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ModuleRecord_tenant_authenticated_all" ON public."ModuleRecord";
CREATE POLICY "ModuleRecord_tenant_authenticated_all" ON public."ModuleRecord" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "FoodOrder_service_role_all" ON public."FoodOrder";
CREATE POLICY "FoodOrder_service_role_all" ON public."FoodOrder" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "FoodOrder_tenant_authenticated_all" ON public."FoodOrder";
CREATE POLICY "FoodOrder_tenant_authenticated_all" ON public."FoodOrder" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "FoodOrderItem_service_role_all" ON public."FoodOrderItem";
CREATE POLICY "FoodOrderItem_service_role_all" ON public."FoodOrderItem" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "OrderEvent_service_role_all" ON public."OrderEvent";
CREATE POLICY "OrderEvent_service_role_all" ON public."OrderEvent" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "NotificationLog_service_role_all" ON public."NotificationLog";
CREATE POLICY "NotificationLog_service_role_all" ON public."NotificationLog" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "NotificationLog_tenant_authenticated_all" ON public."NotificationLog";
CREATE POLICY "NotificationLog_tenant_authenticated_all" ON public."NotificationLog" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "AddressGeocode_service_role_all" ON public."AddressGeocode";
CREATE POLICY "AddressGeocode_service_role_all" ON public."AddressGeocode" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "AddressGeocode_tenant_authenticated_all" ON public."AddressGeocode";
CREATE POLICY "AddressGeocode_tenant_authenticated_all" ON public."AddressGeocode" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "DemoAccess_service_role_all" ON public."DemoAccess";
CREATE POLICY "DemoAccess_service_role_all" ON public."DemoAccess" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "DemoAccess_tenant_authenticated_all" ON public."DemoAccess";
CREATE POLICY "DemoAccess_tenant_authenticated_all" ON public."DemoAccess" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "AiConversation_service_role_all" ON public."AiConversation";
CREATE POLICY "AiConversation_service_role_all" ON public."AiConversation" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "AiConversation_tenant_authenticated_all" ON public."AiConversation";
CREATE POLICY "AiConversation_tenant_authenticated_all" ON public."AiConversation" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "LicenseKey_service_role_all" ON public."LicenseKey";
CREATE POLICY "LicenseKey_service_role_all" ON public."LicenseKey" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "LicenseKey_tenant_authenticated_all" ON public."LicenseKey";
CREATE POLICY "LicenseKey_tenant_authenticated_all" ON public."LicenseKey" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "ImportBatch_service_role_all" ON public."ImportBatch";
CREATE POLICY "ImportBatch_service_role_all" ON public."ImportBatch" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ImportBatch_tenant_authenticated_all" ON public."ImportBatch";
CREATE POLICY "ImportBatch_tenant_authenticated_all" ON public."ImportBatch" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());
DROP POLICY IF EXISTS "RegulatoryFeed_service_role_all" ON public."RegulatoryFeed";
CREATE POLICY "RegulatoryFeed_service_role_all" ON public."RegulatoryFeed" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "RegulatoryFeed_tenant_authenticated_all" ON public."RegulatoryFeed";
CREATE POLICY "RegulatoryFeed_tenant_authenticated_all" ON public."RegulatoryFeed" FOR ALL TO authenticated USING ("tenantId" = public.current_tenant_id()) WITH CHECK ("tenantId" = public.current_tenant_id());

-- FIN