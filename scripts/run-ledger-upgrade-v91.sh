#!/usr/bin/env bash
set -euo pipefail

UPGRADE_URL="${1:-${LEDGER_V91_UPGRADE_DATABASE_URL:-}}"
AMBIGUOUS_URL="${2:-${LEDGER_V91_AMBIGUOUS_DATABASE_URL:-}}"

if [[ -z "$UPGRADE_URL" || -z "$AMBIGUOUS_URL" ]]; then
  echo "usage: $0 <upgrade-db-url> <ambiguous-db-url>" >&2
  exit 64
fi

query_db_name() {
  psql "$1" -v ON_ERROR_STOP=1 -Atc 'select current_database();'
}

require_drill_db() {
  local url="$1"
  local label="$2"
  local db_name
  db_name="$(query_db_name "$url")"
  if [[ ! "$db_name" =~ _v91_.*_drill$ ]]; then
    echo "Refusing $label on non-v91 drill database: $db_name" >&2
    exit 65
  fi
}

require_drill_db "$UPGRADE_URL" "representative upgrade"
require_drill_db "$AMBIGUOUS_URL" "ambiguous-backfill rejection"

ISSUE91_LIFECYCLE='backend/prisma/migrations/20260827060000_issue_91_ledger_posting_immutability/migration.sql'
ISSUE91_PERIOD='backend/prisma/migrations/20260827060100_issue_91_ledger_period_gate/migration.sql'

mapfile -t PRE91_MIGRATIONS < <(
  find backend/prisma/migrations -mindepth 2 -maxdepth 2 -name migration.sql -print \
    | sort \
    | grep -v '/20260827060000_issue_91_ledger_posting_immutability/' \
    | grep -v '/20260827060100_issue_91_ledger_period_gate/'
)

if [[ ${#PRE91_MIGRATIONS[@]} -eq 0 ]]; then
  echo 'No pre-#91 migrations found.' >&2
  exit 66
fi

prepare_pre91_schema() {
  local url="$1"
  echo "Preparing Supabase compatibility contracts for $(query_db_name "$url")"
  psql "$url" -v ON_ERROR_STOP=1 -f ops/database/prepare-supabase-ephemeral.sql
  for migration in "${PRE91_MIGRATIONS[@]}"; do
    echo "Applying pre-#91 migration: $migration"
    psql "$url" -v ON_ERROR_STOP=1 -f "$migration"
  done
}

prepare_pre91_schema "$UPGRADE_URL"
prepare_pre91_schema "$AMBIGUOUS_URL"

# Confirm this is genuinely the previous schema, not a DB that already saw #91.
for url in "$UPGRADE_URL" "$AMBIGUOUS_URL"; do
  if [[ "$(psql "$url" -Atc "select count(*) from information_schema.columns where table_schema='public' and table_name='LedgerEntry' and column_name='postedAt';")" != "0" ]]; then
    echo "Pre-#91 schema unexpectedly contains LedgerEntry.postedAt in $(query_db_name "$url")" >&2
    exit 67
  fi
done

# Positive representative snapshot: two deterministic operational rows, one legacy posted row,
# and one true manual draft that must remain a draft after the migration.
psql "$UPGRADE_URL" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "Tenant" ("id","rif","name") VALUES
  ('qa91-upgrade-tenant','J-91910001-1','QA91 Upgrade Tenant');

INSERT INTO "SalesInvoice" ("id","tenantId","number","fiscalPeriod","status","subtotal","iva","total")
VALUES ('qa91-upgrade-sale','qa91-upgrade-tenant','QA91-UP-SALE','2095-01','issued',10.00,1.60,11.60);
INSERT INTO "LedgerEntry" ("id","tenantId","fiscalPeriod","description","source","sourceId","salesInvoiceId","posted")
VALUES ('qa91-upgrade-sale-ledger','qa91-upgrade-tenant','2095-01','Legacy sale ledger','sales','qa91-upgrade-sale','qa91-upgrade-sale',FALSE);
INSERT INTO "LedgerLine" ("id","entryId","accountCode","accountName","debit","credit") VALUES
  ('qa91-upgrade-sale-d','qa91-upgrade-sale-ledger','1.1','Clientes',11.60,0.00),
  ('qa91-upgrade-sale-c1','qa91-upgrade-sale-ledger','4.1','Ventas',0.00,10.00),
  ('qa91-upgrade-sale-c2','qa91-upgrade-sale-ledger','2.1','IVA',0.00,1.60);

INSERT INTO "PurchaseInvoice" ("id","tenantId","number","fiscalPeriod","status","subtotal","iva","total")
VALUES ('qa91-upgrade-purchase','qa91-upgrade-tenant','QA91-UP-PUR','2095-02','paid',20.00,3.20,23.20);
INSERT INTO "LedgerEntry" ("id","tenantId","fiscalPeriod","description","source","sourceId","purchaseInvoiceId","posted")
VALUES ('qa91-upgrade-purchase-ledger','qa91-upgrade-tenant','2095-02','Legacy purchase ledger','purchase','qa91-upgrade-purchase','qa91-upgrade-purchase',FALSE);
INSERT INTO "LedgerLine" ("id","entryId","accountCode","accountName","debit","credit") VALUES
  ('qa91-upgrade-pur-d1','qa91-upgrade-purchase-ledger','5.1','Costo',20.00,0.00),
  ('qa91-upgrade-pur-d2','qa91-upgrade-purchase-ledger','1.1.5','IVA crédito',3.20,0.00),
  ('qa91-upgrade-pur-c','qa91-upgrade-purchase-ledger','2.1','Proveedores',0.00,23.20);

INSERT INTO "LedgerEntry" ("id","tenantId","fiscalPeriod","description","source","posted")
VALUES
  ('qa91-upgrade-manual-draft','qa91-upgrade-tenant','2095-03','Real manual draft','manual',FALSE),
  ('qa91-upgrade-legacy-posted','qa91-upgrade-tenant','2095-04','Legacy already posted','manual',TRUE);
INSERT INTO "LedgerLine" ("id","entryId","accountCode","accountName","debit","credit") VALUES
  ('qa91-upgrade-draft-d','qa91-upgrade-manual-draft','1.1','Caja',5.00,0.00),
  ('qa91-upgrade-draft-c','qa91-upgrade-manual-draft','4.1','Ingreso',0.00,5.00),
  ('qa91-upgrade-posted-d','qa91-upgrade-legacy-posted','1.1','Caja',8.00,0.00),
  ('qa91-upgrade-posted-c','qa91-upgrade-legacy-posted','4.1','Ingreso',0.00,8.00);
SQL

psql "$UPGRADE_URL" -v ON_ERROR_STOP=1 -f "$ISSUE91_LIFECYCLE"
psql "$UPGRADE_URL" -v ON_ERROR_STOP=1 -f "$ISSUE91_PERIOD"

psql "$UPGRADE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "LedgerEntry"
    WHERE "id"='qa91-upgrade-sale-ledger' AND "posted"=TRUE AND "postedAt" IS NOT NULL
  ) THEN RAISE EXCEPTION 'qa91_sale_backfill_failed'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "LedgerEntry"
    WHERE "id"='qa91-upgrade-purchase-ledger' AND "posted"=TRUE AND "postedAt" IS NOT NULL
  ) THEN RAISE EXCEPTION 'qa91_purchase_backfill_failed'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "LedgerEntry"
    WHERE "id"='qa91-upgrade-manual-draft' AND "posted"=FALSE AND "postedAt" IS NULL AND "postedBy" IS NULL
  ) THEN RAISE EXCEPTION 'qa91_manual_draft_was_misclassified'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "LedgerEntry"
    WHERE "id"='qa91-upgrade-legacy-posted' AND "posted"=TRUE AND "postedAt" IS NOT NULL
  ) THEN RAISE EXCEPTION 'qa91_existing_posted_metadata_backfill_failed'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table='LedgerEntry' AND trigger_name='LedgerEntry_lifecycle_guard'
  ) THEN RAISE EXCEPTION 'qa91_lifecycle_trigger_missing_after_upgrade'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table='LedgerLine' AND trigger_name='LedgerLine_posted_guard'
  ) THEN RAISE EXCEPTION 'qa91_line_trigger_missing_after_upgrade'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table='LedgerEntry' AND trigger_name='LedgerEntry_period_gate'
  ) THEN RAISE EXCEPTION 'qa91_period_trigger_missing_after_upgrade'; END IF;
