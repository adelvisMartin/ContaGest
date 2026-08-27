#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${RESTORE_DATABASE_URL:?set RESTORE_DATABASE_URL to a disposable drill database}"
: "${BACKUP_FILE:?set BACKUP_FILE to a local .dump.age or .dump file}"

for command in psql pg_restore sha256sum; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 3; }
done

name="$(psql "$RESTORE_DATABASE_URL" -Atqc 'select current_database()')"
if [[ "${ALLOW_UNSAFE_RESTORE:-false}" != "true" && ! "$name" =~ (_restore|_drill)$ ]]; then
  echo "Refusing destructive restore into '$name'. Database name must end in _restore or _drill." >&2
  exit 2
fi

# Additional guard: never accept the known primary project database host unless an explicit
# break-glass override is supplied. Monthly drills belong on isolated/disposable databases.
restore_host="$(printf '%s' "$RESTORE_DATABASE_URL" | sed -nE 's#^[^:]+://[^@]+@([^/:]+).*#\1#p')"
if [[ "${ALLOW_PRIMARY_HOST_RESTORE:-false}" != "true" && -n "${PRIMARY_DATABASE_HOST:-}" && "$restore_host" == "$PRIMARY_DATABASE_HOST" ]]; then
  echo "Refusing restore drill on PRIMARY_DATABASE_HOST ($restore_host)." >&2
  exit 2
fi

[[ -f "$BACKUP_FILE" ]] || { echo "Backup file not found: $BACKUP_FILE" >&2; exit 4; }
checksum_file="${BACKUP_SHA256_FILE:-${BACKUP_FILE}.sha256}"
[[ -f "$checksum_file" ]] || { echo "Checksum file is required: $checksum_file" >&2; exit 4; }
(
  cd "$(dirname "$BACKUP_FILE")"
  sha256sum --check "$(basename "$checksum_file")"
)

tmp=""
source="$BACKUP_FILE"
if [[ "$BACKUP_FILE" == *.age ]]; then
  : "${AGE_IDENTITY:?AGE_IDENTITY is required for encrypted .age backups}"
  command -v age >/dev/null || { echo "age is required" >&2; exit 3; }
  tmp="$(mktemp --suffix=.dump)"
  trap 'rm -f "$tmp"' EXIT
  age -d -i "$AGE_IDENTITY" -o "$tmp" "$BACKUP_FILE"
  source="$tmp"
fi

# Validate the archive before making changes to the disposable target.
pg_restore --list "$source" >/dev/null
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
pg_restore --dbname "$RESTORE_DATABASE_URL" --clean --if-exists --no-owner --no-acl "$source"

psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF to_regclass('public."Tenant"') IS NULL THEN RAISE EXCEPTION 'Tenant table missing'; END IF;
  IF to_regclass('public."UserProfile"') IS NULL THEN RAISE EXCEPTION 'UserProfile table missing'; END IF;
  IF to_regclass('public."LicenseKey"') IS NULL THEN RAISE EXCEPTION 'LicenseKey table missing'; END IF;
  IF to_regclass('public."AuditLog"') IS NULL THEN RAISE EXCEPTION 'AuditLog table missing'; END IF;
  IF to_regclass('public."Subscription"') IS NULL THEN RAISE EXCEPTION 'Subscription table missing'; END IF;
END $$;

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
