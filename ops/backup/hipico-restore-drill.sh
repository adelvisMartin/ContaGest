#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${HIPICO_RESTORE_DATABASE_URL:?set HIPICO_RESTORE_DATABASE_URL to a disposable local database}"
: "${HIPICO_BACKUP_AGE_IDENTITY:?set HIPICO_BACKUP_AGE_IDENTITY to an age identity file}"
: "${HIPICO_CANDIDATE_SHA:?set HIPICO_CANDIDATE_SHA}"
: "${HIPICO_BACKUP_OUTPUT_DIR:?set HIPICO_BACKUP_OUTPUT_DIR}"

TABLE_FILE="${HIPICO_BACKUP_TABLE_FILE:-$(cd "$(dirname "$0")" && pwd)/hipico-public-tables.txt}"
MANIFEST="$HIPICO_BACKUP_OUTPUT_DIR/backup-manifest.json"
EVIDENCE="$HIPICO_BACKUP_OUTPUT_DIR/backup-evidence.json"
RESTORE_TEST_ID="hipico-restore-$(date -u +%Y%m%dT%H%M%SZ)-${HIPICO_CANDIDATE_SHA:0:12}"

for command in psql pg_restore age sha256sum node git npm; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 3; }
done
[[ -f "$MANIFEST" && -f "$TABLE_FILE" && -f "$HIPICO_BACKUP_AGE_IDENTITY" ]] || { echo "Restore inputs missing." >&2; exit 4; }
[[ "$HIPICO_CANDIDATE_SHA" =~ ^[0-9a-fA-F]{40}$ ]] || { echo "Invalid candidate SHA." >&2; exit 4; }

head_sha="$(git rev-parse HEAD | tr '[:upper:]' '[:lower:]')"
[[ "$head_sha" == "${HIPICO_CANDIDATE_SHA,,}" ]] || { echo "Candidate checkout mismatch." >&2; exit 4; }

