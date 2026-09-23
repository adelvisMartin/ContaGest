CREATE TABLE IF NOT EXISTS public."GymWorkoutSession" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "routineId" text NOT NULL REFERENCES public."GymRoutine"("id") ON DELETE RESTRICT,
  "memberId" text NOT NULL REFERENCES public."GymMember"("id") ON DELETE RESTRICT,
  "status" text NOT NULL DEFAULT 'in_progress',
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  "notes" text,
  "createdBy" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymWorkoutSession_status_check"
    CHECK ("status" IN ('in_progress','completed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymWorkoutSession_one_active_member_unique"
  ON public."GymWorkoutSession" ("tenantId","memberId")
  WHERE "status"='in_progress';

CREATE INDEX IF NOT EXISTS "GymWorkoutSession_tenant_member_started_idx"
  ON public."GymWorkoutSession" ("tenantId","memberId","startedAt" DESC);

CREATE TABLE IF NOT EXISTS public."GymWorkoutSet" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "sessionId" text NOT NULL REFERENCES public."GymWorkoutSession"("id") ON DELETE CASCADE,
  "routineExerciseId" text NOT NULL REFERENCES public."GymRoutineExercise"("id") ON DELETE RESTRICT,
  "setNumber" integer NOT NULL CHECK ("setNumber" >= 1 AND "setNumber" <= 100),
  "status" text NOT NULL,
  "loadKg" numeric(10,3),
  "reps" integer,
  "rir" numeric(4,1),
  "rpe" numeric(4,1),
  "restSeconds" integer NOT NULL DEFAULT 0,
  "notes" text,
  "recordedAt" timestamptz NOT NULL DEFAULT now(),
  "createdBy" text,
  CONSTRAINT "GymWorkoutSet_status_check" CHECK ("status" IN ('completed','skipped')),
  CONSTRAINT "GymWorkoutSet_load_check" CHECK ("loadKg" IS NULL OR "loadKg" >= 0),
  CONSTRAINT "GymWorkoutSet_reps_check" CHECK ("reps" IS NULL OR "reps" >= 0),
  CONSTRAINT "GymWorkoutSet_rir_check" CHECK ("rir" IS NULL OR ("rir" >= 0 AND "rir" <= 10)),
  CONSTRAINT "GymWorkoutSet_rpe_check" CHECK ("rpe" IS NULL OR ("rpe" >= 1 AND "rpe" <= 10)),
  CONSTRAINT "GymWorkoutSet_rest_check" CHECK ("restSeconds" >= 0 AND "restSeconds" <= 3600)
);

CREATE UNIQUE INDEX IF NOT EXISTS "GymWorkoutSet_session_exercise_set_unique"
  ON public."GymWorkoutSet" ("sessionId","routineExerciseId","setNumber");

CREATE INDEX IF NOT EXISTS "GymWorkoutSet_tenant_session_recorded_idx"
  ON public."GymWorkoutSet" ("tenantId","sessionId","recordedAt");
