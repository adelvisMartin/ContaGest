-- #684 BudgetWallet owner FK supporting indexes.
-- Forward-only: add an owner_id-leading index only when no equivalent valid,
-- ready, non-partial index already exists. BudgetWallet is a shared SQL-first
-- surface in the production database, so absence of either table in a clean
-- ContaGest-only replay is intentionally a no-op rather than a bootstrap owner.

DO $migration$
BEGIN
  IF to_regclass('public.budgetwallet_purchase_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_index AS i
       CROSS JOIN LATERAL unnest(i.indkey::smallint[]) WITH ORDINALITY AS key(attnum, ord)
       JOIN pg_catalog.pg_attribute AS a
         ON a.attrelid = i.indrelid
        AND a.attnum = key.attnum
       WHERE i.indrelid = 'public.budgetwallet_purchase_events'::regclass
         AND key.ord = 1
         AND a.attname = 'owner_id'
         AND i.indisvalid
         AND i.indisready
         AND i.indpred IS NULL
     ) THEN
    CREATE INDEX budgetwallet_purchase_events_owner_id_idx
      ON public.budgetwallet_purchase_events (owner_id);
  END IF;

  IF to_regclass('public.budgetwallet_security_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_index AS i
       CROSS JOIN LATERAL unnest(i.indkey::smallint[]) WITH ORDINALITY AS key(attnum, ord)
       JOIN pg_catalog.pg_attribute AS a
         ON a.attrelid = i.indrelid
        AND a.attnum = key.attnum
       WHERE i.indrelid = 'public.budgetwallet_security_events'::regclass
         AND key.ord = 1
         AND a.attname = 'owner_id'
         AND i.indisvalid
         AND i.indisready
         AND i.indpred IS NULL
     ) THEN
    CREATE INDEX budgetwallet_security_events_owner_id_idx
      ON public.budgetwallet_security_events (owner_id);
  END IF;
END
$migration$;
