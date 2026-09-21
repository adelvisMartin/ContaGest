-- 19/51 · Odontología · agenda avanzada
-- Reutiliza CareAppointment como autoridad única de agenda clínica.

ALTER TABLE public."CareAppointment"
  DROP CONSTRAINT IF EXISTS "CareAppointment_status_check";

ALTER TABLE public."CareAppointment"
  ADD CONSTRAINT "CareAppointment_status_check"
  CHECK ("status" IN ('waitlisted','scheduled','confirmed','checked_in','in_progress','completed','cancelled','no_show'));

ALTER TABLE public."CareAppointment"
  ADD COLUMN IF NOT EXISTS "recallDueAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "schedulingMeta" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS "CareAppointment_tenant_professional_slot_idx"
  ON public."CareAppointment" ("tenantId","professionalId","startsAt","endsAt");

CREATE INDEX IF NOT EXISTS "CareAppointment_tenant_room_slot_idx"
  ON public."CareAppointment" ("tenantId","room","startsAt","endsAt");

CREATE INDEX IF NOT EXISTS "CareAppointment_tenant_status_starts_idx"
  ON public."CareAppointment" ("tenantId","status","startsAt");

CREATE INDEX IF NOT EXISTS "CareAppointment_tenant_recall_idx"
  ON public."CareAppointment" ("tenantId","recallDueAt")
  WHERE "recallDueAt" IS NOT NULL;
