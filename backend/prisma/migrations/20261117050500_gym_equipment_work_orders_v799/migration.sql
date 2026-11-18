-- #799: operational equipment, NOT a second fixed-asset/inventory accounting book.
CREATE TABLE public."GymEquipment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "locationId" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "area" text,
  "status" text NOT NULL DEFAULT 'available',
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymEquipment_status_check" CHECK ("status" IN ('available','out_of_service','retired')),
  CONSTRAINT "GymEquipment_tenant_code_unique" UNIQUE ("tenantId","code"),
  CONSTRAINT "GymEquipment_tenant_id_unique" UNIQUE ("tenantId","id"),
  CONSTRAINT "GymEquipment_location_fk" FOREIGN KEY ("tenantId","locationId")
    REFERENCES public."BusinessLocation"("tenantId","id") ON DELETE RESTRICT
);
CREATE INDEX "GymEquipment_tenant_location_idx"
  ON public."GymEquipment" ("tenantId","locationId","name");

CREATE TABLE public."GymEquipmentWorkOrder" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL,
  "equipmentId" text NOT NULL,
  "kind" text NOT NULL CHECK ("kind" IN ('preventive','corrective','incident')),
  "title" text NOT NULL,
  "description" text,
  "scheduledAt" timestamptz,
  "status" text NOT NULL DEFAULT 'open'
    CHECK ("status" IN ('open','in_progress','resolved','cancelled')),
  "resolution" text,
  "createdBy" text,
  "closedBy" text,
  "openedAt" timestamptz NOT NULL DEFAULT now(),
  "closedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "requestKey" text NOT NULL,
  "requestFingerprint" text NOT NULL CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "GymEquipmentWorkOrder_tenant_key_unique" UNIQUE ("tenantId","requestKey"),
  CONSTRAINT "GymEquipmentWorkOrder_tenant_id_unique" UNIQUE ("tenantId","id"),
  CONSTRAINT "GymEquipmentWorkOrder_equipment_fk" FOREIGN KEY ("tenantId","equipmentId")
    REFERENCES public."GymEquipment"("tenantId","id") ON DELETE RESTRICT
);
CREATE INDEX "GymEquipmentWorkOrder_tenant_equipment_idx"
  ON public."GymEquipmentWorkOrder" ("tenantId","equipmentId","status","openedAt" DESC);
CREATE TABLE public."GymEquipmentWorkOrderEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL,
  "workOrderId" text NOT NULL,
  "eventKey" text NOT NULL,
  "requestFingerprint" text NOT NULL CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$'),
  "fromStatus" text,
  "toStatus" text NOT NULL CHECK ("toStatus" IN ('open','in_progress','resolved','cancelled')),
  "reason" text,
  "actorId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymEquipmentWorkOrderEvent_tenant_key_unique" UNIQUE ("tenantId","eventKey"),
  CONSTRAINT "GymEquipmentWorkOrderEvent_order_fk" FOREIGN KEY ("tenantId","workOrderId")
    REFERENCES public."GymEquipmentWorkOrder"("tenantId","id") ON DELETE RESTRICT
);
CREATE INDEX "GymEquipmentWorkOrderEvent_tenant_order_idx"
  ON public."GymEquipmentWorkOrderEvent" ("tenantId","workOrderId","createdAt","id");

DO $$
DECLARE entry text;
BEGIN
  FOREACH entry IN ARRAY ARRAY['GymEquipment','GymEquipmentWorkOrder','GymEquipmentWorkOrderEvent'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',entry);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',entry||'_service_role_all',entry);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ("tenantId" = private.current_tenant_id()) WITH CHECK ("tenantId" = private.current_tenant_id())',entry||'_tenant_authenticated_all',entry);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',entry);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role',entry);
  END LOOP;
END $$;
