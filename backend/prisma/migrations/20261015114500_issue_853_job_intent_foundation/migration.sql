-- #853 · additive, tenant-isolated transactional job intents. No worker is enabled by this migration.
-- Runtime RLS policies are installed by the canonical #845 sidecar AFTER Prisma deploy.
-- Keep this table FORCE RLS with no permissive policy until sidecar provisioning;
-- never reference private.contagest_runtime_tenant_id() before that function exists.
CREATE TABLE public."AsyncJobIntent" (
  "id" TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  "tenantId" TEXT NOT NULL REFERENCES public."Tenant"("id") ON DELETE RESTRICT,
  "handlerKey" VARCHAR(100) NOT NULL,
  "effectKey" VARCHAR(160) NOT NULL,
  "requestHash" CHAR(64) NOT NULL CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued' CHECK ("status" IN ('queued', 'running', 'retry', 'completed', 'dead')),
  "runAt" TIMESTAMPTZ NOT NULL,
  "attempts" INT NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "maxAttempts" INT NOT NULL DEFAULT 5 CHECK ("maxAttempts" BETWEEN 1 AND 20),
  "leaseOwner" VARCHAR(160),
  "leaseUntil" TIMESTAMPTZ,
  "lastErrorCode" VARCHAR(100),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT async_job_intent_effect UNIQUE ("tenantId", "effectKey"),
  CONSTRAINT async_job_intent_lease CHECK (
    ("status" = 'running' AND "leaseOwner" IS NOT NULL AND "leaseUntil" IS NOT NULL)
    OR ("status" <> 'running' AND "leaseOwner" IS NULL AND "leaseUntil" IS NULL)
  )
);
CREATE INDEX async_job_intent_due_idx ON public."AsyncJobIntent" ("tenantId", "runAt", "createdAt")
  WHERE "status" IN ('queued', 'retry');
CREATE INDEX async_job_intent_lease_idx ON public."AsyncJobIntent" ("tenantId", "leaseUntil")
  WHERE "status" = 'running';

ALTER TABLE public."AsyncJobIntent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AsyncJobIntent" FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."AsyncJobIntent" FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','contagest_backup','contagest_monitor'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE public."AsyncJobIntent" FROM %I', role_name);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'contagest_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON public."AsyncJobIntent" TO contagest_runtime;
    -- No policy here: the v845 sidecar creates contagest_runtime_tenant_scope
    -- for all PascalCase tenantId tables only after defining the guard function.
  END IF;
END $$;
