CREATE TABLE IF NOT EXISTS public."GymIngredientNutritionProfile" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "ingredientId" text NOT NULL,
  "version" integer NOT NULL,
  "basisQuantity" numeric(12,3) NOT NULL,
  "basisUnit" text NOT NULL,
  "energyKcal" numeric(14,3) NOT NULL,
  "proteinG" numeric(14,3) NOT NULL,
  "carbsG" numeric(14,3) NOT NULL,
  "fatG" numeric(14,3) NOT NULL,
  "fiberG" numeric(14,3) NOT NULL,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymIngredientNutritionProfile_basis_positive" CHECK ("basisQuantity">0),
  CONSTRAINT "GymIngredientNutritionProfile_values_nonnegative" CHECK (
    "energyKcal">=0 AND "proteinG">=0 AND "carbsG">=0 AND "fatG">=0 AND "fiberG">=0
  ),
  CONSTRAINT "GymIngredientNutritionProfile_ingredient_fk"
    FOREIGN KEY ("ingredientId") REFERENCES public."GymIngredient"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymIngredientNutritionProfile_tenant_ingredient_version_unique"
  ON public."GymIngredientNutritionProfile" ("tenantId","ingredientId","version");

CREATE INDEX IF NOT EXISTS "GymIngredientNutritionProfile_tenant_ingredient_version_idx"
  ON public."GymIngredientNutritionProfile" ("tenantId","ingredientId","version" DESC);

CREATE TABLE IF NOT EXISTS public."GymIngredientMicronutrient" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "profileId" text NOT NULL,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "amount" numeric(16,6) NOT NULL,
  "unit" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymIngredientMicronutrient_amount_nonnegative" CHECK ("amount">=0),
  CONSTRAINT "GymIngredientMicronutrient_unit_check" CHECK ("unit" IN ('g','mg','mcg','IU')),
  CONSTRAINT "GymIngredientMicronutrient_profile_fk"
    FOREIGN KEY ("profileId") REFERENCES public."GymIngredientNutritionProfile"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymIngredientMicronutrient_profile_key_unit_unique"
  ON public."GymIngredientMicronutrient" ("profileId","key","unit");

CREATE TABLE IF NOT EXISTS public."GymNutritionPlanNutrientSnapshot" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "planId" text NOT NULL,
  "complete" boolean NOT NULL,
  "energyKcal" numeric(16,3) NOT NULL,
  "proteinG" numeric(16,3) NOT NULL,
  "carbsG" numeric(16,3) NOT NULL,
  "fatG" numeric(16,3) NOT NULL,
  "fiberG" numeric(16,3) NOT NULL,
  "micronutrients" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "issues" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "profileRefs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymNutritionPlanNutrientSnapshot_plan_fk"
    FOREIGN KEY ("planId") REFERENCES public."GymNutritionPlan"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymNutritionPlanNutrientSnapshot_tenant_plan_unique"
  ON public."GymNutritionPlanNutrientSnapshot" ("tenantId","planId");

COMMENT ON TABLE public."GymIngredientNutritionProfile" IS '46/51 immutable versioned nutrient composition per explicit basis quantity+unit.';
COMMENT ON TABLE public."GymIngredientMicronutrient" IS '46/51 persisted micronutrients; values are never inferred or unit-converted.';
COMMENT ON TABLE public."GymNutritionPlanNutrientSnapshot" IS '46/51 immutable totals captured when a plan is created; complete=false when profiles are missing or units do not match exactly.';
