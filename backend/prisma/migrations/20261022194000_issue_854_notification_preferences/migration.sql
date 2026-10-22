-- #854 tenant-bound authenticated in-app opt-in. External providers stay disabled.
CREATE UNIQUE INDEX "UserProfile_tenantId_id_key" ON public."UserProfile"("tenantId","id");
CREATE TABLE public."NotificationChannelPreference" (
  "id" TEXT PRIMARY KEY DEFAULT(gen_random_uuid()::text),
  "tenantId" TEXT NOT NULL REFERENCES public."Tenant"("id") ON DELETE RESTRICT,
  "userId" TEXT NOT NULL,
  "channel" TEXT NOT NULL CHECK ("channel"='in_app'),
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "consent" TEXT NOT NULL DEFAULT 'unknown' CHECK ("consent" IN ('unknown','granted','denied')),
  "verifiedAt" TIMESTAMPTZ,
  "verifiedSource" TEXT,
  "timeZone" TEXT,
  "quietStart" TEXT,
  "quietEnd" TEXT,
  "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationChannelPreference_tenantId_userId_channel_key" UNIQUE ("tenantId","userId","channel"),
  CONSTRAINT "NotificationChannelPreference_tenantId_userId_fkey"
    FOREIGN KEY ("tenantId","userId") REFERENCES public."UserProfile"("tenantId","id") ON DELETE RESTRICT,
  CONSTRAINT notification_pref_consent CHECK (
    ("enabled"=false OR ("consent"='granted' AND "verifiedAt" IS NOT NULL
    AND "verifiedSource"='authenticated-self-service'))
  ),
  CONSTRAINT notification_pref_quiet_hours CHECK (
    ("timeZone" IS NULL AND "quietStart" IS NULL AND "quietEnd" IS NULL)
    OR ("timeZone" IS NOT NULL AND char_length("timeZone") BETWEEN 1 AND 120
      AND "quietStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "quietEnd" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "quietStart" <> "quietEnd")
  )
);
CREATE INDEX "NotificationChannelPreference_tenantId_channel_consent_idx"
 ON public."NotificationChannelPreference"("tenantId","channel","consent");
ALTER TABLE public."NotificationChannelPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."NotificationChannelPreference" FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public."NotificationChannelPreference" FROM PUBLIC;
DO $$
DECLARE role_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='contagest_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON public."NotificationChannelPreference" TO contagest_runtime;
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','contagest_backup','contagest_monitor'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON public."NotificationChannelPreference" FROM %I',role_name);
    END IF;
  END LOOP;
END $$;
