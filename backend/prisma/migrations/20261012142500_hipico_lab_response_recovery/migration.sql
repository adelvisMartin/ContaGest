-- #899: ephemeral LAB-only replay of an already persisted HipicoResponseReceipt.
-- No SOURCE transport capability, no financial operation and no independent response authority.
ALTER TABLE public."HipicoResponseReceipt"
  ADD COLUMN IF NOT EXISTS "labReplayScopeHash" TEXT,
  ADD COLUMN IF NOT EXISTS "labReplayText" TEXT,
  ADD COLUMN IF NOT EXISTS "labReplayKind" TEXT,
  ADD COLUMN IF NOT EXISTS "labReplayPolicy" TEXT,
  ADD COLUMN IF NOT EXISTS "labReplayReadDigest" TEXT,
  ADD COLUMN IF NOT EXISTS "labReplayExpiresAt" TIMESTAMP(3);

ALTER TABLE public."HipicoResponseReceipt"
  ADD CONSTRAINT "HipicoResponseReceipt_labReplayBounded"
  CHECK (
    "labReplayText" IS NULL OR
    (
      "confirmationVerified" = false AND
      "labReplayKind" IN ('race_query', 'static_safe') AND
      length("labReplayText") BETWEEN 1 AND 3000 AND
      "labReplayScopeHash" ~ '^[0-9a-f]{64}$' AND
      "labReplayPolicy" IS NOT NULL AND
      "labReplayExpiresAt" IS NOT NULL AND
      ("labReplayKind" != 'race_query' OR "labReplayReadDigest" ~ '^[0-9a-f]{64}$')
    )
  ) NOT VALID;

ALTER TABLE public."HipicoResponseReceipt"
  VALIDATE CONSTRAINT "HipicoResponseReceipt_labReplayBounded";

CREATE INDEX IF NOT EXISTS "HipicoResponseReceipt_labReplayExpiry_idx"
  ON public."HipicoResponseReceipt"("labReplayExpiresAt")
  WHERE "labReplayText" IS NOT NULL;

COMMENT ON COLUMN public."HipicoResponseReceipt"."labReplayText"
  IS 'Short-lived, non-financial LAB-only response candidate; revalidate policies and canonical data before reuse.';
