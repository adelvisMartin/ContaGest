CREATE TABLE IF NOT EXISTS public."GymFood" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "brand" text,
  "source" text NOT NULL DEFAULT 'manual',
  "sourceRef" text,
  "caloriesPer100g" numeric(10,2) NOT NULL DEFAULT 0,
  "proteinGPer100g" numeric(10,2) NOT NULL DEFAULT 0,
  "carbsGPer100g" numeric(10,2) NOT NULL DEFAULT 0,
  "fatGPer100g" numeric(10,2) NOT NULL DEFAULT 0,
  "fiberGPer100g" numeric(10,2) NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymFood_source_check" CHECK ("source" IN ('manual','usda')),
  CONSTRAINT "GymFood_macro_nonnegative_check" CHECK (
    "caloriesPer100g">=0 AND "proteinGPer100g">=0 AND "carbsGPer100g">=0 AND "fatGPer100g">=0 AND "fiberGPer100g">=0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymFood_tenant_name_unique"
  ON public."GymFood" ("tenantId", lower(btrim("name")), COALESCE(lower(btrim("brand")),''));

CREATE UNIQUE INDEX IF NOT EXISTS "GymFood_tenant_source_ref_unique"
  ON public."GymFood" ("tenantId","source","sourceRef")
  WHERE "sourceRef" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "GymFood_tenant_active_name_idx"
  ON public."GymFood" ("tenantId","active","name");

CREATE TABLE IF NOT EXISTS public."GymRecipe" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "servings" integer NOT NULL DEFAULT 1,
  "instructions" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymRecipe_servings_check" CHECK ("servings" BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymRecipe_tenant_name_unique"
  ON public."GymRecipe" ("tenantId", lower(btrim("name")));

CREATE TABLE IF NOT EXISTS public."GymRecipeIngredient" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "recipeId" text NOT NULL REFERENCES public."GymRecipe"("id") ON DELETE CASCADE,
  "foodId" text NOT NULL REFERENCES public."GymFood"("id") ON DELETE RESTRICT,
  "grams" numeric(10,2) NOT NULL,
  "sortOrder" integer NOT NULL DEFAULT 1,
  CONSTRAINT "GymRecipeIngredient_grams_check" CHECK ("grams">0 AND "grams"<=100000),
  CONSTRAINT "GymRecipeIngredient_sort_check" CHECK ("sortOrder" BETWEEN 1 AND 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymRecipeIngredient_recipe_food_unique"
  ON public."GymRecipeIngredient" ("recipeId","foodId");

CREATE INDEX IF NOT EXISTS "GymRecipeIngredient_tenant_recipe_idx"
  ON public."GymRecipeIngredient" ("tenantId","recipeId","sortOrder");