readarray -t url_parts < <(node --input-type=module - "$HIPICO_RESTORE_DATABASE_URL" <<'NODE'
const u=new URL(process.argv[2]);
console.log(u.hostname.toLowerCase());
console.log(u.pathname.replace(/^\//,''));
NODE
)
restore_host="${url_parts[0]}"
restore_database="${url_parts[1]}"
[[ "$restore_host" == "127.0.0.1" || "$restore_host" == "localhost" || "$restore_host" == "::1" ]] || {
  echo "Restore target must be local." >&2; exit 5;
}
[[ "$restore_database" =~ (_drill|_restore)$ ]] || { echo "Restore DB must end in _drill or _restore." >&2; exit 5; }

table_manifest_sha256="$(sha256sum "$TABLE_FILE" | awk '{print $1}')"
manifest_values="$(node --input-type=module - "$MANIFEST" <<'NODE'
import fs from 'node:fs';
const j=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
for(const value of [
  j.backupId,j.candidateSha,j.targetDatabase,j.scope,j.migrationChain,j.tableManifestSha256,
  j.plaintextDigests?.dumpSha256,j.plaintextDigests?.sourceCountsSha256,j.plaintextDigests?.authUserIdsSha256
]) console.log(String(value||''));
NODE
)"
mapfile -t MV <<<"$manifest_values"
backup_id="${MV[0]}"; manifest_sha="${MV[1]}"; target_database="${MV[2]}"; scope="${MV[3]}"; chain="${MV[4]}"
manifest_table_sha="${MV[5]}"; dump_sha="${MV[6]}"; counts_sha="${MV[7]}"; auth_sha="${MV[8]}"

[[ "$manifest_sha" == "${HIPICO_CANDIDATE_SHA,,}" ]] || { echo "Backup SHA mismatch." >&2; exit 6; }
[[ "$scope" == "hipico-canonical-v12-v27" && "$chain" == "v12-v27" ]] || { echo "Backup scope/chain mismatch." >&2; exit 6; }
[[ "$manifest_table_sha" == "$table_manifest_sha256" ]] || { echo "Table inventory digest mismatch." >&2; exit 6; }

for file in hipico.data.dump.age source-counts.json.age auth-user-ids.txt.age; do
  (cd "$HIPICO_BACKUP_OUTPUT_DIR" && sha256sum --check "$file.sha256")
done

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
age -d -i "$HIPICO_BACKUP_AGE_IDENTITY" -o "$tmpdir/hipico.data.dump" "$HIPICO_BACKUP_OUTPUT_DIR/hipico.data.dump.age"
age -d -i "$HIPICO_BACKUP_AGE_IDENTITY" -o "$tmpdir/source-counts.json" "$HIPICO_BACKUP_OUTPUT_DIR/source-counts.json.age"
age -d -i "$HIPICO_BACKUP_AGE_IDENTITY" -o "$tmpdir/auth-user-ids.txt" "$HIPICO_BACKUP_OUTPUT_DIR/auth-user-ids.txt.age"

[[ "$(sha256sum "$tmpdir/hipico.data.dump" | awk '{print $1}')" == "$dump_sha" ]] || { echo "Dump plaintext digest mismatch." >&2; exit 6; }
[[ "$(sha256sum "$tmpdir/source-counts.json" | awk '{print $1}')" == "$counts_sha" ]] || { echo "Counts plaintext digest mismatch." >&2; exit 6; }
[[ "$(sha256sum "$tmpdir/auth-user-ids.txt" | awk '{print $1}')" == "$auth_sha" ]] || { echo "Auth UUID plaintext digest mismatch." >&2; exit 6; }
pg_restore --list "$tmpdir/hipico.data.dump" >/dev/null

psql "$HIPICO_RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/database/prepare-hipico-restore-ephemeral.sql

while IFS= read -r uuid; do
  [[ -z "$uuid" ]] && continue
  [[ "$uuid" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]] || {
    echo "Invalid auth UUID in encrypted identity list." >&2; exit 7;
  }
  psql "$HIPICO_RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -v user_id="$uuid" -c "
    insert into auth.users(id,email)
    values (:'user_id'::uuid, :'user_id' || '@restore.invalid')
    on conflict(id) do nothing
  " >/dev/null
done < "$tmpdir/auth-user-ids.txt"

export DATABASE_URL="$HIPICO_RESTORE_DATABASE_URL"
export DIRECT_DATABASE_URL="$HIPICO_RESTORE_DATABASE_URL"
npm --workspace backend exec -- prisma migrate deploy --schema prisma/schema.prisma

mapfile -t MIGRATIONS < <(node --input-type=module <<'NODE'
import fs from 'node:fs';
const j=JSON.parse(fs.readFileSync('ops/roadmap/hipico-schema-rollout-v17.json','utf8'));
if(j.chain!=='v12-v27')throw new Error('Unexpected Hípico rollout chain');
for(const item of j.migrations)console.log(item.path);
NODE
)
for migration in "${MIGRATIONS[@]}"; do
  psql "$HIPICO_RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

mapfile -t TABLES < <(grep -Ev '^\s*(#|$)' "$TABLE_FILE")
[[ "${#TABLES[@]}" -eq 25 ]] || { echo "Expected 25 restore tables." >&2; exit 8; }
truncate_sql=""
for table in "${TABLES[@]}"; do
  [[ "$table" =~ ^hipico_[a-z0-9_]+$ ]] || { echo "Unsafe restore table: $table" >&2; exit 8; }
  exists="$(psql "$HIPICO_RESTORE_DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "select to_regclass('public.$table') is not null")"
  [[ "$exists" == "t" ]] || { echo "Candidate schema missing public.$table" >&2; exit 8; }
  truncate_sql+="truncate table public.$table cascade;"$'\n'
done
psql "$HIPICO_RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "$truncate_sql" >/dev/null

pg_restore --dbname "$HIPICO_RESTORE_DATABASE_URL" --data-only --disable-triggers --no-owner --no-acl "$tmpdir/hipico.data.dump"

