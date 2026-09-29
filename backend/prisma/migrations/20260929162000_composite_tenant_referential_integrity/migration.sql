-- #634 Composite Tenant Referential Integrity
-- Forward-only integrity guards. Existing FK constraints remain lifecycle owners.
-- No data rewrite/backfill is performed: VALIDATE CONSTRAINT aborts on ambiguous cross-tenant history.
-- Count + exact relation-set digest fail closed before any DDL when the canonical catalog drifts.

BEGIN;

DO $$
DECLARE
  r record;
  candidate_count integer;
  relation_set_md5 text;
  parent_unique_name text;
  child_index_name text;
  guard_name text;
BEGIN
  WITH app_tables AS (
    SELECT c.oid, c.relname,
           (SELECT a.attname::text
              FROM pg_attribute a
             WHERE a.attrelid=c.oid
               AND a.attname IN ('tenantId','tenant_id')
               AND a.attnum>0
               AND NOT a.attisdropped
             ORDER BY CASE a.attname WHEN 'tenantId' THEN 0 ELSE 1 END
             LIMIT 1) AS tenant_col
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r'
  ), candidates AS (
    SELECT child.relname AS child_table,
           child_col.attname::text AS child_column,
           parent.relname AS parent_table,
           parent_col.attname::text AS parent_column
      FROM pg_constraint con
      JOIN app_tables child ON child.oid=con.conrelid
      JOIN app_tables parent ON parent.oid=con.confrelid
      JOIN pg_attribute child_col ON child_col.attrelid=con.conrelid AND child_col.attnum=con.conkey[1]
      JOIN pg_attribute parent_col ON parent_col.attrelid=con.confrelid AND parent_col.attnum=con.confkey[1]
     WHERE con.contype='f'
       AND child.tenant_col IS NOT NULL
       AND parent.tenant_col IS NOT NULL
       AND cardinality(con.conkey)=1
       AND cardinality(con.confkey)=1
  )
  SELECT count(*),
         md5(string_agg(child_table || '.' || child_column || '->' || parent_table || '.' || parent_column, E'\n'
                        ORDER BY child_table, child_column, parent_table, parent_column))
    INTO candidate_count, relation_set_md5
    FROM candidates;

  IF candidate_count <> 72 OR relation_set_md5 <> '54bfdcbf73818d4892484bafc0f25e2c' THEN
    RAISE EXCEPTION 'TENANT_RELATION_CATALOG_DRIFT expected_count=72 actual_count=% expected_md5=54bfdcbf73818d4892484bafc0f25e2c actual_md5=%',
      candidate_count, relation_set_md5;
  END IF;

  FOR r IN
    WITH app_tables AS (
      SELECT c.oid, c.relname,
             (SELECT a.attname::text
                FROM pg_attribute a
               WHERE a.attrelid=c.oid
                 AND a.attname IN ('tenantId','tenant_id')
                 AND a.attnum>0
                 AND NOT a.attisdropped
               ORDER BY CASE a.attname WHEN 'tenantId' THEN 0 ELSE 1 END
               LIMIT 1) AS tenant_col
        FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind='r'
    )
    SELECT child.relname AS child_table,
           child.tenant_col AS child_tenant_column,
           child_col.attname::text AS child_column,
           parent.relname AS parent_table,
           parent.tenant_col AS parent_tenant_column,
           parent_col.attname::text AS parent_column
      FROM pg_constraint con
      JOIN app_tables child ON child.oid=con.conrelid
      JOIN app_tables parent ON parent.oid=con.confrelid
      JOIN pg_attribute child_col ON child_col.attrelid=con.conrelid AND child_col.attnum=con.conkey[1]
      JOIN pg_attribute parent_col ON parent_col.attrelid=con.confrelid AND parent_col.attnum=con.confkey[1]
     WHERE con.contype='f'
       AND child.tenant_col IS NOT NULL
       AND parent.tenant_col IS NOT NULL
       AND cardinality(con.conkey)=1
       AND cardinality(con.confkey)=1
     ORDER BY child.relname, child_col.attname, parent.relname, parent_col.attname
  LOOP
    parent_unique_name := r.parent_table || '_' || r.parent_tenant_column || '_' || r.parent_column || '_tg_uk';
    child_index_name := r.child_table || '_' || r.child_tenant_column || '_' || r.child_column || '_tg_idx';
    guard_name := r.child_table || '_' || r.child_tenant_column || '_' || r.child_column || '_tg_fk';

    IF length(parent_unique_name) > 63 OR length(child_index_name) > 63 OR length(guard_name) > 63 THEN
      RAISE EXCEPTION 'TENANT_RELATION_IDENTIFIER_TOO_LONG child=%.% parent=%.%', r.child_table, r.child_column, r.parent_table, r.parent_column;
    END IF;

    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (%I, %I)',
      parent_unique_name, r.parent_table, r.parent_tenant_column, r.parent_column
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I (%I, %I)',
      child_index_name, r.child_table, r.child_tenant_column, r.child_column
    );

    IF NOT EXISTS (
      SELECT 1
        FROM pg_constraint existing
       WHERE existing.conrelid = to_regclass(format('public.%I', r.child_table))
         AND existing.conname = guard_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I, %I) REFERENCES %I (%I, %I) ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID',
        r.child_table, guard_name,
        r.child_tenant_column, r.child_column,
        r.parent_table, r.parent_tenant_column, r.parent_column
      );
    END IF;

    EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', r.child_table, guard_name);
  END LOOP;
END $$;

COMMIT;
