#!/usr/bin/env bash
set -euo pipefail
: "${RESTORE_DATABASE_URL:?set RESTORE_DATABASE_URL to a disposable drill database}"
: "${BACKUP_FILE:?set BACKUP_FILE}"
name="$(psql "$RESTORE_DATABASE_URL" -Atqc 'select current_database()')"
if [[ "${ALLOW_UNSAFE_RESTORE:-false}" != "true" && ! "$name" =~ (_restore|_drill)$ ]]; then
  echo "Refusing restore into '$name'. Use a database ending in _restore or _drill." >&2
  exit 2
fi
tmp=""
source="$BACKUP_FILE"
if [[ "$BACKUP_FILE" == *.age ]]; then
  : "${AGE_IDENTITY:?AGE_IDENTITY is required for .age backups}"
  command -v age >/dev/null || { echo "age is required" >&2; exit 3; }
  tmp="$(mktemp --suffix=.dump)"
  trap 'rm -f "$tmp"' EXIT
  age -d -i "$AGE_IDENTITY" -o "$tmp" "$BACKUP_FILE"
  source="$tmp"
fi
pg_restore --dbname "$RESTORE_DATABASE_URL" --clean --if-exists --no-owner --no-acl "$source"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF to_regclass('public."Tenant"') IS NULL THEN RAISE EXCEPTION 'Tenant table missing'; END IF;
  IF to_regclass('public."UserProfile"') IS NULL THEN RAISE EXCEPTION 'UserProfile table missing'; END IF;
  IF to_regclass('public."LicenseKey"') IS NULL THEN RAISE EXCEPTION 'LicenseKey table missing'; END IF;
  IF to_regclass('public."AuditLog"') IS NULL THEN RAISE EXCEPTION 'AuditLog table missing'; END IF;
END $$;
SELECT 'Tenant' AS entity, count(*) FROM public."Tenant"
UNION ALL SELECT 'UserProfile', count(*) FROM public."UserProfile"
UNION ALL SELECT 'LicenseKey', count(*) FROM public."LicenseKey"
UNION ALL SELECT 'AuditLog', count(*) FROM public."AuditLog";
SQL
echo "Restore drill passed for $name"
