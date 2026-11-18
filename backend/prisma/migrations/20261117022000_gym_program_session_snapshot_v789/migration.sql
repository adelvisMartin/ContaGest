-- #789 snapshot authority: existing GymWorkoutSession rows are legacy without
-- a version; new rows bind a server-selected program version + copied structure.
-- Retain old rows without synthetic backfills; no mutation of historic versions.
CREATE UNIQUE INDEX "GymPeriodizationProgram_tenant_id_unique"
  ON public."GymPeriodizationProgram" ("tenantId","id");
ALTER TABLE public."GymWorkoutSession"
  ADD COLUMN "programVersionId" text,
  ADD COLUMN "programSnapshot" jsonb,
  ADD COLUMN "routineSnapshot" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public."GymWorkoutSession"
  ADD CONSTRAINT "GymWorkoutSession_programSnapshot_pair_check" CHECK (
    ("programVersionId" IS NULL AND "programSnapshot" IS NULL)
    OR ("programVersionId" IS NOT NULL AND jsonb_typeof("programSnapshot")='object')
  ),
  ADD CONSTRAINT "GymWorkoutSession_routineSnapshot_array_check"
    CHECK (jsonb_typeof("routineSnapshot")='array'),
  ADD CONSTRAINT "GymWorkoutSession_programVersion_tenant_fk"
    FOREIGN KEY ("tenantId","programVersionId")
    REFERENCES public."GymPeriodizationProgram" ("tenantId","id") ON DELETE RESTRICT;
CREATE INDEX "GymWorkoutSession_programVersion_tenant_idx"
  ON public."GymWorkoutSession" ("tenantId","programVersionId")
  WHERE "programVersionId" IS NOT NULL;
