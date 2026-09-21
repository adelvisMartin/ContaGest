-- 19/51 · Odontología: agenda avanzada con recursos, waitlist y recall.

CREATE TABLE IF NOT EXISTS public."CareDentalResource" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'chair',
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CareDentalResource_kind_check" CHECK ("kind" IN ('chair','room','equipment')),
  CONSTRAINT "CareDentalResource_tenant_name_unique" UNIQUE ("tenantId","name")
);

ALTER TABLE public."CareAppointment"
  ADD COLUMN IF NOT EXISTS "resourceId" text REFERENCES public."CareDentalResource"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "confirmationData" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS "CareAppointment_tenant_professional_time_idx"
  ON public."CareAppointment" ("tenantId","professionalId","startsAt","endsAt");
CREATE INDEX IF NOT EXISTS "CareAppointment_tenant_resource_time_idx"
  ON public."CareAppointment" ("tenantId","resourceId","startsAt","endsAt");
CREATE INDEX IF NOT EXISTS "CareAppointment_tenant_patient_time_idx"
  ON public."CareAppointment" ("tenantId","patientId","startsAt","endsAt");

CREATE TABLE IF NOT EXISTS public."CareDentalWaitlist" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES public."CarePatient"("id") ON DELETE CASCADE,
  "professionalId" text REFERENCES public."CareProfessional"("id") ON DELETE SET NULL,
  "resourceId" text REFERENCES public."CareDentalResource"("id") ON DELETE SET NULL,
  "reason" text,
  "preferredFrom" timestamptz,
  "preferredTo" timestamptz,
  "durationMinutes" integer NOT NULL DEFAULT 45,
  "priority" integer NOT NULL DEFAULT 3,
  "status" text NOT NULL DEFAULT 'waiting',
  "notes" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CareDentalWaitlist_duration_check" CHECK ("durationMinutes" BETWEEN 15 AND 480),
  CONSTRAINT "CareDentalWaitlist_priority_check" CHECK ("priority" BETWEEN 1 AND 5),
  CONSTRAINT "CareDentalWaitlist_status_check" CHECK ("status" IN ('waiting','contacted','booked','cancelled'))
);
CREATE INDEX IF NOT EXISTS "CareDentalWaitlist_tenant_status_idx"
  ON public."CareDentalWaitlist" ("tenantId","status","priority","createdAt");

CREATE TABLE IF NOT EXISTS public."CareDentalRecall" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES public."CarePatient"("id") ON DELETE CASCADE,
  "professionalId" text REFERENCES public."CareProfessional"("id") ON DELETE SET NULL,
  "dueAt" timestamptz NOT NULL,
  "kind" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "appointmentId" text REFERENCES public."CareAppointment"("id") ON DELETE SET NULL,
  "notes" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CareDentalRecall_status_check" CHECK ("status" IN ('pending','contacted','scheduled','dismissed'))
);
CREATE INDEX IF NOT EXISTS "CareDentalRecall_tenant_due_idx"
  ON public."CareDentalRecall" ("tenantId","status","dueAt");
