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

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

table_manifest_sha256="$(sha256sum "$TABLE_FILE" | awk '{print $1}')"
node --input-type=module - "$MANIFEST" "$TABLE_FILE" "$tmpdir/present-tables.txt" "$tmpdir/deferred-tables.txt" "$tmpdir/manifest-values.txt" <<'NODE'
import fs from 'node:fs';
const [manifestFile,inventoryFile,presentFile,deferredFile,valuesFile]=process.argv.slice(2);
const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
const canonical=fs.readFileSync(inventoryFile,'utf8')
  .split(/\r?\n/).map((x)=>x.trim()).filter((x)=>x&&!x.startsWith('#'));
const present=Array.isArray(manifest.presentTables)?manifest.presentTables.map(String):[];
const deferred=Array.isArray(manifest.deferredTables)?manifest.deferredTables.map(String):[];
const validNames=(items)=>items.every((x)=>/^hipico_[a-z0-9_]+$/.test(x));
const sameSet=(a,b)=>a.length===b.length&&[...a].sort().every((x,i)=>x===[...b].sort()[i]);
if(canonical.length!==25||new Set(canonical).size!==25)throw new Error('Canonical inventory invalid');
if(!['PRE_ROLLOUT','STEADY_STATE'].includes(String(manifest.mode||'')))throw new Error('Backup mode invalid');
if(!present.length||new Set(present).size!==present.length||new Set(deferred).size!==deferred.length)throw new Error('Backup partition invalid');
if(!validNames(present)||!validNames(deferred))throw new Error('Backup partition names invalid');
if(present.some((x)=>deferred.includes(x))||!sameSet([...present,...deferred],canonical))throw new Error('Backup partition does not cover canonical inventory');
if(Number(manifest.canonicalTableCount)!==25||Number(manifest.sourceTableCount)!==present.length)throw new Error('Backup table counts invalid');
if(manifest.mode==='STEADY_STATE'&&(present.length!==25||deferred.length!==0))throw new Error('STEADY_STATE backup is incomplete');
fs.writeFileSync(presentFile,present.join('\n')+'\n');
fs.writeFileSync(deferredFile,deferred.join('\n')+(deferred.length?'\n':''));
const values=[
  manifest.backupId,manifest.candidateSha,manifest.targetDatabase,manifest.scope,manifest.migrationChain,
  manifest.tableManifestSha256,manifest.mode,String(manifest.canonicalTableCount),String(manifest.sourceTableCount),
  manifest.plaintextDigests?.dumpSha256,manifest.plaintextDigests?.sourceCountsSha256,manifest.plaintextDigests?.authUserIdsSha256
];
fs.writeFileSync(valuesFile,values.map((x)=>String(x||'')).join('\n')+'\n');
NODE

mapfile -t MV < "$tmpdir/manifest-values.txt"
backup_id="${MV[0]}"; manifest_sha="${MV[1]}"; target_database="${MV[2]}"; scope="${MV[3]}"; chain="${MV[4]}"
manifest_table_sha="${MV[5]}"; mode="${MV[6]}"; canonical_table_count="${MV[7]}"; source_table_count="${MV[8]}"
dump_sha="${MV[9]}"; counts_sha="${MV[10]}"; auth_sha="${MV[11]}"

[[ "$manifest_sha" == "${HIPICO_CANDIDATE_SHA,,}" ]] || { echo "Backup SHA mismatch." >&2; exit 6; }
[[ "$scope" == "hipico-canonical-v12-v27" && "$chain" == "v12-v27" ]] || { echo "Backup scope/chain mismatch." >&2; exit 6; }
[[ "$manifest_table_sha" == "$table_manifest_sha256" ]] || { echo "Table inventory digest mismatch." >&2; exit 6; }
[[ "$canonical_table_count" == "25" ]] || { echo "Canonical table count mismatch." >&2; exit 6; }
[[ "$source_table_count" =~ ^[0-9]+$ && "$source_table_count" -ge 1 ]] || { echo "Source table count invalid." >&2; exit 6; }

for file in hipico.data.dump.age source-counts.json.age auth-user-ids.txt.age; do
  (cd "$HIPICO_BACKUP_OUTPUT_DIR" && sha256sum --check "$file.sha256")
done

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
[[ "${#TABLES[@]}" -eq 25 ]] || { echo "Expected 25 restored schema tables." >&2; exit 8; }
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

present_json="$(node --input-type=module - "$tmpdir/present-tables.txt" <<'NODE'
import fs from 'node:fs';
const rows=fs.readFileSync(process.argv[2],'utf8').split(/\r?\n/).filter(Boolean);
process.stdout.write(JSON.stringify(rows));
NODE
)"
deferred_json="$(node --input-type=module - "$tmpdir/deferred-tables.txt" <<'NODE'
import fs from 'node:fs';
const rows=fs.readFileSync(process.argv[2],'utf8').split(/\r?\n/).filter(Boolean);
process.stdout.write(JSON.stringify(rows));
NODE
)"

HIPICO_BACKUP_SOURCE_COUNTS_FILE="$tmpdir/source-counts.json" \
HIPICO_BACKUP_RESTORED_COUNTS_FILE="$tmpdir/restored-counts.json" \
HIPICO_BACKUP_ID="$backup_id" \
HIPICO_RESTORE_TEST_ID="$RESTORE_TEST_ID" \
HIPICO_BACKUP_TARGET_DATABASE="$target_database" \
HIPICO_BACKUP_SCOPE="$scope" \
HIPICO_BACKUP_MIGRATION_CHAIN="$chain" \
HIPICO_BACKUP_TABLE_MANIFEST_SHA256="$table_manifest_sha256" \
HIPICO_BACKUP_MODE="$mode" \
HIPICO_BACKUP_PRESENT_TABLES_JSON="$present_json" \
HIPICO_BACKUP_DEFERRED_TABLES_JSON="$deferred_json" \
HIPICO_RESTORE_ORPHAN_FOREIGN_KEYS="$orphan_foreign_keys" \
HIPICO_RESTORE_VERIFIED=true \
HIPICO_BACKUP_EVIDENCE_OUTPUT="$EVIDENCE" \
node scripts/hipico-schema-backup-evidence-v23.mjs

printf 'Hípico restore drill verified: %s\n' "$RESTORE_TEST_ID"
printf 'Mode: %s; source tables: %s/25\n' "$mode" "$source_table_count"
printf 'Orphan foreign keys: %s\n' "$orphan_foreign_keys"
