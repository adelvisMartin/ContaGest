-- ContaGest v11.10: veterinary clinical operations.
-- Additive only: laboratories, diagnostic studies, hospitalization, procedures and communication traceability.

CREATE TABLE IF NOT EXISTS public."CareLabOrder" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES public."CarePatient"("id") ON DELETE CASCADE,
  "encounterId" text REFERENCES public."CareEncounter"("id") ON DELETE SET NULL,
  "professionalId" text REFERENCES public."CareProfessional"("id") ON DELETE SET NULL,
  "orderNumber" text NOT NULL,
  "orderedAt" timestamptz NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'ordered',
  "priority" text NOT NULL DEFAULT 'routine',
  "laboratory" text,
  "specimenType" text,
  "fasting" boolean NOT NULL DEFAULT false,
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CareLabOrder_status_check" CHECK ("status" IN ('draft','ordered','collected','processing','completed','cancelled')),
  CONSTRAINT "CareLabOrder_priority_check" CHECK ("priority" IN ('routine','urgent','stat')),
  CONSTRAINT "CareLabOrder_tenant_number_unique" UNIQUE ("tenantId", "orderNumber")
);

CREATE TABLE IF NOT EXISTS public."CareLabResult" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "labOrderId" text NOT NULL REFERENCES public."CareLabOrder"("id") ON DELETE CASCADE,
  "testCode" text,
  "testName" text NOT NULL,
  "category" text,
  "valueText" text,
  "valueNumeric" numeric(18,6),
  "unit" text,
  "referenceMin" numeric(18,6),
  "referenceMax" numeric(18,6),
  "referenceText" text,
  "flag" text NOT NULL DEFAULT 'normal',
  "observedAt" timestamptz NOT NULL DEFAULT now(),
  "verifiedBy" text,
  "notes" text,
  "attachmentPath" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CareLabResult_flag_check" CHECK ("flag" IN ('normal','low','high','critical','abnormal'))
);

CREATE TABLE IF NOT EXISTS public."CareDiagnosticStudy" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES public."CarePatient"("id") ON DELETE CASCADE,
  "encounterId" text REFERENCES public."CareEncounter"("id") ON DELETE SET NULL,
  "professionalId" text REFERENCES public."CareProfessional"("id") ON DELETE SET NULL,
  "kind" text NOT NULL DEFAULT 'other',
  "title" text NOT NULL,
  "bodySite" text,
  "status" text NOT NULL DEFAULT 'ordered',
  "scheduledAt" timestamptz,
  "performedAt" timestamptz,
  "findings" text,
  "impression" text,
  "attachmentPath" text,
  "externalUrl" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CareDiagnosticStudy_kind_check" CHECK ("kind" IN ('xray','ultrasound','ct','mri','ecg','endoscopy','pathology','dental','other')),
  CONSTRAINT "CareDiagnosticStudy_status_check" CHECK ("status" IN ('ordered','scheduled','in_progress','completed','cancelled'))
);

CREATE TABLE IF NOT EXISTS public."CareHospitalization" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES public."CarePatient"("id") ON DELETE CASCADE,
  "encounterId" text REFERENCES public."CareEncounter"("id") ON DELETE SET NULL,
  "professionalId" text REFERENCES public."CareProfessional"("id") ON DELETE SET NULL,
  "admissionNumber" text NOT NULL,
  "admittedAt" timestamptz NOT NULL DEFAULT now(),
  "dischargedAt" timestamptz,
  "ward" text,
  "cage" text,
  "reason" text NOT NULL,
  "diagnosis" text,
  "status" text NOT NULL DEFAULT 'admitted',
  "carePlan" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CareHospitalization_status_check" CHECK ("status" IN ('admitted','observed','discharged','transferred','cancelled')),
  CONSTRAINT "CareHospitalization_tenant_number_unique" UNIQUE ("tenantId", "admissionNumber")
);

CREATE TABLE IF NOT EXISTS public."CareHospitalObservation" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "hospitalizationId" text NOT NULL REFERENCES public."CareHospitalization"("id") ON DELETE CASCADE,
  "professionalId" text REFERENCES public."CareProfessional"("id") ON DELETE SET NULL,
  "observedAt" timestamptz NOT NULL DEFAULT now(),
  "type" text NOT NULL DEFAULT 'note',
  "values" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "note" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CareHospitalObservation_type_check" CHECK ("type" IN ('vitals','medication','feeding','fluid','procedure','note'))
);

CREATE TABLE IF NOT EXISTS public."CareProcedure" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES public."CarePatient"("id") ON DELETE CASCADE,
  "encounterId" text REFERENCES public."CareEncounter"("id") ON DELETE SET NULL,
  "professionalId" text REFERENCES public."CareProfessional"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'procedure',
  "status" text NOT NULL DEFAULT 'planned',
  "scheduledAt" timestamptz,
  "performedAt" timestamptz,
  "anesthesia" text,
  "notes" text,
  "outcome" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CareProcedure_status_check" CHECK ("status" IN ('planned','scheduled','in_progress','completed','cancelled'))
);

