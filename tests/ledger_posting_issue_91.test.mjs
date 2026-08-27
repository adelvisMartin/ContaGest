import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const schema = read('backend/prisma/schema.prisma');
const service = read('backend/src/modules/accounting/accounting.service.ts');
const routes = read('backend/src/modules/accounting/accounting.routes.ts');
const sales = read('backend/src/modules/sales/sales.routes.ts');
const purchases = read('backend/src/modules/purchases/purchases.routes.ts');
const lifecycleMigration = read('backend/prisma/migrations/20260827060000_issue_91_ledger_posting_immutability/migration.sql');
const periodMigration = read('backend/prisma/migrations/20260827060100_issue_91_ledger_period_gate/migration.sql');
const dbQa = read('qa/postgres-ledger-posting-v91.sql');
const unitQa = read('qa/ledger-posting-v91.test.ts');
const realQa = read('qa/ledger-posting-real-v91.test.ts');
const adr = read('docs/ADR_LEDGER_POSTING_LIFECYCLE_V91.md');
const runbook = read('docs/RUNBOOK_LEDGER_REVERSALS_BACKFILL_V91.md');
const workflow = read('.github/workflows/ledger-posting-v91.yml');

test('schema exposes posting metadata and one-to-one original ↔ reversal linkage', () => {
  assert.match(schema, /postedAt\s+DateTime\?/);
  assert.match(schema, /postedBy\s+String\?/);
  assert.match(schema, /reversalOfId\s+String\?\s+@unique/);
  assert.match(schema, /@relation\("LedgerReversal"/);
  assert.match(schema, /reversedBy\s+LedgerEntry\?/);
  assert.match(schema, /@@index\(\[tenantId, posted, fiscalPeriod\]\)/);
});

test('service centralizes lifecycle, exact balance, tenant scope, atomic audit and reversal', () => {
  assert.match(service, /assertLedgerActionAllowed/);
  assert.match(service, /LedgerLifecycleAction = 'post' \| 'reverse' \| 'edit' \| 'delete'/);
  assert.match(service, /where:\s*\{ id: input\.entryId, tenantId: input\.tenantId \}/);
  assert.match(service, /assertBalanced\(entry\.lines\)/);
  assert.match(service, /assertPeriodOpen\(input\.tenantId/);
  assert.match(service, /action: 'ledger\.entry\.posted'/);
  assert.match(service, /action: 'ledger\.entry\.reversed'/);
  assert.match(service, /reversalOfId: original\.id/);
  assert.match(service, /prisma\.\$transaction/);
  assert.match(service, /updateDraftLedgerEntry/);
  assert.match(service, /deleteDraftLedgerEntry/);
});

test('accounting API exposes draft CRUD, explicit post/reverse and excludes drafts from trial balance', () => {
  assert.match(routes, /source:\s*z\.literal\('manual'\)/);
  assert.match(routes, /router\.patch\('\/entries\/:id'/);
  assert.match(routes, /router\.delete\('\/entries\/:id'/);
  assert.match(routes, /router\.post\('\/entries\/:id\/post'/);
  assert.match(routes, /router\.post\('\/entries\/:id\/reverse'/);
  assert.match(routes, /where:\s*\{ tenantId, posted: true \}/);
});

test('sales and purchases create lines as draft then post and audit inside document transaction', () => {
  for (const [name, source] of [['sales', sales], ['purchases', purchases]]) {
    assert.match(source, /posted:\s*false/);
    assert.match(source, /postedAt:\s*null/);
    assert.match(source, /ledgerEntry\.update|ledgerEntry\.update\(/);
    assert.match(source, /data:\s*\{ posted: true, postedAt, postedBy:/);
    assert.match(source, /action:\s*'ledger\.entry\.posted'/);
    assert.match(source, /action:\s*'ledger\.entry\.reversed'/);
    assert.match(source, /reversalOfId:\s*original\.id/);
    assert.match(source, /reversalFiscalPeriod/);
    assert.ok(source.includes('prisma.$transaction'), `${name} must keep document and ledger effect transactional`);
  }
});

test('PostgreSQL migration is fail-closed and enforces immutable posted ledger below API', () => {
  assert.match(lifecycleMigration, /issue_91_existing_posted_entries_invalid/);
  assert.match(lifecycleMigration, /issue_91_ambiguous_legacy_ledger_rows/);
  assert.match(lifecycleMigration, /issue_91_backfill_candidate_unbalanced/);
  assert.match(lifecycleMigration, /UPDATE "LedgerEntry" le[\s\S]*"source" = 'sales'/);
  assert.match(lifecycleMigration, /UPDATE "LedgerEntry" le[\s\S]*"source" = 'purchase'/);
  assert.match(lifecycleMigration, /ledger_posted_requires_transition/);
  assert.match(lifecycleMigration, /ledger_posted_immutable/);
  assert.match(lifecycleMigration, /ledger_posted_line_immutable/);
  assert.match(lifecycleMigration, /ledger_unbalanced_posting/);
  assert.match(lifecycleMigration, /ledger_reversal_cross_tenant/);
  assert.match(lifecycleMigration, /ledger_reversal_chain_not_allowed/);
  assert.match(lifecycleMigration, /UNIQUE \("reversalOfId"\)/);
  assert.match(periodMigration, /ledger_period_closed/);
  assert.match(periodMigration, /OLD\."posted" = FALSE AND NEW\."posted" = TRUE/);
});

test('DB QA covers immutable header/lines, exact balance, reversals, both tenant directions and closed period', () => {
  for (const marker of [
    'expected_posted_update_rejection',
    'expected_posted_delete_rejection',
    'expected_posted_line_update_rejection',
    'expected_posted_line_delete_rejection',
    'expected_posted_line_insert_rejection',
    'expected_unbalanced_posting_rejection',
    'expected_second_reversal_rejection',
    'expected_reversal_chain_rejection',
    'expected_cross_tenant_reversal_rejection',
    'expected_reverse_cross_tenant_rejection',
    'expected_closed_period_rejection'
  ]) assert.match(dbQa, new RegExp(marker));
  assert.match(dbQa, /BEGIN;[\s\S]*ROLLBACK;/);
});

test('unit and real API QA cover the issue #91 state machine and business flows', () => {
  assert.match(unitQa, /lifecycle allows draft work/);
  assert.match(unitQa, /posted entries are immutable/);
  assert.match(unitQa, /reversal policy rejects reversal chains/);
  assert.match(unitQa, /inverse ledger preserves exact Decimal balance/);

  for (const marker of [
    'DRAFT can be edited',
    'does not affect trial balance',
    'reversal creates a new POSTED inverse',
    'closed period rejects both posting and reversal',
    'issued sale is POSTED atomically',
    'issued purchase is POSTED atomically',
    'tenant A↔B direct IDs',
    'unauthenticated accounting access is denied'
  ]) assert.match(realQa, new RegExp(marker));
});

test('ADR/runbook document state machine, backfill ambiguity, rollback and production authorization boundary', () => {
  assert.match(adr, /DRAFT[\s\S]*POSTED/);
  assert.match(adr, /revers/i);
  assert.match(adr, /inmutable/i);
  assert.match(runbook, /backfill/i);
  assert.match(runbook, /ambigu/i);
  assert.match(runbook, /backup/i);
  assert.match(runbook, /rollback|restore/i);
  assert.match(runbook, /producci/i);
});

test('dedicated workflow runs PostgreSQL 17, migration, unit/API/DB/upgrade and release gates with artifacts', () => {
  assert.match(workflow, /image:\s*postgres:17-alpine/);
  assert.match(workflow, /prisma validate/);
  assert.match(workflow, /prisma:generate/);
  assert.match(workflow, /prisma:deploy/);
  assert.match(workflow, /prisma migrate status/);
  assert.match(workflow, /test:ledger:unit/);
  assert.match(workflow, /test:backend:ledger:real/);
  assert.match(workflow, /postgres-ledger-posting-v91\.sql/);
  assert.match(workflow, /run-ledger-upgrade-v91\.sh/);
  assert.match(workflow, /test:backend:financial:real/);
  assert.match(workflow, /build:backend/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
});
