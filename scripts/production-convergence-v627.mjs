#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
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
} from './production-convergence-v627-core.mjs';

const { Client } = pg;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const EVIDENCE_ROOT = path.join(REPO_ROOT, 'qa', 'evidence', 'database-convergence');
const BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function fail(code, detail) {
  const error = new Error(`${code}:${detail}`);
  error.code = code;
  throw error;
}

function currentSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch (error) {
    fail('PRECHECK_FAILED', `git-head:${error instanceof Error ? error.message : String(error)}`);
  }
}

function databaseUrl() {
  const value = String(process.env.DATABASE_URL || '').trim();
  if (!value) fail('PRECHECK_FAILED', 'DATABASE_URL_REQUIRED');
  return value;
}

function databaseName(rawUrl) {
  try {
    return decodeURIComponent(new URL(rawUrl).pathname.replace(/^\//, '').split('/')[0] || '');
  } catch {
    return '';
  }
}

function isEphemeral(rawUrl) {
  return /(_e2e|_drill|_restore)$/.test(databaseName(rawUrl));
}

function requireProjectRef() {
  const ref = String(process.env.CONTAGEST_PRODUCTION_PROJECT_REF || '').trim();
  if (ref !== PROJECT_REF) fail('PRECHECK_FAILED', `project-ref:expected=${PROJECT_REF}:actual=${ref || 'missing'}`);
  return ref;
}

function requireProductionApplyConsent(repoSha) {
  const expected = `APPLY_627_${PROJECT_REF}_${repoSha.slice(0, 12)}`;
  if (process.env.CONTAGEST_ALLOW_PRODUCTION_CONVERGENCE !== expected) {
    fail('PRECHECK_FAILED', 'production-apply-consent-missing');
  }
}

async function loadBackupEvidence(repoSha) {
  const target = String(process.env.CONTAGEST_BACKUP_EVIDENCE || '').trim();
  if (!target) fail('BACKUP_NOT_VERIFIED', 'CONTAGEST_BACKUP_EVIDENCE_REQUIRED');
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path.resolve(REPO_ROOT, target), 'utf8'));
  } catch (error) {
    fail('BACKUP_NOT_VERIFIED', `evidence-read:${error instanceof Error ? error.message : String(error)}`);
  }
  assertBackupEvidence(parsed, { repoSha, projectRef: PROJECT_REF, maxAgeMs: BACKUP_MAX_AGE_MS });
  return parsed;
}

async function loadSqlPlan(repoSha) {
  const steps = [];
  for (const step of PLAN_STEPS) {
    const absolute = path.join(REPO_ROOT, step.source);
    let sql = await readFile(absolute, 'utf8');
    if (step.projection === 'tenant-uuid-to-text-only') sql = projectDataLifecycleSql(sql);
    assertSafeCanonicalSql(step.id, sql);
    steps.push({ ...step, sql, sha256: crypto.createHash('sha256').update(sql).digest('hex') });
  }
  const plan = buildPlan({ repoSha, projectRef: PROJECT_REF });
  return {
    ...plan,
    steps: steps.map(({ sql, requiredObjects, ...step }) => ({ ...step, requiredObjects: [...requiredObjects] })),
    sqlDigest: stableSha256(steps.map(({ id, sha256 }) => ({ id, sha256 }))),
    sqlSteps: steps
  };
}

function observationsFromRow(row) {
  const parsed = row?.target_objects && typeof row.target_objects === 'object' ? row.target_objects : {};
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, Boolean(value)]));
}

