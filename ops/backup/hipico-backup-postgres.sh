#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${HIPICO_BACKUP_DATABASE_URL:?set HIPICO_BACKUP_DATABASE_URL for the dedicated hipico_backup role}"
: "${HIPICO_BACKUP_AGE_RECIPIENT:?set HIPICO_BACKUP_AGE_RECIPIENT}"
: "${HIPICO_BACKUP_RCLONE_REMOTE:?set HIPICO_BACKUP_RCLONE_REMOTE}"
: "${HIPICO_CANDIDATE_SHA:?set HIPICO_CANDIDATE_SHA to an exact 40-hex commit}"

EXPECTED_ROLE="${HIPICO_BACKUP_EXPECTED_ROLE:-hipico_backup}"
SCOPE="hipico-canonical-v12-v27"
CHAIN="v12-v27"
TABLE_FILE="${HIPICO_BACKUP_TABLE_FILE:-$(cd "$(dirname "$0")" && pwd)/hipico-public-tables.txt}"
OUTPUT_ROOT="${HIPICO_BACKUP_OUTPUT_DIR:-artifacts/qa/hipico-schema-backup/${HIPICO_CANDIDATE_SHA}/source}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_ID="hipico-${STAMP}-${HIPICO_CANDIDATE_SHA:0:12}"

[[ "$HIPICO_CANDIDATE_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { echo "HIPICO_CANDIDATE_SHA must be 40 hex." >&2; exit 2; }
[[ -f "$TABLE_FILE" ]] || { echo "Missing Hípico table inventory: $TABLE_FILE" >&2; exit 3; }

for command in psql pg_dump pg_restore age rclone sha256sum node; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 3; }
done

mapfile -t TABLES < <(grep -Ev '^\s*(#|$)' "$TABLE_FILE")
table_count="${#TABLES[@]}"; [[ "$table_count" -eq 25 ]] || { echo "Expected 25 inventory tables, found $table_count." >&2; exit 4; }
for table in "${TABLES[@]}"; do
  [[ "$table" =~ ^hipico_[a-z0-9_]+$ ]] || { echo "Unsafe table in inventory: $table" >&2; exit 4; }
done

mkdir -p "$OUTPUT_ROOT"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

role_info="$(psql "$HIPICO_BACKUP_DATABASE_URL" -AtF '|' -v ON_ERROR_STOP=1 -c "
  select current_database(), current_user, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolbypassrls
  from pg_roles r
  where r.rolname=current_user
")"
IFS='|' read -r source_database current_role rolsuper rolcreatedb rolcreaterole rolbypassrls <<<"$role_info"
[[ "$current_role" == "$EXPECTED_ROLE" ]] || { echo "Refusing backup role '$current_role'; expected '$EXPECTED_ROLE'." >&2; exit 5; }
for flag in "$rolsuper" "$rolcreatedb" "$rolcreaterole" "$rolbypassrls"; do
  [[ "$flag" == "f" ]] || { echo "Backup role violates minimum-privilege contract." >&2; exit 5; }
done

counts_tsv="$tmpdir/source-counts.tsv"
: > "$counts_tsv"
dump_args=(--format=custom --compress=9 --data-only --enable-row-security --no-owner --no-acl --file "$tmpdir/hipico.data.dump")

for table in "${TABLES[@]}"; do
  perms="$(psql "$HIPICO_BACKUP_DATABASE_URL" -AtF '|' -v ON_ERROR_STOP=1 -c "
    select
      to_regclass('public.$table') is not null,
      has_table_privilege(current_user,'public.$table','SELECT'),
      not exists (
        select 1
        from information_schema.role_table_grants g
        where g.grantee=current_user
          and g.table_schema='public'
          and g.table_name='$table'
          and g.privilege_type <> 'SELECT'
      )
  ")"
  IFS='|' read -r present can_select select_only <<<"$perms"
  [[ "$present" == "t" ]] || { echo "Backup scope table missing: public.$table" >&2; exit 6; }
  [[ "$can_select" == "t" ]] || { echo "Backup role cannot SELECT public.$table" >&2; exit 6; }
  [[ "$select_only" == "t" ]] || {
    echo "Backup role has non-SELECT privilege on public.$table" >&2
    exit 6
  }
  count="$(psql "$HIPICO_BACKUP_DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "select count(*)::bigint from public.$table")"
  [[ "$count" =~ ^[0-9]+$ ]] || { echo "Invalid row count for public.$table" >&2; exit 6; }
  printf '%s\t%s\n' "$table" "$count" >> "$counts_tsv"
  dump_args+=("--table=public.$table")
