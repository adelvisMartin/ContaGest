\set ON_ERROR_STOP on

-- Read-only catalog verification for hipico_backup.
WITH role_state AS (
  SELECT
    r.rolname,
    r.rolcanlogin,
    r.rolinherit,
    r.rolsuper,
    r.rolcreatedb,
    r.rolcreaterole,
    r.rolreplication,
    r.rolbypassrls,
    has_database_privilege('hipico_backup', current_database(), 'CONNECT') AS database_connect,
    has_schema_privilege('hipico_backup','public','USAGE') AS public_usage,
    has_schema_privilege('hipico_backup','public','CREATE') AS public_create,
    CASE
      WHEN to_regnamespace('auth') IS NULL THEN false
      ELSE has_schema_privilege('hipico_backup','auth','USAGE')
    END AS auth_usage
  FROM pg_roles r
  WHERE r.rolname='hipico_backup'
),
service_membership AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles member ON member.oid=m.member
    JOIN pg_roles granted ON granted.oid=m.roleid
    WHERE member.rolname='hipico_backup' AND granted.rolname='service_role'
  ) AS service_role_member
),
auth_grants AS (
  SELECT format('%I.%I:%s',table_schema,table_name,privilege_type) AS grant_name
  FROM information_schema.role_table_grants
  WHERE grantee='hipico_backup' AND table_schema='auth'
  UNION ALL
  SELECT format('%I.%I:%s',routine_schema,routine_name,privilege_type)
  FROM information_schema.role_routine_grants
  WHERE grantee='hipico_backup' AND routine_schema='auth'
  UNION ALL
  SELECT format('%I.%I:%s',object_schema,object_name,privilege_type)
  FROM information_schema.usage_privileges
  WHERE grantee='hipico_backup' AND object_schema='auth'
)
SELECT
  rs.*,
  sm.service_role_member,
  coalesce((SELECT jsonb_agg(grant_name ORDER BY grant_name) FROM auth_grants),'[]'::jsonb) AS auth_explicit_grants
FROM role_state rs
CROSS JOIN service_membership sm;