const PREFLIGHT_SQL = `
WITH target_objects AS (
  SELECT jsonb_object_agg(key, present) AS value
  FROM (
    SELECT 'column:LedgerEntry.postedAt' AS key, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='LedgerEntry' AND column_name='postedAt') AS present
    UNION ALL SELECT 'column:LedgerEntry.postedBy', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='LedgerEntry' AND column_name='postedBy')
    UNION ALL SELECT 'column:LedgerEntry.reversalOfId', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='LedgerEntry' AND column_name='reversalOfId')
    UNION ALL SELECT 'function:guard_ledger_entry_lifecycle', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='guard_ledger_entry_lifecycle')
    UNION ALL SELECT 'function:guard_posted_ledger_line_mutation', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='guard_posted_ledger_line_mutation')
    UNION ALL SELECT 'function:guard_ledger_posting_period_open', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='guard_ledger_posting_period_open')
    UNION ALL SELECT 'trigger:LedgerEntry_lifecycle_guard', EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='LedgerEntry_lifecycle_guard')
    UNION ALL SELECT 'trigger:LedgerLine_posted_guard', EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='LedgerLine_posted_guard')
    UNION ALL SELECT 'trigger:LedgerEntry_period_gate', EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='LedgerEntry_period_gate')
    UNION ALL SELECT 'table:FinancialFxPolicy', to_regclass('public."FinancialFxPolicy"') IS NOT NULL
    UNION ALL SELECT 'table:FinancialFxDocumentSnapshot', to_regclass('public."FinancialFxDocumentSnapshot"') IS NOT NULL
    UNION ALL SELECT 'table:FinancialFxLedgerLineSnapshot', to_regclass('public."FinancialFxLedgerLineSnapshot"') IS NOT NULL
    UNION ALL SELECT 'table:FinancialFxBankAccountMap', to_regclass('public."FinancialFxBankAccountMap"') IS NOT NULL
    UNION ALL SELECT 'table:FinancialFxEvent', to_regclass('public."FinancialFxEvent"') IS NOT NULL
    UNION ALL SELECT 'table:FiscalRuleVersion', to_regclass('public."FiscalRuleVersion"') IS NOT NULL
    UNION ALL SELECT 'table:FiscalSequence', to_regclass('public."FiscalSequence"') IS NOT NULL
    UNION ALL SELECT 'table:FiscalDocumentRuleSnapshot', to_regclass('public."FiscalDocumentRuleSnapshot"') IS NOT NULL
    UNION ALL SELECT 'table:FiscalCloseEvidence', to_regclass('public."FiscalCloseEvidence"') IS NOT NULL
    UNION ALL SELECT 'table:DataRetentionPolicyVersion', to_regclass('public."DataRetentionPolicyVersion"') IS NOT NULL
    UNION ALL SELECT 'table:DataLegalHold', to_regclass('public."DataLegalHold"') IS NOT NULL
    UNION ALL SELECT 'table:DataLifecycleJob', to_regclass('public."DataLifecycleJob"') IS NOT NULL
    UNION ALL SELECT 'table:DataLifecycleEvidence', to_regclass('public."DataLifecycleEvidence"') IS NOT NULL
    UNION ALL SELECT 'table:DataStorageObject', to_regclass('public."DataStorageObject"') IS NOT NULL
    UNION ALL SELECT 'function:data_lifecycle_assert_not_held', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='data_lifecycle_assert_not_held')
    UNION ALL SELECT 'function:data_lifecycle_evidence_immutable', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='data_lifecycle_evidence_immutable')
    UNION ALL SELECT 'function:data_lifecycle_hold_guard', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='data_lifecycle_hold_guard')
    UNION ALL SELECT 'function:data_lifecycle_policy_guard', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='data_lifecycle_policy_guard')
    UNION ALL SELECT 'function:data_lifecycle_protected_delete_guard', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='data_lifecycle_protected_delete_guard')
    UNION ALL SELECT 'function:data_lifecycle_storage_no_delete', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='data_lifecycle_storage_no_delete')
    UNION ALL SELECT 'trigger:DataLegalHold_guard_trg', EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='DataLegalHold_guard_trg')
    UNION ALL SELECT 'trigger:DataLifecycleEvidence_immutable_trg', EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='DataLifecycleEvidence_immutable_trg')
    UNION ALL SELECT 'trigger:DataRetentionPolicyVersion_guard_trg', EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='DataRetentionPolicyVersion_guard_trg')
    UNION ALL SELECT 'trigger:DataStorageObject_no_delete_trg', EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='DataStorageObject_no_delete_trg')
  ) q
), activity AS (
  SELECT count(*) FILTER (WHERE wait_event_type='Lock')::int AS waiting_locks,
         COALESCE(max(EXTRACT(EPOCH FROM (now()-xact_start))) FILTER (WHERE xact_start IS NOT NULL AND pid<>pg_backend_pid()),0)::bigint AS max_tx_age_seconds
  FROM pg_stat_activity
), public_stats AS (
  SELECT count(*)::int AS table_count,
         COALESCE(sum(pg_total_relation_size(c.oid)),0)::bigint AS total_bytes
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
), critical_counts AS (
  SELECT jsonb_build_object(
    'Tenant', (SELECT count(*) FROM "Tenant"),
    'UserProfile', (SELECT count(*) FROM "UserProfile"),
    'Product', (SELECT count(*) FROM "Product"),
    'SalesInvoice', (SELECT count(*) FROM "SalesInvoice"),
    'PurchaseInvoice', (SELECT count(*) FROM "PurchaseInvoice"),
    'LedgerEntry', (SELECT count(*) FROM "LedgerEntry"),
    'LedgerLine', (SELECT count(*) FROM "LedgerLine")
  ) AS value
), ledger AS (
  SELECT count(*)::int AS entries,
         count(*) FILTER (WHERE le."posted"=FALSE AND le."source"='sales'::"LedgerSource" AND EXISTS (
           SELECT 1 FROM "SalesInvoice" s WHERE s."tenantId"=le."tenantId" AND s."status" IN ('issued'::"InvoiceStatus",'paid'::"InvoiceStatus",'overdue'::"InvoiceStatus") AND (s."id"=le."salesInvoiceId" OR (le."salesInvoiceId" IS NULL AND s."id"=le."sourceId"))
         ))::int AS safe_sales,
         count(*) FILTER (WHERE le."posted"=FALSE AND le."source"='purchase'::"LedgerSource" AND EXISTS (
           SELECT 1 FROM "PurchaseInvoice" p WHERE p."tenantId"=le."tenantId" AND p."status" IN ('issued'::"InvoiceStatus",'paid'::"InvoiceStatus",'overdue'::"InvoiceStatus") AND (p."id"=le."purchaseInvoiceId" OR (le."purchaseInvoiceId" IS NULL AND p."id"=le."sourceId"))
         ))::int AS safe_purchases
  FROM "LedgerEntry" le
), ambiguous AS (
  SELECT
    (SELECT count(*) FROM (
      SELECT le."id" FROM "LedgerEntry" le LEFT JOIN "LedgerLine" ll ON ll."entryId"=le."id"
      WHERE le."posted"=TRUE GROUP BY le."id"
      HAVING count(ll."id")<2 OR COALESCE(sum(ll."debit"),0)<>COALESCE(sum(ll."credit"),0)
         OR count(*) FILTER (WHERE ll."debit"<0 OR ll."credit"<0 OR (ll."debit"<>0 AND ll."credit"<>0))>0
    ) x)::int
    + (SELECT count(*) FROM "LedgerEntry" le WHERE le."posted"=FALSE AND le."source"='sales'::"LedgerSource" AND NOT EXISTS (
      SELECT 1 FROM "SalesInvoice" s WHERE s."tenantId"=le."tenantId" AND s."status" IN ('issued'::"InvoiceStatus",'paid'::"InvoiceStatus",'overdue'::"InvoiceStatus") AND (s."id"=le."salesInvoiceId" OR (le."salesInvoiceId" IS NULL AND s."id"=le."sourceId"))))::int
    + (SELECT count(*) FROM "LedgerEntry" le WHERE le."posted"=FALSE AND le."source"='purchase'::"LedgerSource" AND NOT EXISTS (
      SELECT 1 FROM "PurchaseInvoice" p WHERE p."tenantId"=le."tenantId" AND p."status" IN ('issued'::"InvoiceStatus",'paid'::"InvoiceStatus",'overdue'::"InvoiceStatus") AND (p."id"=le."purchaseInvoiceId" OR (le."purchaseInvoiceId" IS NULL AND p."id"=le."sourceId"))))::int
    + (SELECT count(*) FROM "LedgerEntry" le WHERE le."posted"=FALSE AND le."source"='manual'::"LedgerSource" AND (
      (le."salesInvoiceId" IS NOT NULL AND EXISTS (SELECT 1 FROM "SalesInvoice" s WHERE s."id"=le."salesInvoiceId" AND s."tenantId"=le."tenantId" AND s."status"='cancelled'::"InvoiceStatus")) OR
      (le."purchaseInvoiceId" IS NOT NULL AND EXISTS (SELECT 1 FROM "PurchaseInvoice" p WHERE p."id"=le."purchaseInvoiceId" AND p."tenantId"=le."tenantId" AND p."status"='cancelled'::"InvoiceStatus")) OR le."sourceId" LIKE 'sales-cancel:%' OR le."sourceId" LIKE 'purchase-cancel:%'))::int AS count
)
SELECT current_setting('server_version') AS postgres_version,
       (SELECT value FROM target_objects) AS target_objects,
       (SELECT waiting_locks FROM activity) AS waiting_locks,
       (SELECT max_tx_age_seconds FROM activity) AS max_tx_age_seconds,
       (SELECT table_count FROM public_stats) AS public_table_count,
       (SELECT total_bytes FROM public_stats) AS public_bytes,
       (SELECT value FROM critical_counts) AS critical_counts,
       (SELECT entries FROM ledger) AS ledger_entries,
       (SELECT safe_sales FROM ledger) AS safe_sales_candidates,
       (SELECT safe_purchases FROM ledger) AS safe_purchase_candidates,
       (SELECT count FROM ambiguous) AS ambiguous_ledger_rows;
`;

