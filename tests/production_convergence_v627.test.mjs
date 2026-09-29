import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ERROR_CATALOG,
  PLAN_STEPS,
  PROJECT_REF,
  assertBackupEvidence,
  assertExactCandidate,
  assertExpectedPrestate,
  assertSafeCanonicalSql,
  buildPlan,
  buildSafeEvidence,
  projectDataLifecycleSql,
  stableSha256
} from '../scripts/production-convergence-v627-core.mjs';

const SHA = 'a'.repeat(40);
const HASH = 'b'.repeat(64);

test('error catalog is complete and stable', () => {
  assert.deepEqual(ERROR_CATALOG, [
    'PRODUCTION_DRIFT_CHANGED',
    'BACKUP_NOT_VERIFIED',
    'PRECHECK_FAILED',
    'MIGRATION_LOCK_RISK',
    'BACKFILL_FAILED',
    'BACKFILL_RECONCILIATION_FAILED',
    'TENANT_ISOLATION_REGRESSION',
    'SCHEMA_POSTCHECK_FAILED',
    'APPLICATION_COMPATIBILITY_FAILED',
    'RECOVERY_REQUIRED'
  ]);
});

test('plan uses canonical historical sources without a second DDL authority', () => {
  assert.deepEqual(PLAN_STEPS.map((step) => step.source), [
    'backend/prisma/migrations/20260827060000_issue_91_ledger_posting_immutability/migration.sql',
    'backend/prisma/migrations/20260827060100_issue_91_ledger_period_gate/migration.sql',
    'backend/prisma/migrations/20260927130000_financial_fx_v560/migration.sql',
    'backend/prisma/migrations/20260927143000_fiscal_authority_v561/migration.sql',
    'backend/prisma/migrations/20260927152000_data_lifecycle_v562/migration.sql'
  ]);
  assert.equal(new Set(PLAN_STEPS.map((step) => step.source)).size, PLAN_STEPS.length);
  const periodGate = PLAN_STEPS.find((step) => step.id === 'ledger-period-gate-v91');
  assert.ok(periodGate);
  assert.deepEqual(periodGate.requiredObjects, [
    'function:guard_ledger_posting_period_open',
    'trigger:LedgerEntry_period_gate'
  ]);
});

test('production backup gate fails closed and binds backup to exact SHA/project', () => {
  assert.throws(() => assertBackupEvidence(null, { repoSha: SHA, projectRef: PROJECT_REF }), /BACKUP_NOT_VERIFIED/);
  assert.throws(() => assertBackupEvidence({ restoreVerified: true }, { repoSha: SHA, projectRef: PROJECT_REF }), /BACKUP_NOT_VERIFIED/);
  const valid = {
    projectRef: PROJECT_REF,
    candidateSha: SHA,
    kind: 'pg_dump-custom',
    artifactSha256: HASH,
    completedAt: '2026-09-29T14:00:00.000Z',
    restoreVerified: true,
    restoreVerifiedAt: '2026-09-29T14:30:00.000Z',
    location: 'operator-offsite://contagest/2026-09-29'
  };
  assert.doesNotThrow(() => assertBackupEvidence(valid, {
    repoSha: SHA,
    projectRef: PROJECT_REF,
    now: new Date('2026-09-29T15:00:00.000Z')
  }));
  assert.throws(() => assertBackupEvidence({ ...valid, candidateSha: 'c'.repeat(40) }, {
    repoSha: SHA,
    projectRef: PROJECT_REF,
    now: new Date('2026-09-29T15:00:00.000Z')
  }), /BACKUP_NOT_VERIFIED/);
});

test('exact candidate binding rejects stale plans', () => {
  assert.doesNotThrow(() => assertExactCandidate(SHA, SHA));
  assert.throws(() => assertExactCandidate(SHA, 'c'.repeat(40)), /PRODUCTION_DRIFT_CHANGED/);
});

test('audited production prestate is all-missing or already converged, never partial', () => {
  const missing = Object.fromEntries(PLAN_STEPS.flatMap((step) => step.requiredObjects).map((name) => [name, false]));
  assert.equal(assertExpectedPrestate(missing), 'needs-convergence');
  const converged = Object.fromEntries(Object.keys(missing).map((name) => [name, true]));
  assert.equal(assertExpectedPrestate(converged), 'already-converged');
  const partial = { ...missing, [Object.keys(missing)[0]]: true };
  assert.throws(() => assertExpectedPrestate(partial), /PRODUCTION_DRIFT_CHANGED/);
});

