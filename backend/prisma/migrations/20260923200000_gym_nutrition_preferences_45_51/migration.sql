ALTER TABLE public."GymIngredient"
  ADD COLUMN IF NOT EXISTS "dietaryTags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "allergenTags" jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public."GymNutritionProfile" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "memberId" text NOT NULL,
  "preferredTags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "avoidedTags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "allergenTags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "excludedIngredientIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymNutritionProfile_member_fk" FOREIGN KEY ("memberId") REFERENCES public."GymMember"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymNutritionProfile_tenant_member_unique"
  ON public."GymNutritionProfile" ("tenantId","memberId");

CREATE INDEX IF NOT EXISTS "GymNutritionProfile_tenant_updated_idx"
  ON public."GymNutritionProfile" ("tenantId","updatedAt" DESC);

COMMENT ON COLUMN public."GymIngredient"."dietaryTags" IS '45/51 explicit operator-authored dietary labels only; no inferred health classification.';
COMMENT ON COLUMN public."GymIngredient"."allergenTags" IS '45/51 explicit allergen labels used for deterministic declared-profile conflict checks.';
COMMENT ON TABLE public."GymNutritionProfile" IS '45/51 explicit member preferences/restrictions. No diagnosis, nutrient composition, or adherence tracking.';