async function inspect(rawUrl, { readOnly = true } = {}) {
  const client = new Client({ connectionString: rawUrl, application_name: 'contagest-v627-preflight' });
  await client.connect();
  try {
    await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '3s'");
    const result = await client.query(PREFLIGHT_SQL);
    await client.query('ROLLBACK');
    const row = result.rows[0];
    const observations = observationsFromRow(row);
    const driftState = assertExpectedPrestate(observations);
    if (!String(row.postgres_version || '').startsWith('17.')) fail('PRECHECK_FAILED', `postgres-version=${row.postgres_version}`);
    if (Number(row.waiting_locks) > 0 || Number(row.max_tx_age_seconds) > 60) {
      fail('MIGRATION_LOCK_RISK', `waiting=${row.waiting_locks}:maxTxAge=${row.max_tx_age_seconds}`);
    }
    if (Number(row.ambiguous_ledger_rows) > 0) fail('PRECHECK_FAILED', `ambiguous-ledger=${row.ambiguous_ledger_rows}`);
    const evidence = buildSafeEvidence({
      repoSha: currentSha(),
      postgresVersion: row.postgres_version,
      publicTableCount: row.public_table_count,
      publicBytes: row.public_bytes,
      activeLongTransactions: Number(row.max_tx_age_seconds) > 60 ? 1 : 0,
      waitingLocks: row.waiting_locks,
      ledger: {
        entries: row.ledger_entries,
        safeSalesCandidates: row.safe_sales_candidates,
        safePurchaseCandidates: row.safe_purchase_candidates,
        ambiguous: row.ambiguous_ledger_rows
      },
      criticalCounts: row.critical_counts || {},
      driftState
    });
    return { row, observations, driftState, evidence };
  } finally {
    await client.end();
  }
}