END $$;
SQL

echo 'representative_upgrade_v91=PASS'

# Negative snapshot: a cancelled operational row cannot be guessed into POSTED or DRAFT.
psql "$AMBIGUOUS_URL" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "Tenant" ("id","rif","name") VALUES
  ('qa91-ambiguous-tenant','J-91910002-2','QA91 Ambiguous Tenant');
INSERT INTO "SalesInvoice" ("id","tenantId","number","fiscalPeriod","status","subtotal","iva","total")
VALUES ('qa91-ambiguous-sale','qa91-ambiguous-tenant','QA91-AMB-SALE','2095-05','cancelled',10.00,1.60,11.60);
INSERT INTO "LedgerEntry" ("id","tenantId","fiscalPeriod","description","source","sourceId","salesInvoiceId","posted")
VALUES ('qa91-ambiguous-ledger','qa91-ambiguous-tenant','2095-05','Ambiguous cancelled sale ledger','sales','qa91-ambiguous-sale','qa91-ambiguous-sale',FALSE);
INSERT INTO "LedgerLine" ("id","entryId","accountCode","accountName","debit","credit") VALUES
  ('qa91-ambiguous-d','qa91-ambiguous-ledger','1.1','Clientes',11.60,0.00),
  ('qa91-ambiguous-c1','qa91-ambiguous-ledger','4.1','Ventas',0.00,10.00),
  ('qa91-ambiguous-c2','qa91-ambiguous-ledger','2.1','IVA',0.00,1.60);
SQL

set +e
psql "$AMBIGUOUS_URL" -v ON_ERROR_STOP=1 -f "$ISSUE91_LIFECYCLE" > ledger-v91-ambiguous-migration.log 2>&1
AMBIGUOUS_STATUS=$?
set -e

if [[ $AMBIGUOUS_STATUS -eq 0 ]]; then
  echo 'Ambiguous legacy migration unexpectedly succeeded.' >&2
  cat ledger-v91-ambiguous-migration.log >&2
  exit 68
fi

if ! grep -q 'issue_91_ambiguous_legacy_ledger_rows' ledger-v91-ambiguous-migration.log; then
  echo 'Ambiguous migration failed for an unexpected reason.' >&2
  cat ledger-v91-ambiguous-migration.log >&2
  exit 69
fi

if [[ "$(psql "$AMBIGUOUS_URL" -Atc "select count(*) from information_schema.columns where table_schema='public' and table_name='LedgerEntry' and column_name='postedAt';")" != "0" ]]; then
  echo 'Fail-closed preflight changed schema before rejecting ambiguity.' >&2
  exit 70
fi

if [[ "$(psql "$AMBIGUOUS_URL" -Atc "select \"posted\"::text from \"LedgerEntry\" where \"id\"='qa91-ambiguous-ledger';")" != "false" ]]; then
  echo 'Fail-closed preflight mutated ambiguous accounting history.' >&2
  exit 71
fi

echo 'ambiguous_backfill_rejection_v91=PASS'
