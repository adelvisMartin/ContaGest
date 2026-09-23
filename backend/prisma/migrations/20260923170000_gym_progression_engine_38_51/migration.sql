ALTER TABLE public."GymRoutineExercise"
  ADD COLUMN IF NOT EXISTS "progressionStrategy" text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "progressionConfig" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public."GymRoutineExercise"
  DROP CONSTRAINT IF EXISTS "GymRoutineExercise_progressionStrategy_check";

ALTER TABLE public."GymRoutineExercise"
  ADD CONSTRAINT "GymRoutineExercise_progressionStrategy_check"
  CHECK ("progressionStrategy" IN ('manual','linear_load','double_progression','percent_1rm'));
