import crypto from 'node:crypto';

export const PROJECT_REF = 'soxzatxiwlfsvtblrqal';
export const ERROR_CATALOG = Object.freeze([
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

export const PLAN_STEPS = Object.freeze([
  Object.freeze({
    id: 'ledger-lifecycle-v91',
    source: 'backend/prisma/migrations/20260827060000_issue_91_ledger_posting_immutability/migration.sql',
    projection: 'none',
    recovery: 'FORWARD_FIX_REQUIRED',
    dataEffect: 'Posts only unambiguous issued/paid/overdue sales/purchase legacy entries after fail-closed balance checks.',
    requiredObjects: Object.freeze([
      'column:LedgerEntry.postedAt',
      'column:LedgerEntry.postedBy',
      'column:LedgerEntry.reversalOfId',
      'function:guard_ledger_entry_lifecycle',
      'function:guard_posted_ledger_line_mutation',
      'trigger:LedgerEntry_lifecycle_guard',
      'trigger:LedgerLine_posted_guard'
    ])
  }),
  Object.freeze({
    id: 'ledger-period-gate-v91',
    source: 'backend/prisma/migrations/20260827060100_issue_91_ledger_period_gate/migration.sql',
    projection: 'none',
    recovery: 'FORWARD_FIX_REQUIRED',
    dataEffect: 'No row backfill; adds the closed-accounting-period posting guard.',
    requiredObjects: Object.freeze([
      'function:guard_ledger_posting_period_open',
      'trigger:LedgerEntry_period_gate'
    ])
  }),
  Object.freeze({
    id: 'financial-fx-v560',
    source: 'backend/prisma/migrations/20260927130000_financial_fx_v560/migration.sql',
    projection: 'none',
    recovery: 'FORWARD_FIX_REQUIRED',
    dataEffect: 'Additive FX authority tables and constraints.',
    requiredObjects: Object.freeze([
      'table:FinancialFxPolicy',
      'table:FinancialFxDocumentSnapshot',
      'table:FinancialFxLedgerLineSnapshot',
      'table:FinancialFxBankAccountMap',
      'table:FinancialFxEvent'
    ])
  }),
  Object.freeze({
    id: 'fiscal-authority-v561',
    source: 'backend/prisma/migrations/20260927143000_fiscal_authority_v561/migration.sql',
    projection: 'none',
    recovery: 'FORWARD_FIX_REQUIRED',
    dataEffect: 'Additive fiscal authority tables, constraints and functions.',
    requiredObjects: Object.freeze([
      'table:FiscalRuleVersion',
      'table:FiscalSequence',
      'table:FiscalDocumentRuleSnapshot',
      'table:FiscalCloseEvidence'
    ])
  }),
  Object.freeze({
    id: 'data-lifecycle-v562-text-compat',
    source: 'backend/prisma/migrations/20260927152000_data_lifecycle_v562/migration.sql',
    projection: 'tenant-uuid-to-text-only',
    recovery: 'FORWARD_FIX_REQUIRED',
    dataEffect: 'Additive retention/legal-hold/evidence/storage objects with Tenant.id TEXT compatibility projection.',
    requiredObjects: Object.freeze([
      'table:DataRetentionPolicyVersion',
      'table:DataLegalHold',
      'table:DataLifecycleJob',
      'table:DataLifecycleEvidence',
      'table:DataStorageObject',
      'function:data_lifecycle_assert_not_held',
      'function:data_lifecycle_evidence_immutable',
      'function:data_lifecycle_hold_guard',
      'function:data_lifecycle_policy_guard',
      'function:data_lifecycle_protected_delete_guard',
      'function:data_lifecycle_storage_no_delete',
      'trigger:DataLegalHold_guard_trg',
      'trigger:DataLifecycleEvidence_immutable_trg',
      'trigger:DataRetentionPolicyVersion_guard_trg',
      'trigger:DataStorageObject_no_delete_trg'
    ])
  })
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)])
    );
  }
  return value;
}

export function stableSha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function fail(code, detail) {
  const error = new Error(`${code}:${detail}`);
  error.code = code;
  throw error;
}

export function assertExactCandidate(expectedSha, actualSha) {
  if (!/^[0-9a-f]{40}$/i.test(String(expectedSha || '')) || expectedSha !== actualSha) {
    fail('PRODUCTION_DRIFT_CHANGED', `candidate-sha:expected=${expectedSha || 'missing'}:actual=${actualSha || 'missing'}`);
  }
}

export function assertBackupEvidence(evidence, {
  repoSha,
  projectRef = PROJECT_REF,
  now = new Date(),
  maxAgeMs = 24 * 60 * 60 * 1000
} = {}) {
  const e = evidence && typeof evidence === 'object' ? evidence : null;
  if (!e) fail('BACKUP_NOT_VERIFIED', 'missing-evidence');
  const validKind = new Set(['pg_dump-custom', 'platform-snapshot', 'verified-logical-backup']);
  const completed = Date.parse(String(e.completedAt || ''));
  const restored = Date.parse(String(e.restoreVerifiedAt || ''));
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now));
  const location = String(e.location || '');
  const valid =
    e.projectRef === projectRef &&
    e.candidateSha === repoSha &&
    validKind.has(e.kind) &&
    /^[0-9a-f]{64}$/i.test(String(e.artifactSha256 || '')) &&
    e.restoreVerified === true &&
    Number.isFinite(completed) &&
    Number.isFinite(restored) &&
    completed <= restored &&
    restored <= nowMs + 5 * 60 * 1000 &&
    nowMs - completed <= maxAgeMs &&
    location.length >= 8 &&
    !/(password|secret|token|jwt|postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@)/i.test(location);
  if (!valid) fail('BACKUP_NOT_VERIFIED', 'evidence-invalid-or-stale');
  return true;
}

