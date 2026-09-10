CREATE TABLE IF NOT EXISTS "ApprovalPolicy" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "capability" varchar(96) NOT NULL,
  "version" integer NOT NULL CHECK ("version" > 0),
  "enabled" boolean NOT NULL DEFAULT true,
  "thresholdAmount" numeric(18,2),
  "currency" varchar(4),
  "requiredApprovals" integer NOT NULL DEFAULT 1 CHECK ("requiredApprovals" > 0 AND "requiredApprovals" <= 5),
  "selfApprovalAllowed" boolean NOT NULL DEFAULT false,
  "approverPermissions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "approverRoles" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "expiresMinutes" integer NOT NULL DEFAULT 1440 CHECK ("expiresMinutes" BETWEEN 5 AND 43200),
  "createdBy" text REFERENCES "UserProfile"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "capability", "version")
);

CREATE TABLE IF NOT EXISTS "ApprovalRequest" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "capability" varchar(96) NOT NULL,
  "requesterId" text NOT NULL REFERENCES "UserProfile"("id") ON DELETE RESTRICT,
  "policyId" text NOT NULL REFERENCES "ApprovalPolicy"("id") ON DELETE RESTRICT,
  "policyVersion" integer NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','approved','rejected','cancelled','expired','executing','executed')),
  "revision" integer NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "payload" jsonb NOT NULL,
  "payloadHash" char(64) NOT NULL,
  "amount" numeric(18,2),
  "currency" varchar(4),
  "requiredApprovals" integer NOT NULL CHECK ("requiredApprovals" > 0 AND "requiredApprovals" <= 5),
  "approvedCount" integer NOT NULL DEFAULT 0 CHECK ("approvedCount" >= 0),
  "reasonCode" varchar(64),
  "comment" varchar(1000),
  "expiresAt" timestamptz NOT NULL,
  "executedAt" timestamptz,
  "executionResourceType" varchar(96),
  "executionResourceId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ApprovalDecision" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "requestId" text NOT NULL REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE,
  "approverId" text NOT NULL REFERENCES "UserProfile"("id") ON DELETE RESTRICT,
  "decision" varchar(20) NOT NULL CHECK ("decision" IN ('approved','rejected','break_glass')),
  "reasonCode" varchar(64),
  "comment" varchar(1000),
  "payloadHash" char(64) NOT NULL,
  "revision" integer NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("requestId", "approverId", "revision")
);

CREATE TABLE IF NOT EXISTS "ApprovalDelegation" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "delegatorId" text NOT NULL REFERENCES "UserProfile"("id") ON DELETE CASCADE,
  "delegateId" text NOT NULL REFERENCES "UserProfile"("id") ON DELETE CASCADE,
  "capability" varchar(96) NOT NULL DEFAULT '*',
  "startsAt" timestamptz NOT NULL,
  "endsAt" timestamptz NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "reason" varchar(500) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("delegatorId" <> "delegateId"),
  CHECK ("endsAt" > "startsAt")
);

CREATE INDEX IF NOT EXISTS "ApprovalPolicy_tenant_capability_idx" ON "ApprovalPolicy" ("tenantId", "capability", "enabled", "version" DESC);
CREATE INDEX IF NOT EXISTS "ApprovalRequest_tenant_status_idx" ON "ApprovalRequest" ("tenantId", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ApprovalRequest_tenant_capability_idx" ON "ApprovalRequest" ("tenantId", "capability", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ApprovalDecision_tenant_request_idx" ON "ApprovalDecision" ("tenantId", "requestId", "createdAt");
CREATE INDEX IF NOT EXISTS "ApprovalDelegation_delegate_idx" ON "ApprovalDelegation" ("tenantId", "delegateId", "active", "startsAt", "endsAt");

ALTER TABLE "ApprovalPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalPolicy" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalRequest" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalDecision" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalDelegation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalDelegation" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_approval_policy" ON "ApprovalPolicy";
CREATE POLICY "tenant_isolation_approval_policy" ON "ApprovalPolicy" USING ("tenantId" = private.current_tenant_id()) WITH CHECK ("tenantId" = private.current_tenant_id());
DROP POLICY IF EXISTS "tenant_isolation_approval_request" ON "ApprovalRequest";
CREATE POLICY "tenant_isolation_approval_request" ON "ApprovalRequest" USING ("tenantId" = private.current_tenant_id()) WITH CHECK ("tenantId" = private.current_tenant_id());
DROP POLICY IF EXISTS "tenant_isolation_approval_decision" ON "ApprovalDecision";
CREATE POLICY "tenant_isolation_approval_decision" ON "ApprovalDecision" USING ("tenantId" = private.current_tenant_id()) WITH CHECK ("tenantId" = private.current_tenant_id());
DROP POLICY IF EXISTS "tenant_isolation_approval_delegation" ON "ApprovalDelegation";
CREATE POLICY "tenant_isolation_approval_delegation" ON "ApprovalDelegation" USING ("tenantId" = private.current_tenant_id()) WITH CHECK ("tenantId" = private.current_tenant_id());

COMMENT ON TABLE "ApprovalPolicy" IS 'Versioned server-side maker-checker policy matrix. Existing versions are never rewritten.';
COMMENT ON COLUMN "ApprovalRequest"."payloadHash" IS 'SHA-256 of canonical payload. Execution is rejected when the payload differs from the approved revision.';
COMMENT ON COLUMN "ApprovalRequest"."status" IS 'executing is an internal transient lock state; user-visible terminal/workflow states remain pending/approved/rejected/cancelled/expired/executed.';