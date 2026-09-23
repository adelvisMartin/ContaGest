ALTER TABLE public."GymMeal"
  ADD COLUMN IF NOT EXISTS "dayOfWeek" integer,
  ADD COLUMN IF NOT EXISTS "sortOrder" integer NOT NULL DEFAULT 1;

ALTER TABLE public."GymMeal"
  DROP CONSTRAINT IF EXISTS "GymMeal_dayOfWeek_check";

ALTER TABLE public."GymMeal"
  ADD CONSTRAINT "GymMeal_dayOfWeek_check"
  CHECK ("dayOfWeek" IS NULL OR ("dayOfWeek" BETWEEN 1 AND 7));

ALTER TABLE public."GymMeal"
  DROP CONSTRAINT IF EXISTS "GymMeal_sortOrder_check";

ALTER TABLE public."GymMeal"
  ADD CONSTRAINT "GymMeal_sortOrder_check"
  CHECK ("sortOrder" BETWEEN 1 AND 50);

CREATE UNIQUE INDEX IF NOT EXISTS "GymMeal_plan_day_order_unique"
  ON public."GymMeal" ("nutritionPlanId","dayOfWeek","sortOrder")
  WHERE "dayOfWeek" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "GymMeal_tenant_plan_day_idx"
  ON public."GymMeal" ("tenantId","nutritionPlanId","dayOfWeek","sortOrder");

COMMENT ON COLUMN public."GymMeal"."dayOfWeek" IS '44/51 canonical weekday: 1 Monday through 7 Sunday. NULL preserves legacy meals without inventing a schedule.';
COMMENT ON COLUMN public."GymMeal"."sortOrder" IS '44/51 explicit order within one scheduled day.';
