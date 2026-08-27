#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${DATABASE_BACKUP_URL:?set DATABASE_BACKUP_URL with the dedicated contagest_backup role}"
: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT; unencrypted production backups are forbidden}"
: "${RCLONE_REMOTE:?set RCLONE_REMOTE to an external provider/bucket}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_SCOPE="${BACKUP_SCOPE:-contagest-shared}"
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-7}"
TABLE_FILE="${TABLE_FILE:-$(cd "$(dirname "$0")" && pwd)/contagest-public-tables.txt}"
EXPECTED_BACKUP_ROLE="${DATABASE_BACKUP_EXPECTED_ROLE:-contagest_backup}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

for command in psql pg_dump pg_restore age rclone sha256sum; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 3; }
done

current_role="$(psql "$DATABASE_BACKUP_URL" -Atqc 'select current_user')"
if [[ "$current_role" != "$EXPECTED_BACKUP_ROLE" ]]; then
  echo "Refusing backup with PostgreSQL role '$current_role'. Expected '$EXPECTED_BACKUP_ROLE'." >&2
  exit 2
fi

# Direct Postgres is preferred for pg_dump. Shared Supavisor session mode on 5432 is
# accepted only as an IPv4 compatibility fallback; transaction mode 6543 is rejected.
connection_port="$(psql "$DATABASE_BACKUP_URL" -Atqc "select inet_server_port()")"
url_port="$(printf '%s' "$DATABASE_BACKUP_URL" | sed -nE 's#^[^:]+://[^@]+@[^/:]+:([0-9]+)/.*#\1#p')"
if [[ "$url_port" == "6543" ]]; then
  echo "Refusing transaction-pooler port 6543 for pg_dump. Use direct Postgres or session mode 5432." >&2
  exit 2
fi

raw="$BACKUP_DIR/contagest-${STAMP}.dump"
final="${raw}.age"
manifest="${final}.manifest.json"

args=(--format=custom --compress=9 --no-owner --no-acl --file "$raw")
if [[ "$BACKUP_SCOPE" != "full" ]]; then
  [[ -f "$TABLE_FILE" ]] || { echo "Table manifest not found: $TABLE_FILE" >&2; exit 4; }
  while IFS= read -r table; do
    [[ -z "$table" || "$table" == \#* ]] && continue
    args+=("--table=public.\"${table}\"")
  done < "$TABLE_FILE"
fi

pg_dump "$DATABASE_BACKUP_URL" "${args[@]}"
pg_restore --list "$raw" >/dev/null

age -r "$BACKUP_AGE_RECIPIENT" -o "$final" "$raw"
rm -f "$raw"
sha="$(sha256sum "$final" | awk '{print $1}')"
bytes="$(wc -c < "$final" | tr -d ' ')"
printf '%s  %s\n' "$sha" "$(basename "$final")" > "${final}.sha256"
printf '{"createdAt":"%s","sha256":"%s","bytes":%s,"databaseRole":"%s","scope":"%s","encrypted":true}\n' \
  "$STAMP" "$sha" "$bytes" "$current_role" "$BACKUP_SCOPE" > "$manifest"

# The remote must point to a provider/account independent from the primary Supabase project.
# This script never deletes remote objects. Retention/versioning/object-lock belongs to the
# external bucket so compromised source credentials cannot erase recovery history.
target="${RCLONE_REMOTE%/}/${STAMP}"
rclone copyto "$final" "${target}/$(basename "$final")"
rclone copyto "${final}.sha256" "${target}/$(basename "${final}.sha256")"
rclone copyto "$manifest" "${target}/$(basename "$manifest")"

# Verify that all three recovery objects are visible from the remote.
for object in "$(basename "$final")" "$(basename "${final}.sha256")" "$(basename "$manifest")"; do
  rclone lsf "$target" --files-only | grep -Fxq "$object" || { echo "Remote verification failed: $object" >&2; exit 5; }
done

find "$BACKUP_DIR" -type f \( -name 'contagest-*.dump.age' -o -name 'contagest-*.dump.age.sha256' -o -name 'contagest-*.manifest.json' \) -mtime "+$LOCAL_RETENTION_DAYS" -delete
printf 'Encrypted off-site backup complete: %s\n' "$target"
printf 'SHA-256: %s\n' "$sha"
