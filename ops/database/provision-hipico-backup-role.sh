#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${HIPICO_BACKUP_DDL_URL:?set HIPICO_BACKUP_DDL_URL to a direct DDL/owner connection}"
: "${HIPICO_BACKUP_PASSWORD:?set HIPICO_BACKUP_PASSWORD from a secret manager/environment}"

ROLE_NAME="hipico_backup"
MODE="${HIPICO_BACKUP_ROLE_MODE:-STEADY_STATE}"
TABLE_FILE="${HIPICO_BACKUP_TABLE_FILE:-$(cd "$(dirname "$0")/../backup" && pwd)/hipico-public-tables.txt}"

case "$MODE" in
  PRE_ROLLOUT|STEADY_STATE) ;;
  *) echo "HIPICO_BACKUP_ROLE_MODE must be PRE_ROLLOUT or STEADY_STATE" >&2; exit 4 ;;
esac

command -v psql >/dev/null || { echo "psql is required" >&2; exit 3; }
[[ -f "$TABLE_FILE" ]] || { echo "Hipico backup inventory not found: $TABLE_FILE" >&2; exit 4; }

tables=()
while IFS= read -r table; do
  table="${table%%[[:space:]]}"
  [[ -z "$table" || "$table" == \#* ]] && continue
  [[ "$table" =~ ^hipico_[a-z0-9_]+$ ]] || { echo "Unsafe table name in inventory: $table" >&2; exit 4; }
  tables+=("$table")
done < "$TABLE_FILE"

[[ "${#tables[@]}" -eq 25 ]] || { echo "Expected exactly 25 Hipico backup tables; found ${#tables[@]}." >&2; exit 4; }

# Role creation/rotation and global least-privilege reset.
# This script is intentionally manual-only; CI verification never invokes it.
psql "$HIPICO_BACKUP_DDL_URL" -v ON_ERROR_STOP=1 <<'SQL'
\getenv backup_password HIPICO_BACKUP_PASSWORD
\if :{?backup_password}
\else
  \echo 'HIPICO_BACKUP_PASSWORD is required'
  \quit
\endif

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hipico_backup') THEN
    CREATE ROLE hipico_backup;
  END IF;
END $$;

ALTER ROLE hipico_backup WITH LOGIN PASSWORD :'backup_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT;
ALTER ROLE hipico_backup SET statement_timeout='15min';
ALTER ROLE hipico_backup SET lock_timeout='10s';
ALTER ROLE hipico_backup SET idle_in_transaction_session_timeout='60s';
ALTER ROLE hipico_backup SET search_path='public,pg_catalog';

SELECT current_database() AS target_database \gset
GRANT CONNECT ON DATABASE :"target_database" TO hipico_backup;

REVOKE ALL ON SCHEMA public FROM hipico_backup;
GRANT USAGE ON SCHEMA public TO hipico_backup;
REVOKE CREATE ON SCHEMA public FROM hipico_backup;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM hipico_backup;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM hipico_backup;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM hipico_backup;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    REVOKE service_role FROM hipico_backup;
  END IF;
END $$;
SQL

for table in "${tables[@]}"; do
  present="$(psql "$HIPICO_BACKUP_DDL_URL" -At -v ON_ERROR_STOP=1 -v table="$table" -c "select to_regclass(format('public.%I', :'table')) is not null")"
  if [[ "$present" != "t" ]]; then
    if [[ "$MODE" == "PRE_ROLLOUT" ]]; then
      echo "Deferred canonical table not present yet: public.$table"
      continue
    fi
    echo "Inventory table missing from target in STEADY_STATE: public.$table" >&2
    exit 5
  fi

  psql "$HIPICO_BACKUP_DDL_URL" -v ON_ERROR_STOP=1 -v table="$table" <<'SQL'
SELECT format('GRANT SELECT ON TABLE public.%I TO hipico_backup', :'table') \gexec
SELECT format(
  'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM hipico_backup',
  :'table'
) \gexec

SELECT format('DROP POLICY IF EXISTS hipico_backup_read_all ON public.%I', :'table')
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname=:'table' AND c.relrowsecurity
\gexec

SELECT format(
  'CREATE POLICY hipico_backup_read_all ON public.%I FOR SELECT TO hipico_backup USING (true)',
  :'table'
)
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname=:'table' AND c.relrowsecurity
\gexec
SQL
done

echo "hipico_backup provisioning completed in $MODE mode for canonical Hipico inventory."
echo "Run: node scripts/hipico-backup-role-verify-v24.mjs before executing backup/restore."
