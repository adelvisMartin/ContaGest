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
  CONSTRAINT "ServiceRestrictionCase_action_target_check" CHECK (
    ("action"='suspend' AND "targetStatus"='suspended') OR
    ("action"='terminate' AND "targetStatus" IN ('cancelled','expired'))
  ),
  CONSTRAINT "ServiceRestrictionCase_status_check" CHECK ("status" IN ('open','pending_review','resolved','void')),
  CONSTRAINT "ServiceRestrictionCase_action_status_check" CHECK (
    ("action"='suspend' AND "status" IN ('open','resolved','void')) OR
    ("action"='terminate' AND "status" IN ('pending_review','resolved','void'))
  ),
  CONSTRAINT "ServiceRestrictionCase_scope_check" CHECK ("scope" IN ('session','device','user','tenant','subscription','customer_account')),
  CONSTRAINT "ServiceRestrictionCase_reason_code_check" CHECK ("reasonCode" IN (
    'SEC_SESSION_COMPROMISED','SEC_DEVICE_COMPROMISED','SEC_TENANT_ESCAPE_ATTEMPT','SEC_MALWARE','SEC_ATTACK_ACTIVE',
    'FRAUD_IDENTITY','FRAUD_PAYMENT','BILLING_PAST_DUE','CONTRACT_LIMIT_BYPASS','CONTRACT_AUP','LEGAL_ORDER',
    'CUSTOMER_CANCEL','PROVIDER_CONVENIENCE','DATA_RETENTION_HOLD'
  )),
  CONSTRAINT "ServiceRestrictionCase_evidence_required" CHECK (length(btrim("evidenceRef")) >= 3),
  CONSTRAINT "ServiceRestrictionCase_review_separation" CHECK ("reviewedById" IS NULL OR "actorId" IS NULL OR "reviewedById" <> "actorId"),
  CONSTRAINT "ServiceRestrictionCase_resolution_timestamp" CHECK ("status" <> 'resolved' OR "resolvedAt" IS NOT NULL),
  CONSTRAINT "ServiceRestrictionCase_termination_reviewer" CHECK ("action" <> 'terminate' OR "status" <> 'resolved' OR "reviewedById" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "ServiceRestrictionCase_subscription_status_idx"
  ON public."ServiceRestrictionCase" ("subscriptionId", "status", "openedAt" DESC);
CREATE INDEX IF NOT EXISTS "ServiceRestrictionCase_reason_idx"
  ON public."ServiceRestrictionCase" ("reasonCode", "openedAt" DESC);
CREATE INDEX IF NOT EXISTS "ServiceRestrictionCase_review_idx"
  ON public."ServiceRestrictionCase" ("status", "action", "openedAt" DESC)
  WHERE "status" = 'pending_review';
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceRestrictionCase_one_active_per_subscription"
  ON public."ServiceRestrictionCase" ("subscriptionId")
  WHERE "status" IN ('open','pending_review');

CREATE OR REPLACE FUNCTION private.enforce_service_restriction_case_open()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  subscription_status text;
  subscription_grace_until timestamptz;
BEGIN
  IF NEW."scope" <> 'subscription' THEN
    RAISE EXCEPTION 'service_restriction_case_scope_not_supported' USING ERRCODE = '23514';
  END IF;
  IF NEW."action"='suspend' AND NEW."reasonCode" NOT IN (
    'SEC_TENANT_ESCAPE_ATTEMPT','SEC_MALWARE','SEC_ATTACK_ACTIVE','FRAUD_IDENTITY','FRAUD_PAYMENT',
    'BILLING_PAST_DUE','CONTRACT_LIMIT_BYPASS','CONTRACT_AUP','LEGAL_ORDER'
  ) THEN
    RAISE EXCEPTION 'reason_code_not_allowed_for_subscription_suspension' USING ERRCODE = '23514';
  END IF;
  IF NEW."action"='terminate' AND NEW."reasonCode" NOT IN (
    'SEC_ATTACK_ACTIVE','FRAUD_IDENTITY','FRAUD_PAYMENT','BILLING_PAST_DUE','CONTRACT_LIMIT_BYPASS',
    'CONTRACT_AUP','LEGAL_ORDER','CUSTOMER_CANCEL','PROVIDER_CONVENIENCE'
  ) THEN
    RAISE EXCEPTION 'reason_code_not_allowed_for_subscription_termination' USING ERRCODE = '23514';
  END IF;

  IF NEW."reasonCode"='BILLING_PAST_DUE' THEN
    SELECT "status", "graceUntil" INTO subscription_status, subscription_grace_until
    FROM public."Subscription" WHERE "id"=NEW."subscriptionId";
    IF subscription_status IS DISTINCT FROM 'past_due' THEN
      RAISE EXCEPTION 'billing_restriction_requires_past_due_subscription' USING ERRCODE = '23514';
    END IF;
    IF subscription_grace_until IS NULL OR subscription_grace_until > now() THEN
      RAISE EXCEPTION 'billing_grace_period_not_elapsed' USING ERRCODE = '23514';
    END IF;
    IF NEW."noticeAt" IS NULL OR NEW."noticeAt" > now() THEN
      RAISE EXCEPTION 'billing_notice_not_elapsed' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."reasonCode" IN ('CONTRACT_LIMIT_BYPASS','CONTRACT_AUP') THEN
    IF NEW."noticeAt" IS NULL OR NEW."noticeAt" > now() THEN
      RAISE EXCEPTION 'contract_notice_not_elapsed' USING ERRCODE = '23514';
    END IF;
    IF NEW."cureDeadline" IS NULL OR NEW."cureDeadline" > now() THEN
      RAISE EXCEPTION 'contract_cure_deadline_not_elapsed' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."action"='terminate'
     AND NEW."reasonCode" NOT IN ('SEC_ATTACK_ACTIVE','FRAUD_IDENTITY','FRAUD_PAYMENT','LEGAL_ORDER','CUSTOMER_CANCEL')
     AND (NEW."noticeAt" IS NULL OR NEW."noticeAt" > now()) THEN
    RAISE EXCEPTION 'termination_notice_not_elapsed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.enforce_service_restriction_case_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.enforce_service_restriction_case_open() TO service_role;

CREATE OR REPLACE FUNCTION private.enforce_service_restriction_case_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF OLD."status" IN ('resolved','void') THEN
    RAISE EXCEPTION 'service_restriction_case_already_closed' USING ERRCODE = '23514';
  END IF;
  IF OLD."subscriptionId" IS DISTINCT FROM NEW."subscriptionId"
     OR OLD."action" IS DISTINCT FROM NEW."action"
     OR OLD."targetStatus" IS DISTINCT FROM NEW."targetStatus"
     OR OLD."reasonCode" IS DISTINCT FROM NEW."reasonCode"
     OR OLD."scope" IS DISTINCT FROM NEW."scope"
     OR OLD."actorId" IS DISTINCT FROM NEW."actorId"
     OR OLD."openedAt" IS DISTINCT FROM NEW."openedAt" THEN
    RAISE EXCEPTION 'service_restriction_case_identity_is_immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" = 'open' AND NEW."status" NOT IN ('open','resolved','void') THEN
    RAISE EXCEPTION 'invalid_service_restriction_case_transition' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" = 'pending_review' AND NEW."status" NOT IN ('pending_review','resolved','void') THEN
    RAISE EXCEPTION 'invalid_service_restriction_case_transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.enforce_service_restriction_case_transition() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.enforce_service_restriction_case_transition() TO service_role;

DROP TRIGGER IF EXISTS "ServiceRestrictionCase_open_guard" ON public."ServiceRestrictionCase";
CREATE TRIGGER "ServiceRestrictionCase_open_guard"
BEFORE INSERT ON public."ServiceRestrictionCase"
FOR EACH ROW EXECUTE FUNCTION private.enforce_service_restriction_case_open();

DROP TRIGGER IF EXISTS "ServiceRestrictionCase_transition_guard" ON public."ServiceRestrictionCase";
CREATE TRIGGER "ServiceRestrictionCase_transition_guard"
BEFORE UPDATE ON public."ServiceRestrictionCase"
FOR EACH ROW EXECUTE FUNCTION private.enforce_service_restriction_case_transition();

ALTER TABLE public."ServiceRestrictionCase" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."ServiceRestrictionCase" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."ServiceRestrictionCase" TO service_role;
DROP POLICY IF EXISTS "ServiceRestrictionCase_service_role_all" ON public."ServiceRestrictionCase";
CREATE POLICY "ServiceRestrictionCase_service_role_all"
  ON public."ServiceRestrictionCase" FOR ALL TO service_role USING (true) WITH CHECK (true);
