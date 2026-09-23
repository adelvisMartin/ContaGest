ALTER TABLE public."GymRoutineExercise"
  ADD COLUMN IF NOT EXISTS "intensityTechnique" text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS "techniqueConfig" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public."GymRoutineExercise"
  DROP CONSTRAINT IF EXISTS "GymRoutineExercise_intensityTechnique_check";

ALTER TABLE public."GymRoutineExercise"
  ADD CONSTRAINT "GymRoutineExercise_intensityTechnique_check"
  CHECK ("intensityTechnique" IN (
    'standard','drop_set','rest_pause','myo_reps','cluster',
    'superset','giant_set','mechanical_drop','isometric_hold'
  ));
