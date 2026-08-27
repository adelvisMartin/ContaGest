#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${RESTORE_DATABASE_URL:?set RESTORE_DATABASE_URL to a disposable drill database}"
: "${BACKUP_FILE:?set BACKUP_FILE to a local .data.dump.age or .data.dump file}"

TABLE_FILE="${TABLE_FILE:-$(cd "$(dirname "$0")" && pwd)/contagest-public-tables.txt}"
for command in psql pg_restore sha256sum; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 3; }
done

name="$(psql "$RESTORE_DATABASE_URL" -Atqc 'select current_database()')"
if [[ "${ALLOW_UNSAFE_RESTORE:-false}" != "true" && ! "$name" =~ (_restore|_drill)$ ]]; then
  echo "Refusing destructive restore into '$name'. Database name must end in _restore or _drill." >&2
  exit 2
fi

restore_host="$(printf '%s' "$RESTORE_DATABASE_URL" | sed -nE 's#^[^:]+://[^@]+@([^/:]+).*#\1#p')"
if [[ "${ALLOW_PRIMARY_HOST_RESTORE:-false}" != "true" && -n "${PRIMARY_DATABASE_HOST:-}" && "$restore_host" == "$PRIMARY_DATABASE_HOST" ]]; then
  echo "Refusing restore drill on PRIMARY_DATABASE_HOST ($restore_host)." >&2
  exit 2
fi

[[ -f "$BACKUP_FILE" ]] || { echo "Backup file not found: $BACKUP_FILE" >&2; exit 4; }
[[ -f "$TABLE_FILE" ]] || { echo "Table manifest not found: $TABLE_FILE" >&2; exit 4; }
checksum_file="${BACKUP_SHA256_FILE:-${BACKUP_FILE}.sha256}"
[[ -f "$checksum_file" ]] || { echo "Checksum file is required: $checksum_file" >&2; exit 4; }
(
  cd "$(dirname "$BACKUP_FILE")"
  sha256sum --check "$(basename "$checksum_file")"
)

if [[ -n "${TABLE_MANIFEST_SHA256:-}" ]]; then
  actual_table_sha="$(sha256sum "$TABLE_FILE" | awk '{print $1}')"
  [[ "$actual_table_sha" == "$TABLE_MANIFEST_SHA256" ]] || { echo "Table manifest checksum mismatch." >&2; exit 4; }
fi

tmp=""
source="$BACKUP_FILE"
if [[ "$BACKUP_FILE" == *.age ]]; then
  : "${AGE_IDENTITY:?AGE_IDENTITY is required for encrypted .age backups}"
  command -v age >/dev/null || { echo "age is required" >&2; exit 3; }
  tmp="$(mktemp --suffix=.data.dump)"
  trap 'rm -f "$tmp"' EXIT
  age -d -i "$AGE_IDENTITY" -o "$tmp" "$BACKUP_FILE"
  source="$tmp"
fi

pg_restore --list "$source" >/dev/null

# The schema MUST already exist from the versioned migrations. A data-only backup must
# never recreate policies/functions/roles from production inside the drill target.
for critical in Tenant UserProfile LicenseKey AuditLog Subscription; do
  exists="$(psql "$RESTORE_DATABASE_URL" -Atqc "select to_regclass('public.\"$critical\"') is not null")"
  [[ "$exists" == "t" ]] || { echo "Schema is not ready; missing public.$critical. Apply migrations first." >&2; exit 5; }
done

# Migrations can seed static rows. Clear only the explicitly inventoried ContaGest tables
# inside the disposable drill DB before replaying production data.
truncate_sql=""
while IFS= read -r table; do
  [[ -z "$table" || "$table" == \#* ]] && continue
  [[ "$table" =~ ^[A-Z][A-Za-z0-9_]*$ ]] || { echo "Unsafe table name in manifest: $table" >&2; exit 4; }
  present="$(psql "$RESTORE_DATABASE_URL" -Atqc "select to_regclass('public.\"$table\"') is not null")"
  [[ "$present" == "t" ]] || { echo "Schema/table inventory mismatch: public.$table missing" >&2; exit 5; }
  truncate_sql+="TRUNCATE TABLE public.\"$table\" CASCADE;"$'\n'
done < "$TABLE_FILE"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "$truncate_sql"

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
pg_restore --dbname "$RESTORE_DATABASE_URL" --data-only --disable-triggers --no-owner --no-acl "$source"

psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'Tenant' AS entity, count(*)::bigint AS rows FROM public."Tenant"
UNION ALL SELECT 'UserProfile', count(*) FROM public."UserProfile"
UNION ALL SELECT 'LicenseKey', count(*) FROM public."LicenseKey"
UNION ALL SELECT 'AuditLog', count(*) FROM public."AuditLog"
UNION ALL SELECT 'Subscription', count(*) FROM public."Subscription"
ORDER BY entity;
SQL

completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Restore drill passed for disposable database: $name"
echo "Started:   $started_at"
echo "Completed: $completed_at"
