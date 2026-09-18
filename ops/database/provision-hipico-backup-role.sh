#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${HIPICO_BACKUP_DDL_URL:?set HIPICO_BACKUP_DDL_URL to a direct DDL/owner connection}"
: "${HIPICO_BACKUP_PASSWORD:?set HIPICO_BACKUP_PASSWORD from a secret manager/environment}"

ROLE_NAME="hipico_backup"
MODE="${HIPICO_BACKUP_ROLE_MODE:-PRE_ROLLOUT}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TABLE_FILE="$REPO_ROOT/ops/backup/hipico-public-tables.txt"
SQL_FILE="$REPO_ROOT/ops/database/provision-hipico-backup-role.sql"

case "$MODE" in
  PRE_ROLLOUT|STEADY_STATE) ;;
  *) echo "HIPICO_BACKUP_ROLE_MODE must be PRE_ROLLOUT or STEADY_STATE" >&2; exit 4 ;;
esac

command -v psql >/dev/null || { echo "psql is required" >&2; exit 3; }
[[ -f "$TABLE_FILE" ]] || { echo "Hipico backup inventory not found: $TABLE_FILE" >&2; exit 4; }
[[ -f "$SQL_FILE" ]] || { echo "Hipico backup provision SQL not found: $SQL_FILE" >&2; exit 4; }

count=0
while IFS= read -r table; do
  table="${table%%[[:space:]]}"
  [[ -z "$table" || "$table" == #* ]] && continue
  [[ "$table" =~ ^hipico_[a-z0-9_]+$ ]] || { echo "Unsafe table name in inventory: $table" >&2; exit 4; }
  count=$((count+1))
done < "$TABLE_FILE"

[[ "$count" -eq 25 ]] || { echo "Expected exactly 25 Hipico backup tables; found $count." >&2; exit 4; }

export HIPICO_BACKUP_ROLE_MODE="$MODE"

cd "$REPO_ROOT"
psql "$HIPICO_BACKUP_DDL_URL"   -v ON_ERROR_STOP=1   -f ops/database/provision-hipico-backup-role.sql

echo "$ROLE_NAME provisioning completed in $MODE mode for canonical Hipico inventory."
echo "Run ops/database/verify-hipico-backup-role.sql and node scripts/hipico-backup-role-verify-v24.mjs before enabling backup secrets."
