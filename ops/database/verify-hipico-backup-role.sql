\set ON_ERROR_STOP on

-- Manual verification companion for hipico_backup activation.
-- This script creates only temporary session objects and never changes persistent grants.
\getenv backup_mode HIPICO_BACKUP_ROLE_MODE
\if :{?backup_mode}
\else
  \set backup_mode PRE_ROLLOUT
\endif

SELECT :'backup_mode' IN ('PRE_ROLLOUT','STEADY_STATE') AS backup_mode_valid \gset
\if :backup_mode_valid
\else
  \echo 'HIPICO_BACKUP_ROLE_MODE must be PRE_ROLLOUT or STEADY_STATE'
  \quit 4
\endif

CREATE TEMP TABLE hipico_backup_scope (
  table_name text PRIMARY KEY
);

\copy hipico_backup_scope(table_name) FROM 'ops/backup/hipico-public-tables.txt'

DELETE FROM hipico_backup_scope
WHERE btrim(table_name)='' OR left(btrim(table_name),1)='#';

UPDATE hipico_backup_scope SET table_name=btrim(table_name);

SELECT count(*)=25 AS inventory_count_valid FROM hipico_backup_scope \gset
\if :inventory_count_valid
\else
  \echo 'Expected exactly 25 canonical Hipico backup tables'
  \quit 4
\endif

CREATE TEMP TABLE hipico_backup_violations (
  finding text NOT NULL
);

SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='hipico_backup') AS role_exists \gset
\if :role_exists

INSERT INTO hipico_backup_violations(finding)
SELECT 'ROLE_LOGIN_REQUIRED'
FROM pg_roles
WHERE rolname='hipico_backup' AND NOT rolcanlogin;

INSERT INTO hipico_backup_violations(finding)
SELECT 'ROLE_SUPERUSER_FORBIDDEN'
FROM pg_roles
WHERE rolname='hipico_backup' AND rolsuper;

INSERT INTO hipico_backup_violations(finding)
SELECT 'ROLE_CREATEDB_FORBIDDEN'
FROM pg_roles
WHERE rolname='hipico_backup' AND rolcreatedb;

INSERT INTO hipico_backup_violations(finding)
SELECT 'ROLE_CREATEROLE_FORBIDDEN'
FROM pg_roles
WHERE rolname='hipico_backup' AND rolcreaterole;

INSERT INTO hipico_backup_violations(finding)
SELECT 'ROLE_INHERIT_FORBIDDEN'
FROM pg_roles
WHERE rolname='hipico_backup' AND rolinherit;

INSERT INTO hipico_backup_violations(finding)
SELECT 'ROLE_REPLICATION_FORBIDDEN'
FROM pg_roles
WHERE rolname='hipico_backup' AND rolreplication;

INSERT INTO hipico_backup_violations(finding)
SELECT 'ROLE_BYPASSRLS_FORBIDDEN'
FROM pg_roles
WHERE rolname='hipico_backup' AND rolbypassrls;

INSERT INTO hipico_backup_violations(finding)
SELECT 'SERVICE_ROLE_MEMBERSHIP_FORBIDDEN'
WHERE EXISTS (
  SELECT 1
  FROM pg_auth_members m
  JOIN pg_roles member ON member.oid=m.member
  JOIN pg_roles granted ON granted.oid=m.roleid
  WHERE member.rolname='hipico_backup'
    AND granted.rolname='service_role'
);

INSERT INTO hipico_backup_violations(finding)
SELECT 'DATABASE_CONNECT_REQUIRED'
WHERE NOT has_database_privilege('hipico_backup',current_database(),'CONNECT');

INSERT INTO hipico_backup_violations(finding)
SELECT 'PUBLIC_SCHEMA_USAGE_REQUIRED'
WHERE NOT has_schema_privilege('hipico_backup','public','USAGE');

INSERT INTO hipico_backup_violations(finding)
SELECT 'PUBLIC_SCHEMA_CREATE_FORBIDDEN'
WHERE has_schema_privilege('hipico_backup','public','CREATE');

