-- ContaGest issue #635 · backend-only browser grant hardening.
-- Policy sidecar: no structural tables, no data mutation, no shared-product enumeration.
-- SOURCE_REUSE=NONE

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT c.relname
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relkind IN ('r','p')
      AND c.relname ~ '^[A-Z]'
      AND EXISTS (
        SELECT 1
        FROM pg_attribute AS a
        WHERE a.attrelid=c.oid
          AND a.attname='tenantId'
          AND a.attnum>0
          AND NOT a.attisdropped
      )
    ORDER BY c.relname
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon',rec.relname);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated',rec.relname);
  END LOOP;
END
$$;