counts_tsv="$tmpdir/restored-counts.tsv"
: > "$counts_tsv"
for table in "${TABLES[@]}"; do
  count="$(psql "$HIPICO_RESTORE_DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "select count(*)::bigint from public.$table")"
  printf '%s\t%s\n' "$table" "$count" >> "$counts_tsv"
done
node --input-type=module - "$counts_tsv" "$tmpdir/restored-counts.json" <<'NODE'
import fs from 'node:fs';
const [input,output]=process.argv.slice(2);
const rows=fs.readFileSync(input,'utf8').trim().split(/\n/).filter(Boolean);
fs.writeFileSync(output,JSON.stringify(Object.fromEntries(rows.map((line)=>{
  const [table,count]=line.split('\t'); return [table,Number(count)];
})),null,2)+'\n');
NODE

orphan_foreign_keys="$(psql "$HIPICO_RESTORE_DATABASE_URL" -At -v ON_ERROR_STOP=1 <<'SQL'
create temp table hipico_restore_orphans(name text primary key, orphan_count bigint not null);
do $$
declare
  r record;
  child_col text;
  parent_col text;
  orphan_count bigint;
begin
  for r in
    select con.oid, con.conname,
           child_ns.nspname child_schema, child.relname child_table,
           parent_ns.nspname parent_schema, parent.relname parent_table,
           con.conkey, con.confkey
    from pg_constraint con
    join pg_class child on child.oid=con.conrelid
    join pg_namespace child_ns on child_ns.oid=child.relnamespace
    join pg_class parent on parent.oid=con.confrelid
    join pg_namespace parent_ns on parent_ns.oid=parent.relnamespace
    where con.contype='f'
      and child_ns.nspname='public'
      and child.relname like 'hipico_%'
  loop
    if array_length(r.conkey,1)<>1 or array_length(r.confkey,1)<>1 then
      raise exception 'Composite Hípico FK not supported by restore verifier: %', r.conname;
    end if;
    select attname into child_col from pg_attribute where attrelid=to_regclass(format('%I.%I',r.child_schema,r.child_table)) and attnum=r.conkey[1];
    select attname into parent_col from pg_attribute where attrelid=to_regclass(format('%I.%I',r.parent_schema,r.parent_table)) and attnum=r.confkey[1];
    execute format(
      'select count(*) from %I.%I c left join %I.%I p on c.%I=p.%I where c.%I is not null and p.%I is null',
      r.child_schema,r.child_table,r.parent_schema,r.parent_table,child_col,parent_col,child_col,parent_col
    ) into orphan_count;
    insert into hipico_restore_orphans values(r.conname,orphan_count);
  end loop;
end $$;
select coalesce(sum(orphan_count),0)::bigint from hipico_restore_orphans;
SQL
)"
[[ "$orphan_foreign_keys" =~ ^[0-9]+$ ]] || { echo "Invalid orphan FK result." >&2; exit 9; }

HIPICO_BACKUP_SOURCE_COUNTS_FILE="$tmpdir/source-counts.json" \
HIPICO_BACKUP_RESTORED_COUNTS_FILE="$tmpdir/restored-counts.json" \
HIPICO_BACKUP_ID="$backup_id" \
HIPICO_RESTORE_TEST_ID="$RESTORE_TEST_ID" \
HIPICO_BACKUP_TARGET_DATABASE="$target_database" \
HIPICO_BACKUP_SCOPE="$scope" \
HIPICO_BACKUP_MIGRATION_CHAIN="$chain" \
HIPICO_BACKUP_TABLE_MANIFEST_SHA256="$table_manifest_sha256" \
HIPICO_RESTORE_ORPHAN_FOREIGN_KEYS="$orphan_foreign_keys" \
HIPICO_RESTORE_VERIFIED=true \
HIPICO_BACKUP_EVIDENCE_OUTPUT="$EVIDENCE" \
node scripts/hipico-schema-backup-evidence-v23.mjs

printf 'Hípico restore drill verified: %s\n' "$RESTORE_TEST_ID"
printf 'Orphan foreign keys: %s\n' "$orphan_foreign_keys"