CREATE TABLE IF NOT EXISTS public."CareCommunicationLog" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text REFERENCES public."CarePatient"("id") ON DELETE SET NULL,
  "appointmentId" text REFERENCES public."CareAppointment"("id") ON DELETE SET NULL,
  "channel" text NOT NULL,
  "event" text NOT NULL,
  "recipient" text NOT NULL,
  "templateId" text,
  "status" text NOT NULL DEFAULT 'queued',
  "scheduledAt" timestamptz,
  "sentAt" timestamptz,
  "providerMessageId" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CareCommunicationLog_channel_check" CHECK ("channel" IN ('whatsapp','email','sms','push')),
  CONSTRAINT "CareCommunicationLog_status_check" CHECK ("status" IN ('queued','sent','delivered','failed','skipped'))
);

CREATE INDEX IF NOT EXISTS "CareLabOrder_tenant_patient_idx" ON public."CareLabOrder"("tenantId", "patientId", "orderedAt" DESC);
CREATE INDEX IF NOT EXISTS "CareLabOrder_tenant_status_idx" ON public."CareLabOrder"("tenantId", "status", "orderedAt" DESC);
CREATE INDEX IF NOT EXISTS "CareLabResult_tenant_order_idx" ON public."CareLabResult"("tenantId", "labOrderId", "observedAt" DESC);
CREATE INDEX IF NOT EXISTS "CareDiagnosticStudy_tenant_patient_idx" ON public."CareDiagnosticStudy"("tenantId", "patientId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CareHospitalization_tenant_status_idx" ON public."CareHospitalization"("tenantId", "status", "admittedAt" DESC);
CREATE INDEX IF NOT EXISTS "CareHospitalization_tenant_patient_idx" ON public."CareHospitalization"("tenantId", "patientId", "admittedAt" DESC);
CREATE INDEX IF NOT EXISTS "CareHospitalObservation_tenant_hospitalization_idx" ON public."CareHospitalObservation"("tenantId", "hospitalizationId", "observedAt" DESC);
CREATE INDEX IF NOT EXISTS "CareProcedure_tenant_patient_idx" ON public."CareProcedure"("tenantId", "patientId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CareCommunicationLog_tenant_patient_idx" ON public."CareCommunicationLog"("tenantId", "patientId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CareCommunicationLog_tenant_status_idx" ON public."CareCommunicationLog"("tenantId", "status", "scheduledAt");

ALTER TABLE public."CareLabOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CareLabResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CareDiagnosticStudy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CareHospitalization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CareHospitalObservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CareProcedure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CareCommunicationLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CareLabOrder_tenant_authenticated_all" ON public."CareLabOrder" FOR ALL TO authenticated USING ("tenantId" = private.current_tenant_id()) WITH CHECK ("tenantId" = private.current_tenant_id());
CREATE POLICY "CareLabOrder_service_role_all" ON public."CareLabOrder" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "CareLabResult_tenant_authenticated_all" ON public."CareLabResult" FOR ALL TO authenticated USING ("tenantId" = private.current_tenant_id()) WITH CHECK ("tenantId" = private.current_tenant_id());
CREATE POLICY "CareLabResult_service_role_all" ON public."CareLabResult" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "CareDiagnosticStudy_tenant_authenticated_all" ON public."CareDiagnosticStudy" FOR ALL TO authenticated USING ("tenantId" = private.current_tenant_id()) WITH CHECK ("tenantId" = private.current_tenant_id());
CREATE POLICY "CareDiagnosticStudy_service_role_all" ON public."CareDiagnosticStudy" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "CareHospitalization_tenant_authenticated_all" ON public."CareHospitalization" FOR ALL TO authenticated USING ("tenantId" = private.current_tenant_id()) WITH CHECK ("tenantId" = private.current_tenant_id());
CREATE POLICY "CareHospitalization_service_role_all" ON public."CareHospitalization" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "CareHospitalObservation_tenant_authenticated_all" ON public."CareHospitalObservation" FOR ALL TO authenticated USING ("tenantId" = private.current_tenant_id()) WITH CHECK ("tenantId" = private.current_tenant_id());
CREATE POLICY "CareHospitalObservation_service_role_all" ON public."CareHospitalObservation" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "CareProcedure_tenant_authenticated_all" ON public."CareProcedure" FOR ALL TO authenticated USING ("tenantId" = private.current_tenant_id()) WITH CHECK ("tenantId" = private.current_tenant_id());
CREATE POLICY "CareProcedure_service_role_all" ON public."CareProcedure" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "CareCommunicationLog_tenant_authenticated_all" ON public."CareCommunicationLog" FOR ALL TO authenticated USING ("tenantId" = private.current_tenant_id()) WITH CHECK ("tenantId" = private.current_tenant_id());
CREATE POLICY "CareCommunicationLog_service_role_all" ON public."CareCommunicationLog" FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public."CareLabOrder", public."CareLabResult", public."CareDiagnosticStudy", public."CareHospitalization", public."CareHospitalObservation", public."CareProcedure", public."CareCommunicationLog" TO authenticated;
GRANT ALL ON public."CareLabOrder", public."CareLabResult", public."CareDiagnosticStudy", public."CareHospitalization", public."CareHospitalObservation", public."CareProcedure", public."CareCommunicationLog" TO service_role;