async function writeEvidence(kind, repoSha, value) {
  await mkdir(EVIDENCE_ROOT, { recursive: true });
  const target = path.join(EVIDENCE_ROOT, `issue-627-${kind}-${repoSha.slice(0, 12)}.json`);
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return path.relative(REPO_ROOT, target).replaceAll('\\', '/');
}

async function planCommand() {
  const repoSha = currentSha();
  const loaded = await loadSqlPlan(repoSha);
  const artifact = {
    version: 627,
    candidateSha: repoSha,
    projectRef: PROJECT_REF,
    sqlDigest: loaded.sqlDigest,
    plan: buildPlan({ repoSha }),
    sources: loaded.steps.map((step) => ({ id: step.id, source: step.source, projection: step.projection, sha256: step.sha256 }))
  };
  const file = await writeEvidence('plan', repoSha, artifact);
  console.log(`[v627] PLAN_READY sha=${repoSha} digest=${loaded.sqlDigest} evidence=${file}`);
  return artifact;
}

async function preflightCommand() {
  requireProjectRef();
  const repoSha = currentSha();
  const expected = String(process.env.CONTAGEST_CANDIDATE_SHA || repoSha).trim();
  assertExactCandidate(expected, repoSha);
  const result = await inspect(databaseUrl());
  const artifact = { ...result.evidence, targetObjectDigest: stableSha256(result.observations) };
  const file = await writeEvidence('preflight', repoSha, artifact);
  console.log(`[v627] PREFLIGHT_PASS state=${result.driftState} evidence=${file}`);
  return result;
}

async function verifyLifecycleTypes(client) {
  const names = ['DataRetentionPolicyVersion','DataLegalHold','DataLifecycleJob','DataLifecycleEvidence','DataStorageObject'];
  const result = await client.query(
    `select table_name, data_type, udt_name from information_schema.columns where table_schema='public' and column_name='tenantId' and table_name = any($1::text[]) order by table_name`,
    [names]
  );
  if (result.rows.length !== names.length || result.rows.some((row) => row.data_type !== 'text' && row.udt_name !== 'text')) {
    fail('SCHEMA_POSTCHECK_FAILED', 'data-lifecycle-tenant-type');
  }
}

