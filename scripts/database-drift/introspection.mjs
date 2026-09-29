export const INTROSPECTION_QUERIES = Object.freeze([
  {
    name: 'metadata',
    sql: `SELECT current_setting('server_version') AS server_version,
                 current_setting('server_version_num') AS server_version_num`,
  },
  {
    name: 'schemas',
    sql: `SELECT n.nspname AS schema_name,
                 pg_get_userbyid(n.nspowner) AS owner
          FROM pg_namespace n
          WHERE n.nspname <> 'information_schema'
            AND n.nspname NOT LIKE 'pg_toast_temp_%'
            AND n.nspname NOT LIKE 'pg_temp_%'
          ORDER BY n.nspname`,
  },
  {
    name: 'tables',
    sql: `SELECT n.nspname AS schema_name,
                 c.relname AS object_name,
                 c.relkind AS relkind,
                 c.relrowsecurity AS rls_enabled,
                 c.relforcerowsecurity AS rls_forced,
                 pg_get_userbyid(c.relowner) AS owner,
                 e.extname AS extension_name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_depend d ON d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
          LEFT JOIN pg_extension e ON e.oid = d.refobjid
          WHERE c.relkind IN ('r','p')
          ORDER BY n.nspname, c.relname`,
  },
  {
    name: 'columns',
    sql: `SELECT n.nspname AS schema_name,
                 c.relname AS table_name,
                 a.attname AS column_name,
                 pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                 NOT a.attnotnull AS nullable,
                 pg_get_expr(ad.adbin, ad.adrelid) AS default_expr,
                 a.attidentity AS identity_kind,
                 a.attgenerated AS generated_kind
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
          WHERE c.relkind IN ('r','p')
            AND a.attnum > 0
            AND NOT a.attisdropped
          ORDER BY n.nspname, c.relname, a.attnum`,
  },
  {
    name: 'constraints',
    sql: `SELECT n.nspname AS schema_name,
                 c.relname AS table_name,
                 con.conname AS constraint_name,
                 con.contype AS constraint_type,
                 pg_get_constraintdef(con.oid, true) AS definition,
                 con.condeferrable AS deferrable,
                 con.condeferred AS initially_deferred,
                 con.convalidated AS validated
          FROM pg_constraint con
          JOIN pg_class c ON c.oid = con.conrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          ORDER BY n.nspname, c.relname, con.conname`,
  },
  {
    name: 'indexes',
    sql: `SELECT n.nspname AS schema_name,
                 t.relname AS table_name,
                 i.relname AS index_name,
                 x.indisunique AS is_unique,
                 am.amname AS method,
                 ARRAY(
                   SELECT pg_get_indexdef(i.oid, s.i, true)
                   FROM generate_series(1, x.indnkeyatts) AS s(i)
                   ORDER BY s.i
                 ) AS keys,
                 pg_get_expr(x.indpred, x.indrelid) AS predicate,
                 e.extname AS extension_name
          FROM pg_index x
          JOIN pg_class t ON t.oid = x.indrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          JOIN pg_class i ON i.oid = x.indexrelid
          JOIN pg_am am ON am.oid = i.relam
          LEFT JOIN pg_depend d ON d.classid = 'pg_class'::regclass AND d.objid = i.oid AND d.deptype = 'e'
          LEFT JOIN pg_extension e ON e.oid = d.refobjid
          ORDER BY n.nspname, t.relname, i.relname`,
  },
  {
    name: 'types',
    sql: `SELECT n.nspname AS schema_name,
                 t.typname AS type_name,
                 t.typtype AS type_kind,
                 COALESCE(array_agg(e.enumlabel ORDER BY e.enumsortorder) FILTER (WHERE e.enumlabel IS NOT NULL), ARRAY[]::text[]) AS enum_values,
                 x.extname AS extension_name
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          LEFT JOIN pg_enum e ON e.enumtypid = t.oid
          LEFT JOIN pg_depend d ON d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e'
          LEFT JOIN pg_extension x ON x.oid = d.refobjid
          WHERE t.typtype IN ('e','d')
          GROUP BY n.nspname, t.typname, t.typtype, x.extname
          ORDER BY n.nspname, t.typname`,
  },
  {
    name: 'triggers',
    sql: `SELECT n.nspname AS schema_name,
                 c.relname AS table_name,
                 tg.tgname AS trigger_name,
                 pg_get_triggerdef(tg.oid, true) AS definition,
                 pn.nspname AS function_schema,
                 p.proname AS function_name
          FROM pg_trigger tg
          JOIN pg_class c ON c.oid = tg.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_proc p ON p.oid = tg.tgfoid
          JOIN pg_namespace pn ON pn.oid = p.pronamespace
          WHERE NOT tg.tgisinternal
          ORDER BY n.nspname, c.relname, tg.tgname`,
  },
  {
    name: 'routines',
    sql: `SELECT n.nspname AS schema_name,
                 p.proname AS routine_name,
                 p.prokind AS routine_kind,
                 pg_get_function_identity_arguments(p.oid) AS identity_arguments,
                 pg_get_function_result(p.oid) AS result_type,
                 l.lanname AS language,
                 p.prosecdef AS security_definer,
                 pg_get_userbyid(p.proowner) AS owner,
                 pg_get_functiondef(p.oid) AS definition,
                 e.extname AS extension_name
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          JOIN pg_language l ON l.oid = p.prolang
          LEFT JOIN pg_depend d ON d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
          LEFT JOIN pg_extension e ON e.oid = d.refobjid
          ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)`,
  },
  {
    name: 'policies',
    sql: `SELECT schemaname AS schema_name,
                 tablename AS table_name,
                 policyname AS policy_name,
                 permissive,
                 roles,
                 cmd AS command,
                 qual AS using_expression,
                 with_check AS check_expression
          FROM pg_policies
          ORDER BY schemaname, tablename, policyname`,
  },
  {
    name: 'table_grants',
    sql: `SELECT table_schema AS schema_name,
                 table_name AS object_name,
                 grantee,
                 privilege_type,
                 is_grantable
          FROM information_schema.table_privileges
          ORDER BY table_schema, table_name, grantee, privilege_type`,
  },
  {
    name: 'routine_grants',
    sql: `SELECT routine_schema AS schema_name,
                 routine_name AS object_name,
                 grantee,
                 privilege_type,
                 is_grantable
          FROM information_schema.routine_privileges
          ORDER BY routine_schema, routine_name, grantee, privilege_type`,
  },
  {
    name: 'extensions',
    sql: `SELECT e.extname AS extension_name,
                 e.extversion AS extension_version,
                 n.nspname AS schema_name
          FROM pg_extension e
          JOIN pg_namespace n ON n.oid = e.extnamespace
          ORDER BY e.extname`,
  },
  {
    name: 'sequences',
    sql: `SELECT schemaname AS schema_name,
                 sequencename AS sequence_name,
                 data_type,
                 start_value,
                 min_value,
                 max_value,
                 increment_by,
                 cycle,
                 pg_get_userbyid(c.relowner) AS owner
          FROM pg_sequences s
          JOIN pg_namespace n ON n.nspname = s.schemaname
          JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = s.sequencename AND c.relkind = 'S'
          ORDER BY s.schemaname, s.sequencename`,
  },
]);

const FORBIDDEN_WRITE = /\b(INSERT|UPDATE|DELETE|UPSERT|MERGE|ALTER|DROP|TRUNCATE|CREATE|COPY|CALL|DO|GRANT|REVOKE)\b/i;

export function assertReadOnlyCatalog() {
  for (const { name, sql } of INTROSPECTION_QUERIES) {
    const stripped = sql.replace(/--.*$/gm, '').trim();
    if (!/^(SELECT|WITH)\b/i.test(stripped) || FORBIDDEN_WRITE.test(stripped)) {
      throw new Error(`introspection query is not read-only: ${name}`);
    }
  }
}