done

node --input-type=module - "$counts_tsv" "$tmpdir/source-counts.json" <<'NODE'
import fs from 'node:fs';
const [input,output]=process.argv.slice(2);
const rows=fs.readFileSync(input,'utf8').trim().split(/\n/).filter(Boolean);
const data=Object.fromEntries(rows.map((line)=>{
  const [table,count]=line.split('\t');
  return [table,Number(count)];
}));
fs.writeFileSync(output,JSON.stringify(data,null,2)+'\n');
NODE

psql "$HIPICO_BACKUP_DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "
  select distinct id::text
  from (
    select owner_id as id from public.hipico_workspaces
    union all select owner_id from public.hipico_profiles
    union all select owner_id from public.hipico_audit_events
    union all select user_id from public.hipico_users
    union all select created_by from public.hipico_users
    union all select workspace_owner_id from public.hipico_users
  ) ids
  where id is not null
  order by id
" > "$tmpdir/auth-user-ids.txt"

if grep -Ev '^$|^[0-9a-fA-F-]{36}$' "$tmpdir/auth-user-ids.txt" | grep -q .; then
  echo "Unexpected auth UUID export format." >&2
  exit 7
fi

pg_dump "$HIPICO_BACKUP_DATABASE_URL" "${dump_args[@]}"
pg_restore --list "$tmpdir/hipico.data.dump" >/dev/null

table_manifest_sha256="$(sha256sum "$TABLE_FILE" | awk '{print $1}')"
dump_sha256="$(sha256sum "$tmpdir/hipico.data.dump" | awk '{print $1}')"
source_counts_sha256="$(sha256sum "$tmpdir/source-counts.json" | awk '{print $1}')"
auth_ids_sha256="$(sha256sum "$tmpdir/auth-user-ids.txt" | awk '{print $1}')"

age -r "$HIPICO_BACKUP_AGE_RECIPIENT" -o "$OUTPUT_ROOT/hipico.data.dump.age" "$tmpdir/hipico.data.dump"
age -r "$HIPICO_BACKUP_AGE_RECIPIENT" -o "$OUTPUT_ROOT/source-counts.json.age" "$tmpdir/source-counts.json"
age -r "$HIPICO_BACKUP_AGE_RECIPIENT" -o "$OUTPUT_ROOT/auth-user-ids.txt.age" "$tmpdir/auth-user-ids.txt"

for encrypted in hipico.data.dump.age source-counts.json.age auth-user-ids.txt.age; do
  sha256sum "$OUTPUT_ROOT/$encrypted" > "$OUTPUT_ROOT/$encrypted.sha256"
done

cat > "$OUTPUT_ROOT/backup-manifest.json" <<JSON
{
  "schema": "hipico-schema-backup-manifest.v23",
  "backupId": "$BACKUP_ID",
  "candidateSha": "${HIPICO_CANDIDATE_SHA,,}",
  "createdAt": "$STAMP",
  "targetDatabase": "$source_database",
  "databaseRole": "$current_role",
  "scope": "$SCOPE",
  "migrationChain": "$CHAIN",
  "tableCount": $table_count,
  "tableManifestSha256": "$table_manifest_sha256",
  "plaintextDigests": {
    "dumpSha256": "$dump_sha256",
    "sourceCountsSha256": "$source_counts_sha256",
    "authUserIdsSha256": "$auth_ids_sha256"
  }
}
JSON

remote="${HIPICO_BACKUP_RCLONE_REMOTE%/}/$BACKUP_ID"
for file in hipico.data.dump.age hipico.data.dump.age.sha256 source-counts.json.age source-counts.json.age.sha256 auth-user-ids.txt.age auth-user-ids.txt.age.sha256 backup-manifest.json; do
  rclone copyto "$OUTPUT_ROOT/$file" "$remote/$file"
done

remote_listing="$(rclone lsf "$remote" --files-only)"
for file in hipico.data.dump.age hipico.data.dump.age.sha256 source-counts.json.age source-counts.json.age.sha256 auth-user-ids.txt.age auth-user-ids.txt.age.sha256 backup-manifest.json; do
  grep -Fxq "$file" <<<"$remote_listing" || { echo "Remote verification failed: $file" >&2; exit 8; }
done

printf 'Hípico encrypted off-site backup verified: %s\n' "$BACKUP_ID"
printf 'Target database: %s\n' "$source_database"
printf 'Table manifest SHA-256: %s\n' "$table_manifest_sha256"
