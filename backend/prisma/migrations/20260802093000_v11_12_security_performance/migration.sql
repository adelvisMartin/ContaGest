-- ContaGest v11.12 · acceso temporal, antifuerza bruta durable e índices FK
-- RLS: AuthLoginAttempt es exclusivamente server-side; anon/authenticated no reciben permisos.

ALTER TABLE public."UserProfile" ADD COLUMN IF NOT EXISTS "accessExpiresAt" timestamptz;

CREATE INDEX IF NOT EXISTS idx_userprofile_access_expires_at ON public."UserProfile" ("accessExpiresAt") WHERE "accessExpiresAt" IS NOT NULL;

CREATE TABLE IF NOT EXISTS public."AuthLoginAttempt" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantRif" text NOT NULL,
  "email" text NOT NULL,
  "ipAddress" text NOT NULL,
  "success" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_authloginattempt_identity_window ON public."AuthLoginAttempt" ("tenantRif", "email", "ipAddress", "success", "createdAt");

CREATE INDEX IF NOT EXISTS idx_authloginattempt_created_at ON public."AuthLoginAttempt" ("createdAt");

ALTER TABLE public."AuthLoginAttempt" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."AuthLoginAttempt" FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_coordinatecard_userid_fk ON public."CoordinateCard" ("userId");

CREATE INDEX IF NOT EXISTS idx_coordinatechallenge_cardid_fk ON public."CoordinateChallenge" ("cardId");

CREATE INDEX IF NOT EXISTS idx_coordinatechallenge_userid_fk ON public."CoordinateChallenge" ("userId");

CREATE INDEX IF NOT EXISTS idx_gymassessment_memberid_fk ON public."GymAssessment" ("memberId");

CREATE INDEX IF NOT EXISTS idx_gymassessment_trainerid_fk ON public."GymAssessment" ("trainerId");

CREATE INDEX IF NOT EXISTS idx_gymcheckin_memberid_fk ON public."GymCheckIn" ("memberId");

CREATE INDEX IF NOT EXISTS idx_gymcheckin_membershipid_fk ON public."GymCheckIn" ("membershipId");

CREATE INDEX IF NOT EXISTS idx_gymclass_trainerid_fk ON public."GymClass" ("trainerId");

CREATE INDEX IF NOT EXISTS idx_gymclassbooking_memberid_fk ON public."GymClassBooking" ("memberId");

CREATE INDEX IF NOT EXISTS idx_gymclassbooking_tenantid_fk ON public."GymClassBooking" ("tenantId");

CREATE INDEX IF NOT EXISTS idx_gymmeal_nutritionplanid_fk ON public."GymMeal" ("nutritionPlanId");

CREATE INDEX IF NOT EXISTS idx_gymmeal_tenantid_fk ON public."GymMeal" ("tenantId");

CREATE INDEX IF NOT EXISTS idx_gymmember_userid_fk ON public."GymMember" ("userId");

CREATE INDEX IF NOT EXISTS idx_gymmembership_memberid_fk ON public."GymMembership" ("memberId");

CREATE INDEX IF NOT EXISTS idx_gymmembership_planid_fk ON public."GymMembership" ("planId");

CREATE INDEX IF NOT EXISTS idx_gymnutritionplan_memberid_fk ON public."GymNutritionPlan" ("memberId");

CREATE INDEX IF NOT EXISTS idx_gymnutritionplan_trainerid_fk ON public."GymNutritionPlan" ("trainerId");

CREATE INDEX IF NOT EXISTS idx_gympayment_memberid_fk ON public."GymPayment" ("memberId");

CREATE INDEX IF NOT EXISTS idx_gympayment_membershipid_fk ON public."GymPayment" ("membershipId");

CREATE INDEX IF NOT EXISTS idx_gymroutine_memberid_fk ON public."GymRoutine" ("memberId");

CREATE INDEX IF NOT EXISTS idx_gymroutine_trainerid_fk ON public."GymRoutine" ("trainerId");

CREATE INDEX IF NOT EXISTS idx_gymroutineexercise_exerciseid_fk ON public."GymRoutineExercise" ("exerciseId");

CREATE INDEX IF NOT EXISTS idx_gymroutineexercise_routineid_fk ON public."GymRoutineExercise" ("routineId");

CREATE INDEX IF NOT EXISTS idx_gymroutineexercise_tenantid_fk ON public."GymRoutineExercise" ("tenantId");

CREATE INDEX IF NOT EXISTS idx_gymtrainer_tenantid_fk ON public."GymTrainer" ("tenantId");

CREATE INDEX IF NOT EXISTS idx_gymtrainer_userid_fk ON public."GymTrainer" ("userId");

CREATE INDEX IF NOT EXISTS idx_licenseactivation_userid_fk ON public."LicenseActivation" ("userId");

