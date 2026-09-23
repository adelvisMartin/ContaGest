CREATE TABLE IF NOT EXISTS public."GymIngredient" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "name" text NOT NULL,
  "category" text,
  "defaultUnit" text NOT NULL DEFAULT 'g',
  "notes" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymIngredient_tenant_name_unique"
  ON public."GymIngredient" ("tenantId", lower(btrim("name")));

CREATE INDEX IF NOT EXISTS "GymIngredient_tenant_active_name_idx"
  ON public."GymIngredient" ("tenantId","active","name");

CREATE TABLE IF NOT EXISTS public."GymMealItem" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "mealId" text NOT NULL,
  "ingredientId" text NOT NULL,
  "quantity" numeric(12,3) NOT NULL,
  "unit" text NOT NULL,
  "notes" text,
  "sortOrder" integer NOT NULL DEFAULT 1,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymMealItem_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "GymMealItem_sortOrder_positive" CHECK ("sortOrder" > 0),
  CONSTRAINT "GymMealItem_meal_fk" FOREIGN KEY ("mealId") REFERENCES public."GymMeal"("id") ON DELETE CASCADE,
  CONSTRAINT "GymMealItem_ingredient_fk" FOREIGN KEY ("ingredientId") REFERENCES public."GymIngredient"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymMealItem_meal_sort_unique"
  ON public."GymMealItem" ("mealId","sortOrder");

CREATE INDEX IF NOT EXISTS "GymMealItem_tenant_meal_idx"
  ON public."GymMealItem" ("tenantId","mealId");

CREATE INDEX IF NOT EXISTS "GymMealItem_tenant_ingredient_idx"
  ON public."GymMealItem" ("tenantId","ingredientId");

COMMENT ON TABLE public."GymIngredient" IS '43/51 canonical tenant-scoped ingredient catalog. Nutrient composition is intentionally deferred to 46/51.';
COMMENT ON TABLE public."GymMealItem" IS '43/51 structured ingredient quantities for GymMeal; GymMeal.items remains legacy-compatible JSON and new writes use relational items.';
