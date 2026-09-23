CREATE TABLE IF NOT EXISTS public."GymNutritionRule" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "memberId" text NOT NULL,
  "ingredientId" text NOT NULL,
  "kind" text NOT NULL,
  "notes" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymNutritionRule_kind_check" CHECK ("kind" IN ('allergy','intolerance','exclusion','preferred')),
  CONSTRAINT "GymNutritionRule_member_fk" FOREIGN KEY ("memberId") REFERENCES public."GymMember"("id") ON DELETE CASCADE,
  CONSTRAINT "GymNutritionRule_ingredient_fk" FOREIGN KEY ("ingredientId") REFERENCES public."GymIngredient"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymNutritionRule_tenant_member_ingredient_kind_unique"
  ON public."GymNutritionRule" ("tenantId","memberId","ingredientId","kind");

CREATE INDEX IF NOT EXISTS "GymNutritionRule_tenant_member_active_idx"
  ON public."GymNutritionRule" ("tenantId","memberId","active","kind");

COMMENT ON TABLE public."GymNutritionRule" IS '45/51 explicit member-declared ingredient rules. No condition/allergy inference is performed.';
COMMENT ON COLUMN public."GymNutritionRule"."kind" IS 'allergy/intolerance/exclusion block matching ingredients; preferred is informational and never auto-applied.';
