-- #795: version history on the existing GymNutritionPlan authority.
-- Historical plans remain v1, with their original ID as plan key; no changes
-- to meals, adherence or immutable nutrient snapshots.
ALTER TABLE public."GymNutritionPlan"
  ADD COLUMN "planKey" text,
  ADD COLUMN "version" integer NOT NULL DEFAULT 1,
  ADD COLUMN "supersedesId" text;
UPDATE public."GymNutritionPlan" SET "planKey"="id" WHERE "planKey" IS NULL;
ALTER TABLE public."GymNutritionPlan"
  ALTER COLUMN "planKey" SET NOT NULL,
  ALTER COLUMN "planKey" SET DEFAULT gen_random_uuid()::text,
  ADD CONSTRAINT "GymNutritionPlan_version_positive_check" CHECK ("version" BETWEEN 1 AND 2147483647);
CREATE UNIQUE INDEX "GymNutritionPlan_tenant_key_version_unique"
  ON public."GymNutritionPlan" ("tenantId","planKey","version");
CREATE UNIQUE INDEX "GymNutritionPlan_tenant_id_unique"
  ON public."GymNutritionPlan" ("tenantId","id");
ALTER TABLE public."GymNutritionPlan"
  ADD CONSTRAINT "GymNutritionPlan_supersedes_tenant_fk"
  FOREIGN KEY ("tenantId","supersedesId")
  REFERENCES public."GymNutritionPlan" ("tenantId","id") ON DELETE RESTRICT;
