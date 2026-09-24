#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL es obligatorio}"

command -v psql >/dev/null 2>&1 || {
  echo '[qa28][FAIL] psql no está instalado' >&2
  exit 1
}

# Prisma accepts ?schema=public; libpq/psql does not. Remove only that
# Prisma-specific query parameter and preserve all other connection options.
PSQL_DATABASE_URL="$(node -e "
const url=new URL(process.env.DATABASE_URL);
url.searchParams.delete('schema');
process.stdout.write(url.toString());
")"

DB_NAME="$(psql "$PSQL_DATABASE_URL" -X -Atc 'select current_database()')"
if [[ ! "$DB_NAME" =~ _e2e$ ]]; then
  echo "[qa28][FAIL] se rechazó una base no efímera: $DB_NAME" >&2
  exit 1
fi

PRIMARY_HOST="${PRIMARY_DATABASE_HOST:-}"
DB_HOST="$(psql "$PSQL_DATABASE_URL" -X -Atc "select coalesce(inet_server_addr()::text,'local')")"
if [[ -n "$PRIMARY_HOST" && "$DATABASE_URL" == *"$PRIMARY_HOST"* ]]; then
  echo '[qa28][FAIL] DATABASE_URL apunta al host primario protegido' >&2
  exit 1
fi

printf '[qa28] database=%s server=%s\n' "$DB_NAME" "$DB_HOST"
psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f qa/postgres-tenant-rules-v28.sql