test('data lifecycle projection changes only incompatible tenant UUID boundary', () => {
  const source = `
    CREATE TABLE "DataRetentionPolicyVersion" ("tenantId" UUID NOT NULL);
    CREATE TABLE "DataLegalHold" ("tenantId" UUID NOT NULL);
    CREATE TABLE "DataLifecycleJob" ("tenantId" UUID NOT NULL);
    CREATE TABLE "DataLifecycleEvidence" ("tenantId" UUID NOT NULL);
    CREATE TABLE "DataStorageObject" ("tenantId" UUID NOT NULL);
    CREATE FUNCTION data_lifecycle_assert_not_held(p_tenantId UUID) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
  `;
  const projected = projectDataLifecycleSql(source);
  assert.equal((projected.match(/"tenantId"\s+TEXT\b/gi) || []).length, 5);
  assert.match(projected, /p_tenantId\s+TEXT\b/i);
  assert.doesNotMatch(projected, /"tenantId"\s+UUID\b/i);
});

test('canonical SQL safety rejects destructive/data-erasing commands but allows trigger replacement', () => {
  assert.doesNotThrow(() => assertSafeCanonicalSql('ledger', 'ALTER TABLE "LedgerEntry" ADD COLUMN x TEXT; DROP TRIGGER IF EXISTS t ON "LedgerEntry";'));
  for (const sql of [
    'DROP TABLE "Tenant";',
    'DROP SCHEMA public CASCADE;',
    'TRUNCATE TABLE "Tenant";',
    'DELETE FROM "Tenant";',
    'ALTER TABLE "Tenant" DROP COLUMN name;',
    'ALTER TABLE "Tenant" ALTER COLUMN id TYPE uuid;'
  ]) {
    assert.throws(() => assertSafeCanonicalSql('unsafe', sql), /PRECHECK_FAILED/);
  }
});

test('plan is deterministic and includes recovery classes', () => {
  const a = buildPlan({ repoSha: SHA });
  const b = buildPlan({ repoSha: SHA });
  assert.equal(stableSha256(a), stableSha256(b));
  assert.equal(a.projectRef, PROJECT_REF);
  assert.ok(a.steps.every((step) => ['ROLLBACK_APP_ONLY', 'FORWARD_FIX_REQUIRED'].includes(step.recovery)));
});

test('safe evidence only contains aggregate operational metadata', () => {
  const evidence = buildSafeEvidence({
    repoSha: SHA,
    postgresVersion: '17.6',
    publicTableCount: 113,
    publicBytes: 12345,
    activeLongTransactions: 0,
    waitingLocks: 0,
    ledger: { entries: 7, safeSalesCandidates: 3, safePurchaseCandidates: 0, ambiguous: 0 },
    criticalCounts: { Tenant: 1, UserProfile: 2, SalesInvoice: 3 },
    driftState: 'needs-convergence'
  });
  assert.equal(evidence.ledger.entries, 7);
  assert.deepEqual(evidence.criticalCounts, { SalesInvoice: 3, Tenant: 1, UserProfile: 2 });
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /\"(?:password|databaseUrl|jwt|email|rif|patient|payload)\"\s*:/i);
});

test('post-convergence hardening fixes advisor findings without opening RLS', async () => {
  const sql = await readFile(new URL('../backend/prisma/migrations/20260929164500_issue_627_production_convergence_hardening/migration.sql', import.meta.url), 'utf8');
  assert.doesNotThrow(() => assertSafeCanonicalSql('issue-627-hardening', sql));
  for (const name of [
    'guard_ledger_entry_lifecycle',
    'guard_posted_ledger_line_mutation',
    'guard_ledger_posting_period_open',
    'data_lifecycle_policy_guard',
    'data_lifecycle_hold_guard',
    'data_lifecycle_evidence_immutable',
    'data_lifecycle_storage_no_delete',
    'data_lifecycle_protected_delete_guard'
  ]) {
    assert.match(sql, new RegExp(`ALTER FUNCTION public\\.${name}\\(\\)[\\s\\S]*?SET search_path = public, pg_temp;`));
  }
  assert.match(sql, /ALTER FUNCTION public\.data_lifecycle_assert_not_held\(text, text, text\)[\s\S]*?SET search_path = public, pg_temp;/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS "DataLifecycleEvidence_jobId_idx"/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS "FinancialFxBankAccountMap_bankAccountId_idx"/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS "FiscalCloseEvidence_closingPeriodId_idx"/);
  assert.doesNotMatch(sql, /CREATE\s+POLICY|DISABLE\s+ROW\s+LEVEL\s+SECURITY|GRANT[\s\S]+\bTO\s+(?:anon|authenticated)\b/i);
});