export function assertExpectedPrestate(objects) {
  const names = [...new Set(PLAN_STEPS.flatMap((step) => step.requiredObjects))];
  const values = names.map((name) => objects?.[name]);
  if (values.some((value) => typeof value !== 'boolean')) {
    fail('PRODUCTION_DRIFT_CHANGED', 'missing-target-object-observation');
  }
  if (values.every((value) => value === false)) return 'needs-convergence';
  if (values.every((value) => value === true)) return 'already-converged';
  const present = names.filter((name) => objects[name] === true);
  const missing = names.filter((name) => objects[name] === false);
  fail('PRODUCTION_DRIFT_CHANGED', `partial-target-state:present=${present.length}:missing=${missing.length}`);
}

export function projectDataLifecycleSql(source) {
  let tenantColumnReplacements = 0;
  let tenantParameterReplacements = 0;
  const projected = String(source)
    .replace(/"tenantId"\s+uuid\b/gi, (match) => {
      tenantColumnReplacements += 1;
      return match.replace(/uuid\b/i, 'TEXT');
    })
    .replace(/\bp_tenant\w*\s+uuid\b/gi, (match) => {
      tenantParameterReplacements += 1;
      return match.replace(/uuid\b/i, 'TEXT');
    });
  if (tenantColumnReplacements < 5 || tenantParameterReplacements < 1) {
    fail('PRECHECK_FAILED', `data-lifecycle-projection-signatures:columns=${tenantColumnReplacements}:params=${tenantParameterReplacements}`);
  }
  if (/"tenantId"\s+uuid\b/i.test(projected) || /\bp_tenant\w*\s+uuid\b/i.test(projected)) {
    fail('PRECHECK_FAILED', 'data-lifecycle-uuid-signature-remains');
  }
  return projected;
}

export function assertSafeCanonicalSql(stepId, sql) {
  const source = String(sql || '');
  const forbidden = [
    /\bDROP\s+TABLE\b/i,
    /\bDROP\s+SCHEMA\b/i,
    /\bTRUNCATE\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bALTER\s+TABLE\b[\s\S]{0,180}\bDROP\s+COLUMN\b/i,
    /\bALTER\s+TABLE\b[\s\S]{0,180}\bALTER\s+COLUMN\b[\s\S]{0,120}\bTYPE\b/i,
    /\bDROP\s+DATABASE\b/i,
    /\bCREATE\s+DATABASE\b/i,
    /\bdb\s+(?:push|reset)\b/i
  ];
  const hit = forbidden.find((pattern) => pattern.test(source));
  if (hit) fail('PRECHECK_FAILED', `${stepId}:unsafe-sql:${hit.source}`);
  return true;
}

export function buildPlan({ repoSha, projectRef = PROJECT_REF } = {}) {
  if (!/^[0-9a-f]{40}$/i.test(String(repoSha || ''))) fail('PRECHECK_FAILED', 'candidate-sha-invalid');
  return {
    version: 627,
    projectRef,
    candidateSha: repoSha,
    postgresMajor: 17,
    authority: 'backend/prisma/migrations',
    atomicApply: true,
    backupRequired: true,
    abort: {
      waitingLocksAbove: 0,
      transactionAgeSecondsAbove: 60,
      driftChanged: true,
      ambiguousLedgerRowsAbove: 0
    },
    steps: PLAN_STEPS.map(({ requiredObjects, ...step }) => ({ ...step, requiredObjects: [...requiredObjects] })),
    recovery: {
      beforeCommit: 'ROLLBACK_APP_ONLY',
      afterCommit: 'FORWARD_FIX_REQUIRED',
      catastrophic: 'RESTORE_VERIFIED_BACKUP'
    }
  };
}

export function buildSafeEvidence(input = {}) {
  return {
    version: 627,
    candidateSha: String(input.repoSha || ''),
    projectRef: PROJECT_REF,
    postgresVersion: String(input.postgresVersion || ''),
    publicTableCount: Number(input.publicTableCount || 0),
    publicBytes: Number(input.publicBytes || 0),
    activeLongTransactions: Number(input.activeLongTransactions || 0),
    waitingLocks: Number(input.waitingLocks || 0),
    ledger: {
      entries: Number(input.ledger?.entries || 0),
      safeSalesCandidates: Number(input.ledger?.safeSalesCandidates || 0),
      safePurchaseCandidates: Number(input.ledger?.safePurchaseCandidates || 0),
      ambiguous: Number(input.ledger?.ambiguous || 0)
    },
    criticalCounts: Object.fromEntries(
      Object.entries(input.criticalCounts || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, Number(value || 0)])
    ),
    driftState: String(input.driftState || '')
  };
}
