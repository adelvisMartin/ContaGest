ALTER TABLE public."GymWorkoutSet"
  ADD COLUMN IF NOT EXISTS "performedExerciseId" text REFERENCES public."GymExercise"("id") ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "substitutionReason" text;

CREATE INDEX IF NOT EXISTS "GymWorkoutSet_tenant_performed_exercise_idx"
  ON public."GymWorkoutSet" ("tenantId","performedExerciseId","recordedAt")
  WHERE "performedExerciseId" IS NOT NULL;
