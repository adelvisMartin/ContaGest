ALTER TABLE public."GymRoutine"
  ADD COLUMN IF NOT EXISTS "trainingMode" text NOT NULL DEFAULT 'unspecified';

ALTER TABLE public."GymRoutine"
  DROP CONSTRAINT IF EXISTS "GymRoutine_trainingMode_check";

ALTER TABLE public."GymRoutine"
  ADD CONSTRAINT "GymRoutine_trainingMode_check"
  CHECK ("trainingMode" IN ('unspecified','strength','hypertrophy','pump','endurance','power','conditioning','mobility'));