async function verifyCommand() {
  requireProjectRef();
  const repoSha = currentSha();
  const rawUrl = databaseUrl();
  const checked = await inspect(rawUrl);
  if (checked.driftState !== 'already-converged') fail('SCHEMA_POSTCHECK_FAILED', checked.driftState);
  const client = new Client({ connectionString: rawUrl, application_name: 'contagest-v627-verify' });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await verifyLifecycleTypes(client);
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
  const artifact = { ...checked.evidence, targetObjectDigest: stableSha256(checked.observations), verified: true };
  const file = await writeEvidence('postcheck', repoSha, artifact);
  console.log(`[v627] POSTCHECK_PASS evidence=${file}`);
  return artifact;
}

async function applyCommand() {
  requireProjectRef();
  const repoSha = currentSha();
  const expected = String(process.env.CONTAGEST_CANDIDATE_SHA || '').trim();
  assertExactCandidate(expected, repoSha);
  const rawUrl = databaseUrl();
  const ephemeral = isEphemeral(rawUrl);
  if (!ephemeral) {
    requireProductionApplyConsent(repoSha);
    await loadBackupEvidence(repoSha);
  }
  const pre = await inspect(rawUrl);
  if (pre.driftState === 'already-converged') {
    console.log('[v627] ALREADY_CONVERGED');
    return verifyCommand();
  }
  if (pre.driftState !== 'needs-convergence') fail('PRODUCTION_DRIFT_CHANGED', pre.driftState);

  const loaded = await loadSqlPlan(repoSha);
  const client = new Client({ connectionString: rawUrl, application_name: 'contagest-v627-apply' });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '10min'");
    for (const step of loaded.sqlSteps) {
      console.log(`[v627] APPLY_STEP ${step.id} sha256=${step.sha256}`);
      await client.query(step.sql);
      if (ephemeral && process.env.CONTAGEST_V627_FAIL_AFTER_STEP === step.id) {
        fail('BACKFILL_FAILED', `injected-after=${step.id}`);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    if (error?.code && String(error.code).startsWith('BACKFILL_')) throw error;
    fail('RECOVERY_REQUIRED', error instanceof Error ? error.message : String(error));
  } finally {
    await client.end();
  }
  return verifyCommand();
}

async function backupEvidenceCommand() {
  const repoSha = currentSha();
  requireProjectRef();
  const backupFile = String(process.env.CONTAGEST_BACKUP_FILE || '').trim();
  const restoreUrl = String(process.env.CONTAGEST_RESTORE_DATABASE_URL || '').trim();
  if (!backupFile || !restoreUrl || !isEphemeral(restoreUrl)) fail('BACKUP_NOT_VERIFIED', 'backup-file-and-ephemeral-restore-required');
  const bytes = await readFile(path.resolve(REPO_ROOT, backupFile));
  const artifactSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const source = await inspect(databaseUrl());
  const restored = await inspect(restoreUrl);
  const comparable = ['publicTableCount', 'ledger', 'criticalCounts'];
  for (const key of comparable) {
    if (JSON.stringify(source.evidence[key]) !== JSON.stringify(restored.evidence[key])) {
      fail('BACKUP_NOT_VERIFIED', `restore-mismatch=${key}`);
    }
  }
  const now = new Date().toISOString();
  const evidence = {
    projectRef: PROJECT_REF,
    candidateSha: repoSha,
    kind: 'pg_dump-custom',
    artifactSha256,
    completedAt: now,
    restoreVerified: true,
    restoreVerifiedAt: now,
    location: `operator-offsite://${path.basename(backupFile)}`,
    aggregateDigest: stableSha256({ source: source.evidence, restored: restored.evidence })
  };
  assertBackupEvidence(evidence, { repoSha, projectRef: PROJECT_REF });
  const file = await writeEvidence('backup', repoSha, evidence);
  console.log(`[v627] BACKUP_VERIFIED sha256=${artifactSha256} evidence=${file}`);
  return evidence;
}

async function main() {
  const [command = 'plan'] = process.argv.slice(2);
  if (command === 'plan') return planCommand();
  if (command === 'preflight') return preflightCommand();
  if (command === 'verify') return verifyCommand();
  if (command === 'apply') return applyCommand();
  if (command === 'backup-evidence') return backupEvidenceCommand();
  fail('PRECHECK_FAILED', `unknown-command=${command}`);
}

main().catch((error) => {
  console.error('[v627]', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});