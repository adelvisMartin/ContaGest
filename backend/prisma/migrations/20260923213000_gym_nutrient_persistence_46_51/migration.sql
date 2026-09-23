ALTER TABLE public."GymIngredient"
  ADD COLUMN IF NOT EXISTS "nutrientBasisQuantity" numeric(12,3),
  ADD COLUMN IF NOT EXISTS "nutrientBasisUnit" text,
  ADD COLUMN IF NOT EXISTS "energyKcal" numeric(12,3),
  ADD COLUMN IF NOT EXISTS "proteinG" numeric(12,3),
  ADD COLUMN IF NOT EXISTS "carbsG" numeric(12,3),
  ADD COLUMN IF NOT EXISTS "fatG" numeric(12,3),
  ADD COLUMN IF NOT EXISTS "fiberG" numeric(12,3),
  ADD COLUMN IF NOT EXISTS "micronutrients" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "nutritionSource" text,
  ADD COLUMN IF NOT EXISTS "nutritionSourceRef" text;

ALTER TABLE public."GymIngredient"
  DROP CONSTRAINT IF EXISTS "GymIngredient_nutrients_nonnegative";
ALTER TABLE public."GymIngredient"
  ADD CONSTRAINT "GymIngredient_nutrients_nonnegative" CHECK (
    ("nutrientBasisQuantity" IS NULL OR "nutrientBasisQuantity" > 0)
    AND ("energyKcal" IS NULL OR "energyKcal" >= 0)
    AND ("proteinG" IS NULL OR "proteinG" >= 0)
    AND ("carbsG" IS NULL OR "carbsG" >= 0)
    AND ("fatG" IS NULL OR "fatG" >= 0)
    AND ("fiberG" IS NULL OR "fiberG" >= 0)
  );

ALTER TABLE public."GymNutritionPlan"
  ADD COLUMN IF NOT EXISTS "fiberG" numeric(12,3),
  ADD COLUMN IF NOT EXISTS "micronutrientTargets" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public."GymNutritionPlan"
  DROP CONSTRAINT IF EXISTS "GymNutritionPlan_fiber_nonnegative";
ALTER TABLE public."GymNutritionPlan"
  ADD CONSTRAINT "GymNutritionPlan_fiber_nonnegative"
  CHECK ("fiberG" IS NULL OR "fiberG" >= 0);

COMMENT ON COLUMN public."GymIngredient"."nutrientBasisQuantity" IS '46/51 explicit quantity used as the nutrient-composition basis; no unit conversion is inferred.';
COMMENT ON COLUMN public."GymIngredient"."nutrientBasisUnit" IS '46/51 explicit basis unit for persisted nutrient composition.';
COMMENT ON COLUMN public."GymIngredient"."micronutrients" IS '46/51 source-provided micronutrients only; keys are not invented by ContaGest.';
COMMENT ON COLUMN public."GymIngredient"."nutritionSource" IS '46/51 provenance label for nutrient composition, e.g. FoodData/manual/import.';
COMMENT ON COLUMN public."GymNutritionPlan"."micronutrientTargets" IS '46/51 explicit plan targets only; no clinical rule is inferred or automated.';
