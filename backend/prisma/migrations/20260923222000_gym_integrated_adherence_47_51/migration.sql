CREATE TABLE IF NOT EXISTS public."GymMealAdherenceEvent" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "memberId" text NOT NULL,
  "nutritionPlanId" text NOT NULL,
  "mealId" text NOT NULL,
  "status" text NOT NULL,
  "notes" text,
  "recordedBy" text,
  "recordedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymMealAdherenceEvent_status_check" CHECK ("status" IN ('completed','skipped')),
  CONSTRAINT "GymMealAdherenceEvent_member_fk"
    FOREIGN KEY ("memberId") REFERENCES public."GymMember"("id") ON DELETE CASCADE,
  CONSTRAINT "GymMealAdherenceEvent_plan_fk"
    FOREIGN KEY ("nutritionPlanId") REFERENCES public."GymNutritionPlan"("id") ON DELETE CASCADE,
  CONSTRAINT "GymMealAdherenceEvent_meal_fk"
    FOREIGN KEY ("mealId") REFERENCES public."GymMeal"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "GymMealAdherenceEvent_tenant_member_recorded_idx"
  ON public."GymMealAdherenceEvent" ("tenantId","memberId","recordedAt" DESC);

CREATE INDEX IF NOT EXISTS "GymMealAdherenceEvent_tenant_meal_recorded_idx"
  ON public."GymMealAdherenceEvent" ("tenantId","mealId","recordedAt" DESC,"id" DESC);

COMMENT ON TABLE public."GymMealAdherenceEvent" IS
  '47/51 append-only meal adherence events. Latest event per planned meal is derived; training/measurements remain owned by existing canonical tables.';
