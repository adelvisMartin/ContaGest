-- #762 · Canonical tenant-scoped document numbering authority.
-- Forward-only. Existing invoice numbers remain unchanged; allocation begins only
-- when callers omit a document number.

CREATE TABLE public."DocumentSequence" (
  "tenantId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL DEFAULT '',
  "prefix" TEXT NOT NULL DEFAULT '',
  "suffix" TEXT NOT NULL DEFAULT '',
  "padding" INTEGER NOT NULL DEFAULT 6,
  "currentValue" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("tenantId", "key", "periodKey"),
  CONSTRAINT "DocumentSequence_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DocumentSequence_key_check"
    CHECK (char_length("key") BETWEEN 1 AND 80 AND "key" ~ '^[a-z0-9][a-z0-9._:-]*$'),
  CONSTRAINT "DocumentSequence_periodKey_check"
    CHECK (char_length("periodKey") <= 40 AND ("periodKey" = '' OR "periodKey" ~ '^[a-z0-9][a-z0-9._:-]*$')),
  CONSTRAINT "DocumentSequence_prefix_check"
    CHECK (char_length("prefix") <= 64),
  CONSTRAINT "DocumentSequence_suffix_check"
    CHECK (char_length("suffix") <= 64),
  CONSTRAINT "DocumentSequence_padding_check"
    CHECK ("padding" BETWEEN 1 AND 18),
  CONSTRAINT "DocumentSequence_currentValue_check"
    CHECK ("currentValue" >= 0 AND "currentValue" <= repeat('9', "padding")::bigint)
);

CREATE INDEX "DocumentSequence_tenantId_key_idx"
  ON public."DocumentSequence" ("tenantId", "key");

-- public is exposed by Supabase by default. Keep this server-authoritative table
-- behind the existing backend/service_role boundary.
ALTER TABLE public."DocumentSequence" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."DocumentSequence" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."DocumentSequence" TO service_role;

CREATE POLICY "DocumentSequence_service_role_all"
  ON public."DocumentSequence"
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);