-- #797: additive durable workout set event identity on canonical GymWorkoutSet.
-- No synthetic backfill: legacy rows remain nullable, history intact.
ALTER TABLE public."GymWorkoutSet"
  ADD COLUMN "eventKey" text,
  ADD COLUMN "requestFingerprint" text;
ALTER TABLE public."GymWorkoutSet"
  ADD CONSTRAINT "GymWorkoutSet_replay_pair_check" CHECK (
    ("eventKey" IS NULL AND "requestFingerprint" IS NULL)
    OR ("eventKey" ~ '^[A-Za-z0-9._:-]{12,128}$'
      AND "requestFingerprint" ~ '^[0-9a-f]{64}$')
  );
CREATE UNIQUE INDEX "GymWorkoutSet_tenant_eventKey_unique"
  ON public."GymWorkoutSet" ("tenantId","eventKey")
  WHERE "eventKey" IS NOT NULL;
