-- #748: preserve existing vaccination history, add replay identity only for
-- new opted-in clients. No stock effects and no destructive data rewrite.
ALTER TABLE public."CareImmunization"
  ADD COLUMN IF NOT EXISTS "requestKey" text,
  ADD COLUMN IF NOT EXISTS "requestFingerprint" text;

ALTER TABLE public."CareImmunization"
  ADD CONSTRAINT "CareImmunization_request_identity_pair_check"
  CHECK (
    ("requestKey" IS NULL AND "requestFingerprint" IS NULL)
    OR
    ("requestKey" IS NOT NULL AND "requestFingerprint" IS NOT NULL AND "requestFingerprint" ~ '^[a-f0-9]{64}$')
  );

CREATE UNIQUE INDEX IF NOT EXISTS "CareImmunization_tenant_request_key_unique"
  ON public."CareImmunization" ("tenantId","requestKey")
  WHERE "requestKey" IS NOT NULL;
