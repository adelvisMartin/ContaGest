CREATE TABLE IF NOT EXISTS public."GymMealAdherenceEvent" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "memberId" text NOT NULL,
  "planId" text NOT NULL,
  "mealId" text NOT NULL,
  "status" text NOT NULL,
  "occurredAt" timestamptz NOT NULL DEFAULT now(),
  "notes" text,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymMealAdherenceEvent_status_check" CHECK ("status" IN ('completed','partial','skipped')),
  CONSTRAINT "GymMealAdherenceEvent_member_fk" FOREIGN KEY ("memberId") REFERENCES public."GymMember"("id") ON DELETE RESTRICT,
  CONSTRAINT "GymMealAdherenceEvent_plan_fk" FOREIGN KEY ("planId") REFERENCES public."GymNutritionPlan"("id") ON DELETE RESTRICT,
  CONSTRAINT "GymMealAdherenceEvent_meal_fk" FOREIGN KEY ("mealId") REFERENCES public."GymMeal"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "GymMealAdherenceEvent_tenant_member_occurred_idx"
  ON public."GymMealAdherenceEvent" ("tenantId","memberId","occurredAt" DESC);

CREATE TABLE IF NOT EXISTS public."GymHabit" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "memberId" text NOT NULL,
  "name" text NOT NULL,
  "targetPerWeek" integer NOT NULL DEFAULT 7,
  "notes" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymHabit_target_check" CHECK ("targetPerWeek" BETWEEN 1 AND 14),
  CONSTRAINT "GymHabit_member_fk" FOREIGN KEY ("memberId") REFERENCES public."GymMember"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymHabit_tenant_member_name_unique"
  ON public."GymHabit" ("tenantId","memberId",lower(btrim("name")));

CREATE TABLE IF NOT EXISTS public."GymHabitCheckIn" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "memberId" text NOT NULL,
  "habitId" text NOT NULL,
  "status" text NOT NULL,
  "occurredAt" timestamptz NOT NULL DEFAULT now(),
  "notes" text,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymHabitCheckIn_status_check" CHECK ("status" IN ('completed','skipped')),
  CONSTRAINT "GymHabitCheckIn_member_fk" FOREIGN KEY ("memberId") REFERENCES public."GymMember"("id") ON DELETE CASCADE,
  CONSTRAINT "GymHabitCheckIn_habit_fk" FOREIGN KEY ("habitId") REFERENCES public."GymHabit"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "GymHabitCheckIn_tenant_member_occurred_idx"
  ON public."GymHabitCheckIn" ("tenantId","memberId","occurredAt" DESC);

CREATE TABLE IF NOT EXISTS public."GymAdherenceGoal" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "memberId" text NOT NULL,
  "kind" text NOT NULL,
  "label" text NOT NULL,
  "targetValue" numeric(14,3) NOT NULL,
  "unit" text NOT NULL,
  "dueAt" date,
  "notes" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymAdherenceGoal_kind_check" CHECK ("kind" IN ('workouts_per_week','meal_adherence_pct','habit_adherence_pct','weight_kg','custom')),
  CONSTRAINT "GymAdherenceGoal_target_check" CHECK ("targetValue">=0),
  CONSTRAINT "GymAdherenceGoal_member_fk" FOREIGN KEY ("memberId") REFERENCES public."GymMember"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "GymAdherenceGoal_tenant_member_active_idx"
  ON public."GymAdherenceGoal" ("tenantId","memberId","active","createdAt" DESC);

CREATE TABLE IF NOT EXISTS public."GymProgressPhoto" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "memberId" text NOT NULL,
  "storagePath" text NOT NULL,
  "capturedAt" timestamptz NOT NULL,
  "authorizationConfirmed" boolean NOT NULL,
  "authorizationConfirmedAt" timestamptz NOT NULL,
  "notes" text,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymProgressPhoto_authorization_check" CHECK ("authorizationConfirmed"=true),
  CONSTRAINT "GymProgressPhoto_member_fk" FOREIGN KEY ("memberId") REFERENCES public."GymMember"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "GymProgressPhoto_tenant_member_captured_idx"
  ON public."GymProgressPhoto" ("tenantId","memberId","capturedAt" DESC);

COMMENT ON TABLE public."GymMealAdherenceEvent" IS '47/51 append-only meal adherence events. Latest event per planned meal defines current adherence state.';
COMMENT ON TABLE public."GymHabit" IS '47/51 explicit member habits; no gamification/streak state is stored.';
COMMENT ON TABLE public."GymHabitCheckIn" IS '47/51 append-only habit completion/skipped events.';
COMMENT ON TABLE public."GymAdherenceGoal" IS '47/51 explicit adherence/evolution targets. No automatic recommendation engine.';
COMMENT ON TABLE public."GymProgressPhoto" IS '47/51 private progress-photo metadata; storagePath only and explicit authorization required.';
