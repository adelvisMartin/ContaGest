import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function readRequired(path) {
  assert.equal(fs.existsSync(path), true, `required artifact missing: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

const migrationPath = 'backend/prisma/migrations/20260927152000_data_lifecycle_v562/migration.sql';
const servicePath = 'backend/src/modules/data-lifecycle/data-lifecycle.service.ts';
const routesPath = 'backend/src/modules/data-lifecycle/data-lifecycle.routes.ts';
const matrixPath = 'docs/data-lifecycle/entity-retention-matrix.v1.json';
const workflowPath = '.github/workflows/data-lifecycle-v562.yml';

const migration = readRequired(migrationPath);
const service = readRequired(servicePath);
const routes = readRequired(routesPath);
const matrix = readRequired(matrixPath);
const routeManifest = readRequired('backend/src/modules/route-manifest.ts');
const mediaRoutes = readRequired('backend/src/modules/media/media.routes.ts');
const workflow = readRequired(workflowPath);

const parsedMatrix = JSON.parse(matrix);

test('#562 has a versioned entity→retention→delete-semantics authority', () => {
  assert.equal(parsedMatrix.version, 1);
  assert.ok(Array.isArray(parsedMatrix.entities));
  for (const entity of ['AuditLog', 'LedgerEntry', 'FiscalDocument', 'FiscalCloseEvidence', 'AnalyticsEvent', 'ImportBatch', 'MediaObject']) {
    assert.ok(parsedMatrix.entities.some((entry) => entry.entity === entity), `matrix missing ${entity}`);
  }
  assert.match(migration, /DataRetentionPolicyVersion/);
  assert.match(migration, /effectiveFrom/);
  assert.match(migration, /deleteSemantics/);
  assert.match(migration, /contentHash/);
});

test('#562 blocks generic destruction of ledger/audit/fiscal evidence and legal-hold bypasses', () => {
  assert.match(migration, /DataLegalHold/);
  assert.match(migration, /data_lifecycle_assert_not_held/);
  assert.match(migration, /AuditLog/);
  assert.match(migration, /LedgerEntry/);
  assert.match(migration, /FiscalDocument/);
  assert.match(migration, /FiscalCloseEvidence/);
  assert.match(migration, /generic delete denied/i);
  assert.match(service, /LEGAL_HOLD_ACTIVE/);
});

test('#562 jobs are tenant-scoped, idempotent and resumable', () => {
  assert.match(migration, /DataLifecycleJob/);
  assert.match(migration, /idempotencyKey/);
  assert.match(migration, /cursor/);
  assert.match(migration, /UNIQUE \("tenantId", "operation", "idempotencyKey"\)/);
  assert.match(service, /claimLifecycleJob/);
  assert.match(service, /resumeLifecycleJob/);
  assert.match(service, /tenantId/);
});

test('#562 DB rows and storage objects share one lifecycle registry and orphan scanner', () => {
  assert.match(migration, /DataStorageObject/);
  assert.match(service, /registerStorageObject/);
  assert.match(service, /markStorageObjectDeleted/);
  assert.match(service, /detectStorageOrphans/);
  assert.match(mediaRoutes, /registerStorageObject/);
  assert.match(mediaRoutes, /markStorageObjectDeleted/);
});

test('#562 exposes server-side admin workflows and is mounted in the canonical route manifest', () => {
  assert.match(routes, /requirePermission\('admin.manage'\)/);
  assert.match(routes, /legal-holds/);
  assert.match(routes, /tenant-export/);
  assert.match(routes, /purge-jobs/);
  assert.match(routeManifest, /data-lifecycle/);
});

test('#562 CI proves PostgreSQL isolation and a real filesystem storage sandbox', () => {
  assert.match(workflow, /postgres:17/);
  assert.match(workflow, /data-lifecycle-v562.integration.test.ts/);
  assert.match(workflow, /storage sandbox/i);
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm run build:backend/);
});

test('#658 protected entities and purge adapters cannot drift from retention matrix', () => {
  const sourceSet = (name) => {
    const declaration = new RegExp('const '+name+' = new Set\\(\\[([\\s\\S]*?)\\]\\);').exec(service);
    assert.ok(declaration, `missing runtime ${name} allowlist`);
    const values = [...declaration[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    assert.ok(values.length > 0, `empty runtime ${name} allowlist`);
    assert.equal(new Set(values).size, values.length, `duplicate runtime ${name}`);
    return new Set(values);
  };

  const protectedEntities = sourceSet('PROTECTED_ENTITIES');
  const purgeAdapters = sourceSet('PURGE_ADAPTER_ENTITIES');
  // Immutable fiscal/accounting/audit authorities cannot vanish from both
  // catalogs simultaneously and still produce a false-positive PASS.
  const mandatoryProtected = new Map([
    ['AuditLog', 'immutable'],
    ['LedgerEntry', 'immutable'],
    ['FiscalDocument', 'immutable'],
    ['FiscalCloseEvidence', 'immutable'],
    ['ClinicalMediaObject', 'immutable'],
    ['CarePatient', 'soft_delete']
  ]);
  for (const entity of mandatoryProtected.keys()) {
    assert.ok(protectedEntities.has(entity), `mandatory protected runtime owner removed: ${entity}`);
  }
  const matrixEntities = new Map();

  for (const row of parsedMatrix.entities) {
    assert.equal(typeof row.entity, 'string');
    assert.ok(row.entity.length > 0, 'unidentified entity in retention authority');
    assert.equal(matrixEntities.has(row.entity), false, `duplicate retention entity: ${row.entity}`);
    matrixEntities.set(row.entity, row);
    if (mandatoryProtected.has(row.entity)) {
      assert.equal(row.deleteSemantics, mandatoryProtected.get(row.entity),
        `protected lifecycle semantics changed: ${row.entity}`);
    }
    assert.ok(row.retentionDays === null ||
      (Number.isSafeInteger(row.retentionDays) && row.retentionDays >= 0),
      `invalid retentionDays: ${row.entity}`);
    assert.equal(typeof row.purgeable, 'boolean', `missing purgeable state: ${row.entity}`);
  }

  for (const entity of protectedEntities) {
    const row = matrixEntities.get(entity);
    assert.ok(row, `protected runtime entity absent from retention authority: ${entity}`);
    assert.equal(row.purgeable, false, `protected entity marked purgeable: ${entity}`);
    assert.notEqual(row.deleteSemantics, 'purge', `protected entity assigned purge semantics: ${entity}`);
    assert.equal(purgeAdapters.has(entity), false, `protected entity installed as purge adapter: ${entity}`);
  }

  for (const entity of purgeAdapters) {
    const row = matrixEntities.get(entity);
    assert.ok(row, `purge adapter absent from retention authority: ${entity}`);
    assert.equal(row.purgeable, true, `runtime purge adapter contradicts matrix: ${entity}`);
    assert.ok(['purge','archive'].includes(row.deleteSemantics),
      `runtime purge adapter has unsupported semantics: ${entity}`);
  }

  assert.equal(matrixEntities.get('MediaObject')?.deleteSemantics, 'purge');
  assert.equal(matrixEntities.get('MediaObject')?.purgeable, true);
  assert.equal(purgeAdapters.has('MediaObject'), false,
    'media deletion requires its dedicated lifecycle/storage guard');
  assert.ok([...matrixEntities.values()].every((row) =>
    !row.deleteSemantics.includes('immutable') || row.purgeable === false),
    'immutable retention class can never authorize generic purge');
});

test('#658 policy edits, legal holds and purge share tenant serialization; stale errors cannot overwrite a newer batch', () => {
  const policyWrite = service.slice(
    service.indexOf('export async function createRetentionPolicyVersion'),
    service.indexOf('export async function listRetentionPolicies')
  );
  const legalHoldWrite = service.slice(
    service.indexOf('export async function createLegalHold'),
    service.indexOf('export async function listLegalHolds')
  );
  const purge = service.slice(
    service.indexOf('export async function executePurgeBatch'),
    service.indexOf('export async function registerStorageObject')
  );
  const tenantLock = /pg_advisory_xact_lock\(hashtextextended\(\$\{input\.tenantId\}, 562\)\)/;
  for (const [name, scope] of [
    ['retention policy version', policyWrite],
    ['legal hold', legalHoldWrite],
    ['purge batch', purge]
  ]) {
    assert.match(scope, tenantLock, `${name} must acquire the tenant advisory lock`);
  }
  assert.match(purge, /FOR UPDATE/, 'purge must also serialize concurrent jobs');
  assert.match(purge, /"attempts" = \$\{observedAttempts\}/,
    'failed older jobs cannot overwrite a newer successful job status');
  assert.match(purge, /persistLifecycleEvidence\(tx,/, 'audit evidence must use the same transaction');
  assert.match(purge, /deletePurgeableRows\(tx,/, 'DELETE must use the same transaction');
  assert.match(purge, /"lastError" = \$\{blocked \? 'LEGAL_HOLD_ACTIVE' : 'PURGE_BATCH_FAILED'\}/,
    'DB/provider messages cannot be persisted verbatim');
});

test('#658 purge batch size validation is shared before any SQL or job creation', () => {
  const validator = service.slice(service.indexOf('function normalizePurgeBatchSize'), service.indexOf('function canonicalize'));
  assert.match(validator, /Number\.isSafeInteger\(value\)/);
  assert.match(validator, /value < 1/);
  assert.match(validator, /PURGE_BATCH_SIZE_INVALID/);
  assert.match(validator, /Math\.min\(value, 1000\)/);
  const request = service.slice(service.indexOf('export async function requestPurgeJob'), service.indexOf('async function deletePurgeableRows'));
  const execution = service.slice(service.indexOf('export async function executePurgeBatch'), service.indexOf('export async function registerStorageObject'));
  assert.match(request, /normalizePurgeBatchSize\(input\.batchSize\)/);
  assert.match(execution, /normalizePurgeBatchSize\(input\.batchSize\)/);
});

test('#658 pg advisory lock results never return PostgreSQL void to Prisma', () => {
  // pg_advisory_xact_lock returns type void. Prisma raw selects must project
  // a supported integer instead, without changing transaction lock semantics.
  assert.doesNotMatch(service, /SELECT\s+pg_advisory_xact_lock\(/i);
  const safeLocks = [...service.matchAll(/SELECT\s+1::integer\s+AS\s+"lockAcquired"\s+FROM\s+pg_advisory_xact_lock\(/g)];
  assert.equal(safeLocks.length, 4, 'tenant x3 and policy entity x1 locks must all project an integer');
  const policyWrite = service.slice(
    service.indexOf('export async function createRetentionPolicyVersion'),
    service.indexOf('export async function listRetentionPolicies')
  );
  const legalHold = service.slice(
    service.indexOf('export async function createLegalHold'),
    service.indexOf('export async function listLegalHolds')
  );
  const purge = service.slice(
    service.indexOf('export async function executePurgeBatch'),
    service.indexOf('export async function registerStorageObject')
  );
  for (const scope of [policyWrite, legalHold, purge]) {
    assert.match(scope, /1::integer\s+AS\s+"lockAcquired"\s+FROM\s+pg_advisory_xact_lock/);
  }
});


test('#658 archive-first policies never silently become hard-delete adapters', () => {
  const matrixEntity = parsedMatrix.entities.find((entry) => entry.entity === 'NotificationLog');
  assert.equal(matrixEntity?.deleteSemantics, 'archive');
  const policy = service.slice(service.indexOf('export async function createRetentionPolicyVersion'), service.indexOf('export async function listRetentionPolicies'));
  const claim = service.slice(service.indexOf('export async function requestPurgeJob'), service.indexOf('async function deletePurgeableRows'));
  const execute = service.slice(service.indexOf('export async function executePurgeBatch'), service.indexOf('export async function registerStorageObject'));
  assert.match(service, /const ARCHIVE_FIRST_ENTITIES = new Set\(\['NotificationLog'\]\)/);
  assert.match(policy, /ARCHIVE_FIRST_ENTITIES\.has\(input\.entityType\)/);
  assert.match(policy, /ARCHIVE_EXPORT_REQUIRED/);
  for (const scope of [claim, execute]) {
    assert.match(scope, /policy\.deleteSemantics !== 'purge'/);
    assert.match(scope, /ARCHIVE_EXPORT_REQUIRED/);
  }
});

test('#658 tenant and immutable clinical media cannot bypass storage lifecycle through upsert or zero-day retention', () => {
  const register = service.slice(service.indexOf('export async function registerStorageObject'), service.indexOf('export async function markStorageObjectDeleted'));
  const deletion = service.slice(service.indexOf('export async function assertStorageDeletionAllowed'), service.indexOf('async function countRows'));
  assert.match(register, /ON CONFLICT \("tenantId", "bucket", "objectKey"\)/);
  assert.match(register, /WHERE public\."DataStorageObject"\."lifecycleEntityType" <> 'ClinicalMediaObject'/);
  assert.match(register, /EXCLUDED\."lifecycleEntityType" = 'ClinicalMediaObject'/);
  assert.match(register, /PROTECTED_STORAGE_RECLASSIFICATION_FORBIDDEN/);
  assert.match(deletion, /input\.objectKey\.startsWith\(/);
  assert.match(deletion, /STORAGE_TENANT_SCOPE_INVALID/);
  assert.match(deletion, /bucket === 'contagest-clinical-media'/);
  assert.match(deletion, /registered\[0\]\?\.lifecycleEntityType === 'ClinicalMediaObject'/);
  assert.match(deletion, /PROTECTED_STORAGE_DELETE_FORBIDDEN/);
  assert.match(deletion, /STORAGE_RETENTION_AGE_UNKNOWN/);
});
