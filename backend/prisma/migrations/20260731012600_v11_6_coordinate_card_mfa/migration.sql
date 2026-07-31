-- ContaGest v11.6: coordinate-card second factor with one-time challenges.
CREATE TABLE IF NOT EXISTS public."CoordinateCard" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."UserProfile"("id") ON DELETE CASCADE,
  "version" integer NOT NULL DEFAULT 1,
  "rows" integer NOT NULL DEFAULT 5,
  "columns" integer NOT NULL DEFAULT 8,
  "cellHashes" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "lastUsedAt" timestamptz,
  "revokedAt" timestamptz,
  CONSTRAINT "CoordinateCard_status_check" CHECK ("status" IN ('active','revoked','replaced')),
  CONSTRAINT "CoordinateCard_dimensions_check" CHECK ("rows" BETWEEN 3 AND 10 AND "columns" BETWEEN 3 AND 12)
);
CREATE UNIQUE INDEX IF NOT EXISTS "CoordinateCard_active_user_unique" ON public."CoordinateCard" ("tenantId","userId") WHERE "status"='active';
CREATE INDEX IF NOT EXISTS "CoordinateCard_tenant_status_idx" ON public."CoordinateCard" ("tenantId","status");
CREATE TABLE IF NOT EXISTS public."CoordinateChallenge" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL REFERENCES public."Tenant"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES public."UserProfile"("id") ON DELETE CASCADE,
  "cardId" text NOT NULL REFERENCES public."CoordinateCard"("id") ON DELETE CASCADE,
  "coordinates" jsonb NOT NULL,
  "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "fingerprintHash" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "maxAttempts" integer NOT NULL DEFAULT 3,
  "usedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CoordinateChallenge_attempts_check" CHECK ("attempts" >= 0 AND "maxAttempts" BETWEEN 1 AND 10)
);
CREATE INDEX IF NOT EXISTS "CoordinateChallenge_user_expiry_idx" ON public."CoordinateChallenge" ("tenantId","userId","expiresAt" DESC);
CREATE INDEX IF NOT EXISTS "CoordinateChallenge_open_idx" ON public."CoordinateChallenge" ("expiresAt") WHERE "usedAt" IS NULL;
ALTER TABLE public."CoordinateCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CoordinateChallenge" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CoordinateCard_service_role_all" ON public."CoordinateCard";
CREATE POLICY "CoordinateCard_service_role_all" ON public."CoordinateCard" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "CoordinateCard_tenant_authenticated_all" ON public."CoordinateCard";
CREATE POLICY "CoordinateCard_tenant_authenticated_all" ON public."CoordinateCard" FOR ALL TO authenticated USING ("tenantId"=private.current_tenant_id()) WITH CHECK ("tenantId"=private.current_tenant_id());
DROP POLICY IF EXISTS "CoordinateChallenge_service_role_all" ON public."CoordinateChallenge";
CREATE POLICY "CoordinateChallenge_service_role_all" ON public."CoordinateChallenge" FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "CoordinateChallenge_tenant_authenticated_all" ON public."CoordinateChallenge";
CREATE POLICY "CoordinateChallenge_tenant_authenticated_all" ON public."CoordinateChallenge" FOR ALL TO authenticated USING ("tenantId"=private.current_tenant_id()) WITH CHECK ("tenantId"=private.current_tenant_id());
REVOKE ALL ON public."CoordinateCard", public."CoordinateChallenge" FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."CoordinateCard", public."CoordinateChallenge" TO authenticated,service_role;