INSERT INTO hipico_backup_violations(finding)
SELECT 'TABLE_MISSING:'||s.table_name
FROM hipico_backup_scope s
WHERE :'backup_mode'='STEADY_STATE'
  AND to_regclass(format('public.%I',s.table_name)) IS NULL;

INSERT INTO hipico_backup_violations(finding)
SELECT 'SELECT_REQUIRED:'||s.table_name
FROM hipico_backup_scope s
WHERE to_regclass(format('public.%I',s.table_name)) IS NOT NULL
  AND NOT has_table_privilege('hipico_backup',format('public.%I',s.table_name),'SELECT');

INSERT INTO hipico_backup_violations(finding)
SELECT DISTINCT 'MUTABLE_PRIVILEGE:'||g.table_name||':'||g.privilege_type
FROM information_schema.role_table_grants g
JOIN hipico_backup_scope s ON s.table_name=g.table_name
WHERE g.grantee='hipico_backup'
  AND g.table_schema='public'
  AND g.privilege_type<>'SELECT';

INSERT INTO hipico_backup_violations(finding)
SELECT 'RLS_POLICY_MISSING:'||s.table_name
FROM hipico_backup_scope s
JOIN pg_class c ON c.oid=to_regclass(format('public.%I',s.table_name))
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relrowsecurity
  AND NOT EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname='public'
      AND p.tablename=s.table_name
      AND p.policyname='hipico_backup_read_all'
      AND 'hipico_backup'=ANY(p.roles)
      AND lower(p.cmd)='select'
  );

INSERT INTO hipico_backup_violations(finding)
SELECT DISTINCT 'CROSS_SCOPE_GRANT:'||g.table_schema||'.'||g.table_name||':'||g.privilege_type
FROM information_schema.role_table_grants g
WHERE g.grantee='hipico_backup'
  AND g.table_schema='public'
  AND NOT EXISTS (
    SELECT 1 FROM hipico_backup_scope s WHERE s.table_name=g.table_name
  );

INSERT INTO hipico_backup_violations(finding)
SELECT 'DEFAULT_PRIVILEGE_FORBIDDEN:'||d.defaclobjtype
FROM pg_default_acl d
WHERE EXISTS (
  SELECT 1
  FROM unnest(coalesce(d.defaclacl,'{}'::aclitem[])) item
  WHERE item::text LIKE 'hipico_backup=%'
);

SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='auth') AS auth_schema_exists \gset
\if :auth_schema_exists
  INSERT INTO hipico_backup_violations(finding)
  SELECT 'AUTH_SCHEMA_ACCESS:USAGE'
  WHERE has_schema_privilege('hipico_backup','auth','USAGE');

  INSERT INTO hipico_backup_violations(finding)
  SELECT DISTINCT 'AUTH_SCHEMA_ACCESS:TABLE:'||c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='auth'
    AND c.relkind IN ('r','p','v','m')
    AND (
      has_table_privilege('hipico_backup',c.oid,'SELECT')
      OR has_table_privilege('hipico_backup',c.oid,'INSERT')
      OR has_table_privilege('hipico_backup',c.oid,'UPDATE')
      OR has_table_privilege('hipico_backup',c.oid,'DELETE')
      OR has_table_privilege('hipico_backup',c.oid,'TRUNCATE')
      OR has_table_privilege('hipico_backup',c.oid,'REFERENCES')
      OR has_table_privilege('hipico_backup',c.oid,'TRIGGER')
    );

  INSERT INTO hipico_backup_violations(finding)
  SELECT DISTINCT 'AUTH_SCHEMA_ACCESS:FUNCTION:'||p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='auth'
    AND has_function_privilege('hipico_backup',p.oid,'EXECUTE');
\endif

\else
  INSERT INTO hipico_backup_violations(finding) VALUES('ROLE_MISSING');
\endif

SELECT finding
FROM hipico_backup_violations
ORDER BY finding;

SELECT NOT EXISTS(SELECT 1 FROM hipico_backup_violations) AS verification_pass \gset
\if :verification_pass
  \echo 'hipico_backup verification PASS'
\else
  \echo 'hipico_backup verification FAIL'
  \quit 2
\endif
