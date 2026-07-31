-- ContaGest v11.5: healthcare, veterinary and gym verticals.
-- Additive migration: no existing ERP table or record is modified.
CREATE TABLE IF NOT EXISTS public."CareProfessional" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "userId" text REFERENCES public."UserProfile"("id") ON DELETE SET NULL,
  "fullName" text NOT NULL,
  "specialty" text NOT NULL DEFAULT 'general',
  "licenseNumber" text,
  "email" text,
  "phone" text,
  "status" text NOT NULL DEFAULT 'active',
  "schedule" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CareProfessional_status_check" CHECK ("status" IN ('active','inactive','vacation')),
  CONSTRAINT "CareProfessional_tenant_license_unique" UNIQUE ("tenantId", "licenseNumber")
);
CREATE TABLE IF NOT EXISTS public."CarePatient" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "kind" text NOT NULL DEFAULT 'human',
  "firstName" text,"lastName" text,"displayName" text NOT NULL,"idNumber" text,"birthDate" date,"sex" text,"phone" text,"email" text,"address" text,"photoUrl" text,
  "species" text,"breed" text,"color" text,"microchip" text,"guardianName" text,"guardianPhone" text,"guardianEmail" text,
  "emergencyContact" jsonb NOT NULL DEFAULT '{}'::jsonb,"allergies" text,"conditions" text,"notes" text,"active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CarePatient_kind_check" CHECK ("kind" IN ('human','animal')),
  CONSTRAINT "CarePatient_tenant_idnumber_unique" UNIQUE ("tenantId", "idNumber"),
  CONSTRAINT "CarePatient_tenant_microchip_unique" UNIQUE ("tenantId", "microchip")
);
CREATE TABLE IF NOT EXISTS public."CareAppointment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES public."CarePatient"("id") ON DELETE CASCADE,"professionalId" text REFERENCES public."CareProfessional"("id") ON DELETE SET NULL,
  "startsAt" timestamptz NOT NULL,"endsAt" timestamptz NOT NULL,"type" text NOT NULL DEFAULT 'consultation',"status" text NOT NULL DEFAULT 'scheduled',
  "reason" text,"channel" text NOT NULL DEFAULT 'onsite',"room" text,"reminderStatus" text NOT NULL DEFAULT 'pending',"notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CareAppointment_status_check" CHECK ("status" IN ('scheduled','confirmed','checked_in','in_progress','completed','cancelled','no_show')),
  CONSTRAINT "CareAppointment_channel_check" CHECK ("channel" IN ('onsite','telemedicine','home_visit')),
  CONSTRAINT "CareAppointment_time_check" CHECK ("endsAt" > "startsAt")
);
CREATE TABLE IF NOT EXISTS public."CareEncounter" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES public."CarePatient"("id") ON DELETE CASCADE,"professionalId" text REFERENCES public."CareProfessional"("id") ON DELETE SET NULL,
  "appointmentId" text REFERENCES public."CareAppointment"("id") ON DELETE SET NULL,"specialty" text NOT NULL DEFAULT 'general',"type" text NOT NULL DEFAULT 'consultation',
  "subjective" text,"objective" text,"assessment" text,"plan" text,"diagnosisCodes" jsonb NOT NULL DEFAULT '[]'::jsonb,"clinicalData" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "confidential" boolean NOT NULL DEFAULT false,"status" text NOT NULL DEFAULT 'draft',"signedAt" timestamptz,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CareEncounter_status_check" CHECK ("status" IN ('draft','signed','amended','cancelled'))
);
CREATE TABLE IF NOT EXISTS public."CareMeasurement" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES public."CarePatient"("id") ON DELETE CASCADE,"encounterId" text REFERENCES public."CareEncounter"("id") ON DELETE SET NULL,
  "kind" text NOT NULL,"value" numeric(18,4) NOT NULL,"unit" text NOT NULL,"measuredAt" timestamptz NOT NULL DEFAULT now(),"metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public."CarePrescription" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES public."CarePatient"("id") ON DELETE CASCADE,"encounterId" text REFERENCES public."CareEncounter"("id") ON DELETE SET NULL,
  "professionalId" text REFERENCES public."CareProfessional"("id") ON DELETE SET NULL,"medication" text NOT NULL,"dose" text,"frequency" text,"duration" text,"instructions" text,
  "status" text NOT NULL DEFAULT 'active',"createdAt" timestamptz NOT NULL DEFAULT now(),CONSTRAINT "CarePrescription_status_check" CHECK ("status" IN ('active','completed','cancelled'))
);
CREATE TABLE IF NOT EXISTS public."CareConsent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES public."CarePatient"("id") ON DELETE CASCADE,"kind" text NOT NULL,"status" text NOT NULL DEFAULT 'pending',"signerName" text,"signedAt" timestamptz,
  "documentUrl" text,"metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,"createdAt" timestamptz NOT NULL DEFAULT now(),CONSTRAINT "CareConsent_status_check" CHECK ("status" IN ('pending','signed','revoked','expired'))
);
CREATE TABLE IF NOT EXISTS public."CareImmunization" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES public."CarePatient"("id") ON DELETE CASCADE,"professionalId" text REFERENCES public."CareProfessional"("id") ON DELETE SET NULL,
  "vaccine" text NOT NULL,"dose" text,"lot" text,"administeredAt" timestamptz NOT NULL DEFAULT now(),"nextDueAt" timestamptz,"notes" text,"createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public."GymMember" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,"userId" text REFERENCES public."UserProfile"("id") ON DELETE SET NULL,
  "memberCode" text NOT NULL,"fullName" text NOT NULL,"email" text,"phone" text,"birthDate" date,"sex" text,"photoUrl" text,"emergencyContact" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "goals" jsonb NOT NULL DEFAULT '[]'::jsonb,"medicalNotes" text,"status" text NOT NULL DEFAULT 'active',"joinedAt" timestamptz NOT NULL DEFAULT now(),"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymMember_status_check" CHECK ("status" IN ('active','inactive','frozen','blocked')),CONSTRAINT "GymMember_tenant_code_unique" UNIQUE ("tenantId", "memberCode")
);
CREATE TABLE IF NOT EXISTS public."GymTrainer" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,"userId" text REFERENCES public."UserProfile"("id") ON DELETE SET NULL,
  "fullName" text NOT NULL,"email" text,"phone" text,"specialties" jsonb NOT NULL DEFAULT '[]'::jsonb,"status" text NOT NULL DEFAULT 'active',"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymTrainer_status_check" CHECK ("status" IN ('active','inactive','vacation'))
);
CREATE TABLE IF NOT EXISTS public."GymMembershipPlan" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,"name" text NOT NULL,"durationDays" integer NOT NULL DEFAULT 30,
  "price" numeric(18,2) NOT NULL DEFAULT 0,"currency" text NOT NULL DEFAULT 'USD',"accessLimit" integer,"classLimit" integer,"active" boolean NOT NULL DEFAULT true,"metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),CONSTRAINT "GymMembershipPlan_duration_check" CHECK ("durationDays" BETWEEN 1 AND 3650),
  CONSTRAINT "GymMembershipPlan_tenant_name_unique" UNIQUE ("tenantId", "name")
);
CREATE TABLE IF NOT EXISTS public."GymMembership" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,"memberId" text NOT NULL REFERENCES public."GymMember"("id") ON DELETE CASCADE,
  "planId" text NOT NULL REFERENCES public."GymMembershipPlan"("id") ON DELETE RESTRICT,"startsAt" timestamptz NOT NULL,"endsAt" timestamptz NOT NULL,"status" text NOT NULL DEFAULT 'active',
  "remainingAccesses" integer,"balance" numeric(18,2) NOT NULL DEFAULT 0,"autoRenew" boolean NOT NULL DEFAULT false,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymMembership_status_check" CHECK ("status" IN ('active','expired','frozen','cancelled','pending')),CONSTRAINT "GymMembership_time_check" CHECK ("endsAt" > "startsAt")
);
CREATE TABLE IF NOT EXISTS public."GymCheckIn" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,"memberId" text NOT NULL REFERENCES public."GymMember"("id") ON DELETE CASCADE,
  "membershipId" text REFERENCES public."GymMembership"("id") ON DELETE SET NULL,"checkedInAt" timestamptz NOT NULL DEFAULT now(),"method" text NOT NULL DEFAULT 'manual',"device" text,
  "result" text NOT NULL DEFAULT 'accepted',"notes" text,CONSTRAINT "GymCheckIn_result_check" CHECK ("result" IN ('accepted','rejected','manual_override'))
);
CREATE TABLE IF NOT EXISTS public."GymAssessment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,"memberId" text NOT NULL REFERENCES public."GymMember"("id") ON DELETE CASCADE,
  "trainerId" text REFERENCES public."GymTrainer"("id") ON DELETE SET NULL,"measuredAt" timestamptz NOT NULL DEFAULT now(),"weightKg" numeric(8,3),"heightCm" numeric(8,2),"bodyFatPct" numeric(6,2),
  "muscleMassKg" numeric(8,3),"visceralFat" numeric(6,2),"bmi" numeric(6,2),"waistCm" numeric(8,2),"hipCm" numeric(8,2),"chestCm" numeric(8,2),"armCm" numeric(8,2),"thighCm" numeric(8,2),
  "restingHeartRate" integer,"notes" text,"createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public."GymExercise" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,"name" text NOT NULL,"category" text,"muscleGroup" text,"equipment" text,
  "instructions" text,"mediaUrl" text,"defaultSets" integer,"defaultReps" text,"active" boolean NOT NULL DEFAULT true,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymExercise_tenant_name_unique" UNIQUE ("tenantId", "name")
);
CREATE TABLE IF NOT EXISTS public."GymRoutine" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,"memberId" text NOT NULL REFERENCES public."GymMember"("id") ON DELETE CASCADE,
  "trainerId" text REFERENCES public."GymTrainer"("id") ON DELETE SET NULL,"name" text NOT NULL,"goal" text,"level" text NOT NULL DEFAULT 'beginner',"startsAt" date,"endsAt" date,"daysPerWeek" integer NOT NULL DEFAULT 3,
  "notes" text,"active" boolean NOT NULL DEFAULT true,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),CONSTRAINT "GymRoutine_days_check" CHECK ("daysPerWeek" BETWEEN 1 AND 7)
);
CREATE TABLE IF NOT EXISTS public."GymRoutineExercise" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,"routineId" text NOT NULL REFERENCES public."GymRoutine"("id") ON DELETE CASCADE,
  "exerciseId" text REFERENCES public."GymExercise"("id") ON DELETE SET NULL,"dayOfWeek" integer NOT NULL DEFAULT 1,"sortOrder" integer NOT NULL DEFAULT 1,"sets" integer NOT NULL DEFAULT 3,"reps" text NOT NULL DEFAULT '10',
  "loadKg" numeric(8,2),"restSeconds" integer NOT NULL DEFAULT 60,"tempo" text,"notes" text,CONSTRAINT "GymRoutineExercise_day_check" CHECK ("dayOfWeek" BETWEEN 1 AND 7)
);
CREATE TABLE IF NOT EXISTS public."GymNutritionPlan" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,"memberId" text NOT NULL REFERENCES public."GymMember"("id") ON DELETE CASCADE,
  "trainerId" text REFERENCES public."GymTrainer"("id") ON DELETE SET NULL,"name" text NOT NULL,"goal" text,"targetCalories" integer,"proteinG" numeric(8,2),"carbsG" numeric(8,2),"fatG" numeric(8,2),"waterMl" integer,
  "notes" text,"startsAt" date,"endsAt" date,"active" boolean NOT NULL DEFAULT true,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public."GymMeal" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,"nutritionPlanId" text NOT NULL REFERENCES public."GymNutritionPlan"("id") ON DELETE CASCADE,
  "mealType" text NOT NULL,"plannedAt" time,"items" jsonb NOT NULL DEFAULT '[]'::jsonb,"calories" integer,"proteinG" numeric(8,2),"carbsG" numeric(8,2),"fatG" numeric(8,2),"notes" text
);
CREATE TABLE IF NOT EXISTS public."GymClass" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,"trainerId" text REFERENCES public."GymTrainer"("id") ON DELETE SET NULL,
  "name" text NOT NULL,"startsAt" timestamptz NOT NULL,"endsAt" timestamptz NOT NULL,"capacity" integer NOT NULL DEFAULT 20,"location" text,"status" text NOT NULL DEFAULT 'scheduled',
  "createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),CONSTRAINT "GymClass_status_check" CHECK ("status" IN ('scheduled','completed','cancelled')),CONSTRAINT "GymClass_time_check" CHECK ("endsAt" > "startsAt")
);
CREATE TABLE IF NOT EXISTS public."GymClassBooking" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,"classId" text NOT NULL REFERENCES public."GymClass"("id") ON DELETE CASCADE,
  "memberId" text NOT NULL REFERENCES public."GymMember"("id") ON DELETE CASCADE,"status" text NOT NULL DEFAULT 'booked',"bookedAt" timestamptz NOT NULL DEFAULT now(),"checkInAt" timestamptz,
  CONSTRAINT "GymClassBooking_status_check" CHECK ("status" IN ('booked','attended','cancelled','no_show')),CONSTRAINT "GymClassBooking_class_member_unique" UNIQUE ("classId", "memberId")
);
CREATE TABLE IF NOT EXISTS public."GymPayment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,"memberId" text NOT NULL REFERENCES public."GymMember"("id") ON DELETE CASCADE,
  "membershipId" text REFERENCES public."GymMembership"("id") ON DELETE SET NULL,"amount" numeric(18,2) NOT NULL,"currency" text NOT NULL DEFAULT 'USD',"paidAt" timestamptz NOT NULL DEFAULT now(),"method" text,"reference" text,
  "status" text NOT NULL DEFAULT 'paid',"createdAt" timestamptz NOT NULL DEFAULT now(),CONSTRAINT "GymPayment_status_check" CHECK ("status" IN ('pending','paid','void','refunded'))
);
CREATE TABLE IF NOT EXISTS public."CommunicationTemplate" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,"channel" text NOT NULL DEFAULT 'whatsapp',"vertical" text NOT NULL DEFAULT 'general',
  "event" text NOT NULL,"name" text NOT NULL,"body" text NOT NULL,"variables" jsonb NOT NULL DEFAULT '[]'::jsonb,"active" boolean NOT NULL DEFAULT true,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CommunicationTemplate_channel_check" CHECK ("channel" IN ('whatsapp','email','sms')),CONSTRAINT "CommunicationTemplate_tenant_event_unique" UNIQUE ("tenantId", "channel", "vertical", "event")
);
CREATE INDEX IF NOT EXISTS "CareProfessional_tenant_specialty_idx" ON public."CareProfessional" ("tenantId", "specialty", "status");
CREATE INDEX IF NOT EXISTS "CarePatient_tenant_kind_name_idx" ON public."CarePatient" ("tenantId", "kind", "displayName");
CREATE INDEX IF NOT EXISTS "CareAppointment_tenant_start_idx" ON public."CareAppointment" ("tenantId", "startsAt", "status");
CREATE INDEX IF NOT EXISTS "CareEncounter_patient_created_idx" ON public."CareEncounter" ("tenantId", "patientId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CareMeasurement_patient_date_idx" ON public."CareMeasurement" ("tenantId", "patientId", "measuredAt" DESC);
CREATE INDEX IF NOT EXISTS "CareImmunization_due_idx" ON public."CareImmunization" ("tenantId", "nextDueAt");
CREATE INDEX IF NOT EXISTS "GymMember_tenant_status_idx" ON public."GymMember" ("tenantId", "status", "fullName");
CREATE INDEX IF NOT EXISTS "GymMembership_tenant_end_idx" ON public."GymMembership" ("tenantId", "status", "endsAt");
CREATE INDEX IF NOT EXISTS "GymCheckIn_tenant_date_idx" ON public."GymCheckIn" ("tenantId", "checkedInAt" DESC);
CREATE INDEX IF NOT EXISTS "GymAssessment_member_date_idx" ON public."GymAssessment" ("tenantId", "memberId", "measuredAt" DESC);
CREATE INDEX IF NOT EXISTS "GymRoutine_member_active_idx" ON public."GymRoutine" ("tenantId", "memberId", "active");
CREATE INDEX IF NOT EXISTS "GymNutrition_member_active_idx" ON public."GymNutritionPlan" ("tenantId", "memberId", "active");
CREATE INDEX IF NOT EXISTS "GymClass_tenant_start_idx" ON public."GymClass" ("tenantId", "startsAt", "status");
CREATE INDEX IF NOT EXISTS "GymPayment_tenant_date_idx" ON public."GymPayment" ("tenantId", "paidAt" DESC);
DO $$
DECLARE table_name text; tables text[] := ARRAY['CareProfessional','CarePatient','CareAppointment','CareEncounter','CareMeasurement','CarePrescription','CareConsent','CareImmunization','GymMember','GymTrainer','GymMembershipPlan','GymMembership','GymCheckIn','GymAssessment','GymExercise','GymRoutine','GymRoutineExercise','GymNutritionPlan','GymMeal','GymClass','GymClassBooking','GymPayment','CommunicationTemplate'];
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_service_role_all', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', table_name || '_service_role_all', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_tenant_authenticated_all', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ("tenantId" = private.current_tenant_id()) WITH CHECK ("tenantId" = private.current_tenant_id())', table_name || '_tenant_authenticated_all', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role', table_name);
  END LOOP;
END $$;
