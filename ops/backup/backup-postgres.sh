#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_SCOPE="${BACKUP_SCOPE:-contagest-shared}"
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-14}"
TABLE_FILE="${TABLE_FILE:-$(cd "$(dirname "$0")" && pwd)/contagest-public-tables.txt}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
raw="$BACKUP_DIR/contagest-${STAMP}.dump"
if [[ -z "${BACKUP_AGE_RECIPIENT:-}" && "${ALLOW_UNENCRYPTED_BACKUP:-false}" != "true" ]]; then
  echo "Refusing unencrypted backup. Set BACKUP_AGE_RECIPIENT or explicitly ALLOW_UNENCRYPTED_BACKUP=true." >&2
  exit 2
fi
args=(--format=custom --compress=9 --no-owner --no-acl --file "$raw")
if [[ "$BACKUP_SCOPE" != "full" ]]; then
  while IFS= read -r table; do
    [[ -z "$table" || "$table" == \#* ]] && continue
    args+=("--table=public.\"${table}\"")
  done < "$TABLE_FILE"
fi
pg_dump "$DATABASE_URL" "${args[@]}"
final="$raw"
if [[ -n "${BACKUP_AGE_RECIPIENT:-}" ]]; then
  command -v age >/dev/null || { echo "age is required for encrypted backups" >&2; exit 3; }
  final="${raw}.age"
  age -r "$BACKUP_AGE_RECIPIENT" -o "$final" "$raw"
  rm -f "$raw"
fi
sha256sum "$final" > "${final}.sha256"
if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  command -v rclone >/dev/null || { echo "rclone is required for offsite upload" >&2; exit 4; }
  target="${RCLONE_REMOTE%/}/$(basename "$final")"
  rclone copyto "$final" "$target"
  rclone copyto "${final}.sha256" "${target}.sha256"
fi
find "$BACKUP_DIR" -type f -name 'contagest-*.dump*' -mtime "+$LOCAL_RETENTION_DAYS" -delete
printf 'Backup complete: %s\n' "$final"
