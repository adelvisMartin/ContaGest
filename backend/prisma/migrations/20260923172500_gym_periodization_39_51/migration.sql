CREATE TABLE IF NOT EXISTS public."GymPeriodizationTemplate" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "structure" jsonb NOT NULL DEFAULT '{"phases":[]}'::jsonb,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymPeriodizationTemplate_tenant_name_unique"
  ON public."GymPeriodizationTemplate" ("tenantId", lower(btrim("name")));

CREATE INDEX IF NOT EXISTS "GymPeriodizationTemplate_tenant_created_idx"
  ON public."GymPeriodizationTemplate" ("tenantId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS public."GymPeriodizationProgram" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "routineId" text NOT NULL REFERENCES public."GymRoutine"("id") ON DELETE CASCADE,
  "programKey" text NOT NULL,
  "version" integer NOT NULL CHECK ("version" >= 1),
  "name" text NOT NULL,
  "startsAt" date,
  "structure" jsonb NOT NULL,
  "sourceTemplateId" text REFERENCES public."GymPeriodizationTemplate"("id") ON DELETE RESTRICT,
  "supersedesId" text REFERENCES public."GymPeriodizationProgram"("id") ON DELETE RESTRICT,
  "notes" text,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymPeriodizationProgram_tenant_key_version_unique"
  ON public."GymPeriodizationProgram" ("tenantId", "programKey", "version");

CREATE INDEX IF NOT EXISTS "GymPeriodizationProgram_tenant_routine_idx"
  ON public."GymPeriodizationProgram" ("tenantId", "routineId", "createdAt" DESC);
