-- Add local backend auth password hash support
ALTER TABLE "UserProfile"
  ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

CREATE INDEX IF NOT EXISTS "UserProfile_tenantId_status_idx"
  ON "UserProfile"("tenantId", "status");
