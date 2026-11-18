-- #746 additive Gym check-in replay authority. Existing events remain readable:
-- null keys preserve legacy events without backfilling fictitious identities.
ALTER TABLE public."GymCheckIn"
  ADD COLUMN "requestKey" text,
  ADD COLUMN "requestFingerprint" text;
ALTER TABLE public."GymCheckIn"
  ADD CONSTRAINT "GymCheckIn_request_identity_check"
  CHECK (
    ("requestKey" IS NULL AND "requestFingerprint" IS NULL)
    OR (
      "requestKey" ~ '^[A-Za-z0-9:_-]{12,128}$'
      AND "requestFingerprint" ~ '^[0-9a-f]{64}$'
    )
  );
CREATE UNIQUE INDEX "GymCheckIn_tenant_requestKey_unique"
  ON public."GymCheckIn" ("tenantId","requestKey")
  WHERE "requestKey" IS NOT NULL;
