-- #837: The canonical LAB event feed orders by database recording time.
-- The original v14 index is on caller-supplied event_timestamp, which cannot
-- accelerate ORDER BY created_at DESC, id DESC for one aggregate.
--
-- Additive index only: no updates, deletions or rewrites of historical evidence.
-- CONCURRENTLY allows new writes while indexing existing records. PostgreSQL
-- prohibits running it inside a transaction block: Prisma ORM 6 migration
-- files must not enclose this statement in BEGIN/COMMIT.
-- Production deployment remains gated on isolated PG17 from-zero and upgrade QA.
CREATE INDEX CONCURRENTLY IF NOT EXISTS hipico_domain_events_recorded_order_v837
  ON public.hipico_domain_events
  (owner_id, group_key, aggregate_kind, aggregate_key, created_at DESC, id DESC);
