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
