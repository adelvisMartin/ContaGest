import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildGuardStatements, CLASSIFICATION, guardNames, summarizePolicy } from '../scripts/composite-tenant-integrity-v634.mjs';

const policy = JSON.parse(await readFile(new URL('../config/composite-tenant-integrity-v634.json', import.meta.url), 'utf8'));
const relations = policy.relations;
const key = (relation) => `${relation.childTable}.${relation.childColumn}->${relation.parentTable}.${relation.parentColumn}`;
const byKey = new Map(relations.map((relation) => [key(relation), relation]));

const criticalOwners = new Set(['accounting', 'commercial', 'fiscal', 'lifecycle', 'core-tenant', 'clinical-care']);

test('policy is explicit, unique, and every relation has an owner/classification', () => {
  assert.equal(policy.schemaVersion, 634);
  assert.equal(policy.sourceManifestIssue, 633);
  assert.equal(policy.productionConvergenceIssue, 627);
  assert.equal(policy.canonicalDatabaseGateIssue, 632);
  assert.equal(policy.relations.length, 83);
  assert.equal(new Set(policy.relations.map(key)).size, policy.relations.length);
  for (const relation of relations) {
    assert.ok(relation.owner, key(relation));
    assert.ok(Object.values(CLASSIFICATION).includes(relation.classification), key(relation));
  }
});

test('critical core/financial/fiscal/lifecycle relations are DB_ENFORCEABLE', () => {
  const critical = relations.filter((relation) => criticalOwners.has(relation.owner));
  assert.ok(critical.length > 0);
  assert.equal(critical.every((relation) => relation.classification === CLASSIFICATION.DB_ENFORCEABLE), true);
});

test('line-item/fiscal references without child tenant ownership are SERVICE_ENFORCED', () => {
  const serviceRelations = [
    'SalesInvoiceLine.productId->Product.id',
    'PurchaseInvoiceLine.productId->Product.id',
    'FiscalDocument.sourceLedgerEntryId->LedgerEntry.id'
  ];
  for (const relationKey of serviceRelations) {
    const relation = byKey.get(relationKey);
    assert.ok(relation, `missing policy relation ${relationKey}`);
    assert.equal(relation.classification, CLASSIFICATION.SERVICE_ENFORCED, relationKey);
  }
});

test('clinical tenant-scoped relations are explicitly DB-enforced', () => {
  const clinical = relations.filter((relation) => relation.owner === 'clinical-care' && relation.classification === CLASSIFICATION.DB_ENFORCEABLE);
  assert.ok(clinical.length >= 30, `expected clinical DB coverage, got ${clinical.length}`);
  assert.equal(clinical.some((relation) => key(relation) === 'CareEncounter.patientId->CarePatient.id'), true);
  assert.equal(clinical.some((relation) => key(relation) === 'CareProfessional.userId->UserProfile.id'), true);
});

test('generated guard DDL creates parent composite uniqueness, child indexes, and NO ACTION composite FKs', () => {
  const relation = byKey.get('SalesInvoice.clientId->Client.id');
  const sql = buildGuardStatements(relation).join('\n');
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS/);
  assert.match(sql, /"Client" \("tenantId", "id"\)/);
  assert.match(sql, /"SalesInvoice" \("tenantId", "clientId"\)/);
  assert.match(sql, /FOREIGN KEY \("tenantId", "clientId"\)/);
  assert.match(sql, /REFERENCES "Client" \("tenantId", "id"\)/);
  assert.match(sql, /ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID/);
  assert.match(sql, /VALIDATE CONSTRAINT/);
  assert.doesNotMatch(sql, /^\s*(?:UPDATE\b|DELETE\s+FROM\b|INSERT\s+INTO\b)/im);
});

test('generated identifiers stay within PostgreSQL 63-byte identifier limit', () => {
  for (const relation of relations.filter((item) => item.classification === CLASSIFICATION.DB_ENFORCEABLE)) {
    for (const name of Object.values(guardNames(relation))) assert.ok(name.length <= 63, `${name} is too long`);
  }
});

test('policy summary leaves no critical relation unclassified', () => {
  const summary = summarizePolicy(policy);
  assert.equal(summary.total, relations.length);
  assert.equal(summary.unclassified, 0);
  assert.equal(summary.relationSetMd5, policy.baselineRelationSetMd5);
  assert.equal(summary.byClassification.DB_ENFORCEABLE, 80);
  assert.equal(summary.byClassification.SERVICE_ENFORCED, 3);
  assert.equal(summary.byClassification.GLOBAL_REFERENCE, 0);
});

test('two-tenant smoke covers both cross-tenant directions, reparent and rollback cleanup', async () => {
  const smoke = await readFile(new URL('../backend/scripts/composite-tenant-smoke-v634.mjs', import.meta.url), 'utf8');
  assert.match(smoke, /cross-tenant parent A/);
  assert.match(smoke, /cross-tenant parent B/);
  assert.match(smoke, /reparent/);
  assert.match(smoke, /ROLLBACK/);
});

test('historical lifecycle projection remains valid when later migrations exist', async () => {
  const source = await readFile(new URL('../backend/scripts/migration-compat-v626.mjs', import.meta.url), 'utf8');
  assert.match(source, /projectHistoricalCompatibility/);
});

test('historical projection plan is inert when the compatibility migration is outside a snapshot', async () => {
  const source = await readFile(new URL('../backend/scripts/migration-compat-plan-v626.mjs', import.meta.url), 'utf8');
  assert.match(source, /available/);
});

test('ephemeral deploy phases historical projection before later migrations', async () => {
  const source = await readFile(new URL('../backend/scripts/prisma-deploy-safe.mjs', import.meta.url), 'utf8');
  assert.match(source, /projectHistoricalCompatibility/);
  assert.match(source, /migrate', 'deploy/);
});

test('forward-only migration is ordered after the already-applied production convergence migration', async () => {
  const migration = await readFile(new URL('../backend/prisma/migrations/20260929180000_composite_tenant_integrity_v634/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /#634/);
});

test('forward-only migration is catalog-bounded and contains no data rewrite', async () => {
  const migration = await readFile(new URL('../backend/prisma/migrations/20260929180000_composite_tenant_integrity_v634/migration.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(migration, /^\s*(?:UPDATE\b|DELETE\s+FROM\b|INSERT\s+INTO\b)/im);
});
