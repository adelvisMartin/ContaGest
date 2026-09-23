ALTER TABLE public."GymNutritionPlan"
  ADD COLUMN IF NOT EXISTS "durationDays" integer NOT NULL DEFAULT 7;

ALTER TABLE public."GymNutritionPlan"
  DROP CONSTRAINT IF EXISTS "GymNutritionPlan_durationDays_check";
ALTER TABLE public."GymNutritionPlan"
  ADD CONSTRAINT "GymNutritionPlan_durationDays_check" CHECK ("durationDays" IN (7,14,28));

ALTER TABLE public."GymMeal"
  ADD COLUMN IF NOT EXISTS "dayIndex" integer,
  ADD COLUMN IF NOT EXISTS "recipeId" text,
  ADD COLUMN IF NOT EXISTS "servings" numeric(8,3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "preparation" text;

ALTER TABLE public."GymMeal"
  DROP CONSTRAINT IF EXISTS "GymMeal_dayIndex_check";
ALTER TABLE public."GymMeal"
  ADD CONSTRAINT "GymMeal_dayIndex_check" CHECK ("dayIndex" IS NULL OR "dayIndex" BETWEEN 1 AND 28);

ALTER TABLE public."GymMeal"
  DROP CONSTRAINT IF EXISTS "GymMeal_servings_positive";
ALTER TABLE public."GymMeal"
  ADD CONSTRAINT "GymMeal_servings_positive" CHECK ("servings">0 AND "servings"<=100);

CREATE TABLE IF NOT EXISTS public."GymRecipe" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "name" text NOT NULL,
  "servings" numeric(8,3) NOT NULL DEFAULT 1,
  "preparation" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymRecipe_servings_positive" CHECK ("servings">0 AND "servings"<=100)
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymRecipe_tenant_name_unique"
  ON public."GymRecipe" ("tenantId",lower(btrim("name")));

CREATE INDEX IF NOT EXISTS "GymRecipe_tenant_active_name_idx"
  ON public."GymRecipe" ("tenantId","active","name");

CREATE TABLE IF NOT EXISTS public."GymRecipeItem" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "recipeId" text NOT NULL,
  "ingredientId" text NOT NULL,
  "quantity" numeric(12,3) NOT NULL,
  "unit" text NOT NULL,
  "sortOrder" integer NOT NULL DEFAULT 1,
  "notes" text,
  CONSTRAINT "GymRecipeItem_quantity_positive" CHECK ("quantity">0),
  CONSTRAINT "GymRecipeItem_recipe_fk" FOREIGN KEY ("recipeId") REFERENCES public."GymRecipe"("id") ON DELETE CASCADE,
  CONSTRAINT "GymRecipeItem_ingredient_fk" FOREIGN KEY ("ingredientId") REFERENCES public."GymIngredient"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymRecipeItem_recipe_sort_unique"
  ON public."GymRecipeItem" ("recipeId","sortOrder");

CREATE TABLE IF NOT EXISTS public."GymMealAlternative" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "mealId" text NOT NULL,
  "recipeId" text NOT NULL,
  "label" text,
  "servings" numeric(8,3) NOT NULL DEFAULT 1,
  "sortOrder" integer NOT NULL DEFAULT 1,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymMealAlternative_servings_positive" CHECK ("servings">0 AND "servings"<=100),
  CONSTRAINT "GymMealAlternative_meal_fk" FOREIGN KEY ("mealId") REFERENCES public."GymMeal"("id") ON DELETE CASCADE,
  CONSTRAINT "GymMealAlternative_recipe_fk" FOREIGN KEY ("recipeId") REFERENCES public."GymRecipe"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymMealAlternative_meal_recipe_unique"
  ON public."GymMealAlternative" ("mealId","recipeId");

ALTER TABLE public."GymMeal"
  DROP CONSTRAINT IF EXISTS "GymMeal_recipe_fk";
ALTER TABLE public."GymMeal"
  ADD CONSTRAINT "GymMeal_recipe_fk"
  FOREIGN KEY ("recipeId") REFERENCES public."GymRecipe"("id") ON DELETE RESTRICT;

DROP INDEX IF EXISTS public."GymMeal_plan_day_order_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "GymMeal_plan_dayIndex_order_unique"
  ON public."GymMeal" ("nutritionPlanId","dayIndex","sortOrder")
  WHERE "dayIndex" IS NOT NULL;

DROP INDEX IF EXISTS public."GymMeal_plan_day_order_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "GymMeal_plan_day_index_order_unique"
  ON public."GymMeal" ("nutritionPlanId","dayIndex","sortOrder")
  WHERE "dayIndex" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "GymMeal_plan_day_idx"
  ON public."GymMeal" ("tenantId","nutritionPlanId","dayIndex","sortOrder");

COMMENT ON COLUMN public."GymNutritionPlan"."durationDays" IS '44/51 complete meal plan horizon; only 7, 14 or 28 days.';
COMMENT ON COLUMN public."GymMeal"."dayIndex" IS '44/51 absolute day inside a 7/14/28-day plan. NULL preserves legacy meals.';
COMMENT ON TABLE public."GymRecipe" IS '44/51 reusable recipe composed only from canonical GymIngredient rows.';
COMMENT ON TABLE public."GymMealAlternative" IS '44/51 explicit alternatives only; no automated restriction/preference matching until 45/51.';
