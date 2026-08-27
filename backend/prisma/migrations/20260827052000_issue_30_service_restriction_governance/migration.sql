-- Issue #30 — governed suspension/reactivation/termination cases.
-- Additive migration: preserves every existing subscription and audit record.

CREATE TABLE IF NOT EXISTS public."ServiceRestrictionCase" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "subscriptionId" text NOT NULL REFERENCES public."Subscription"("id") ON DELETE RESTRICT,
  "action" text NOT NULL,
  "targetStatus" text NOT NULL,
  "reasonCode" text NOT NULL,
  "scope" text NOT NULL,
  "evidenceRef" text NOT NULL,
  "actorId" text REFERENCES public."UserProfile"("id") ON DELETE SET NULL,
  "reviewedById" text REFERENCES public."UserProfile"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'open',
  "openedAt" timestamptz NOT NULL DEFAULT now(),
  "effectiveAt" timestamptz,
  "noticeAt" timestamptz,
  "cureDeadline" timestamptz,
  "appealDeadline" timestamptz,
  "reviewedAt" timestamptz,
  "resolvedAt" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "ServiceRestrictionCase_action_check" CHECK ("action" IN ('suspend','terminate')),
  CONSTRAINT "ServiceRestrictionCase_target_status_check" CHECK ("targetStatus" IN ('suspended','cancelled','expired')),
  CONSTRAINT "ServiceRestrictionCase_status_check" CHECK ("status" IN ('open','pending_review','resolved','void')),
  CONSTRAINT "ServiceRestrictionCase_scope_check" CHECK ("scope" IN ('session','device','user','tenant','subscription','customer_account')),
  CONSTRAINT "ServiceRestrictionCase_reason_code_check" CHECK ("reasonCode" IN (
    'SEC_SESSION_COMPROMISED','SEC_DEVICE_COMPROMISED','SEC_TENANT_ESCAPE_ATTEMPT','SEC_MALWARE','SEC_ATTACK_ACTIVE',
    'FRAUD_IDENTITY','FRAUD_PAYMENT','BILLING_PAST_DUE','CONTRACT_LIMIT_BYPASS','CONTRACT_AUP','LEGAL_ORDER',
    'CUSTOMER_CANCEL','PROVIDER_CONVENIENCE','DATA_RETENTION_HOLD'
  )),
  CONSTRAINT "ServiceRestrictionCase_evidence_required" CHECK (length(btrim("evidenceRef")) >= 3),
  CONSTRAINT "ServiceRestrictionCase_review_separation" CHECK ("reviewedById" IS NULL OR "actorId" IS NULL OR "reviewedById" <> "actorId")
);

CREATE INDEX IF NOT EXISTS "ServiceRestrictionCase_subscription_status_idx"
  ON public."ServiceRestrictionCase" ("subscriptionId", "status", "openedAt" DESC);
CREATE INDEX IF NOT EXISTS "ServiceRestrictionCase_reason_idx"
  ON public."ServiceRestrictionCase" ("reasonCode", "openedAt" DESC);
CREATE INDEX IF NOT EXISTS "ServiceRestrictionCase_review_idx"
  ON public."ServiceRestrictionCase" ("status", "action", "openedAt" DESC)
  WHERE "status" = 'pending_review';

ALTER TABLE public."ServiceRestrictionCase" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."ServiceRestrictionCase" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."ServiceRestrictionCase" TO service_role;
DROP POLICY IF EXISTS "ServiceRestrictionCase_service_role_all" ON public."ServiceRestrictionCase";
CREATE POLICY "ServiceRestrictionCase_service_role_all"
  ON public."ServiceRestrictionCase" FOR ALL TO service_role USING (true) WITH CHECK (true);
