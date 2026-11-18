-- #792 additive workflow states and immutable transition event log.
-- Keep legacy in_progress/completed sessions, no backfill of fictional events.
ALTER TABLE public."GymWorkoutSession"
  DROP CONSTRAINT "GymWorkoutSession_status_check";
ALTER TABLE public."GymWorkoutSession"
  ADD CONSTRAINT "GymWorkoutSession_status_check"
  CHECK ("status" IN ('in_progress','paused','completed','abandoned')),
  ADD COLUMN "abandonedAt" timestamptz;
DROP INDEX public."GymWorkoutSession_one_active_member_unique";
CREATE UNIQUE INDEX "GymWorkoutSession_one_active_member_unique"
  ON public."GymWorkoutSession" ("tenantId","memberId")
  WHERE "status" IN ('in_progress','paused');
CREATE UNIQUE INDEX "GymWorkoutSession_tenant_id_unique"
  ON public."GymWorkoutSession" ("tenantId","id");

CREATE TABLE public."GymWorkoutSessionTransition" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId" text NOT NULL,
  "sessionId" text NOT NULL,
  "eventKey" text NOT NULL CHECK ("eventKey" ~ '^[A-Za-z0-9:_-]{12,128}$'),
  "action" text NOT NULL CHECK ("action" IN ('pause','resume','abandon')),
  "fromStatus" text NOT NULL,
  "toStatus" text NOT NULL,
  "reason" text CHECK ("reason" IS NULL OR char_length("reason")<=500),
  "actorId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "GymWorkoutSessionTransition_session_tenant_fk"
    FOREIGN KEY ("tenantId","sessionId")
    REFERENCES public."GymWorkoutSession"("tenantId","id") ON DELETE CASCADE,
  CONSTRAINT "GymWorkoutSessionTransition_action_status_check" CHECK (
    ("action"='pause' AND "fromStatus"='in_progress' AND "toStatus"='paused')
    OR ("action"='resume' AND "fromStatus"='paused' AND "toStatus"='in_progress')
    OR ("action"='abandon' AND "fromStatus" IN ('in_progress','paused') AND "toStatus"='abandoned')
  )
);
CREATE UNIQUE INDEX "GymWorkoutSessionTransition_tenant_eventKey_unique"
  ON public."GymWorkoutSessionTransition" ("tenantId","eventKey");
CREATE INDEX "GymWorkoutSessionTransition_session_time_idx"
  ON public."GymWorkoutSessionTransition" ("tenantId","sessionId","createdAt","id");
ALTER TABLE public."GymWorkoutSessionTransition" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "GymWorkoutSessionTransition_service_role_all" ON public."GymWorkoutSessionTransition"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "GymWorkoutSessionTransition_tenant_authenticated_all" ON public."GymWorkoutSessionTransition"
  FOR ALL TO authenticated
  USING ("tenantId"=private.current_tenant_id())
  WITH CHECK ("tenantId"=private.current_tenant_id());
REVOKE ALL ON TABLE public."GymWorkoutSessionTransition" FROM anon;
GRANT SELECT, INSERT ON TABLE public."GymWorkoutSessionTransition" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."GymWorkoutSessionTransition" TO service_role;
