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

-- IF NOT EXISTS can silently skip an invalid index from an interrupted
-- concurrent build. Never certify a migration with an unusable or wrong index.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indexrelid = to_regclass('public.hipico_domain_events_recorded_order_v837')
      AND i.indrelid = 'public.hipico_domain_events'::regclass
      AND i.indisvalid AND i.indisready
      AND strpos(pg_get_indexdef(i.indexrelid),
        '(owner_id, group_key, aggregate_kind, aggregate_key, created_at DESC, id DESC)') > 0
  ) THEN
    RAISE EXCEPTION 'HIPICO_DOMAIN_RECORDED_ORDER_INDEX_NOT_READY';
  END IF;
END $$;
