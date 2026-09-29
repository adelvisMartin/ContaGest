import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planHistoricalProjection } from '../backend/scripts/migration-compat-plan-v626.mjs';
import {
  CLASSIFICATION,
  buildGuardStatements,
  expandPolicy,
  guardNames,
  relationSetMd5,
  validatePolicy,
  summarizePolicy,
  twoTenantSmokeSql,
} from '../scripts/composite-tenant-integrity-v634.mjs';

const policy = JSON.parse(await readFile(new URL('../config/composite-tenant-integrity-v634.json', import.meta.url), 'utf8'));
const relations = expandPolicy(policy);
const key = (relation) => `${relation.childTable}.${relation.childColumn}->${relation.parentTable}.${relation.parentColumn}`;
const byKey = new Map(relations.map((relation) => [key(relation), relation]));
const migrationId = '20260929173500_issue_634_composite_tenant_referential_integrity';
const previousProductionConvergenceMigrationId = '20260929164500_issue_627_production_convergence_hardening';
const dataLifecycleMigrationId = '20260927152000_data_lifecycle_v562';

const criticalDbRelations = [
  'BankMovement.accountId->BankAccount.id',
  'InventoryMovement.productId->Product.id',
  'SalesInvoice.clientId->Client.id',
  'PurchaseInvoice.supplierId->Supplier.id',
  'LedgerEntry.salesInvoiceId->SalesInvoice.id',
  'LedgerEntry.purchaseInvoiceId->PurchaseInvoice.id',
  'LedgerEntry.reversalOfId->LedgerEntry.id',
  'FinancialFxBankAccountMap.bankAccountId->BankAccount.id',
  'FinancialFxEvent.ledgerEntryId->LedgerEntry.id',
  'FiscalCloseEvidence.closingPeriodId->ClosingPeriod.id',
  'FiscalDocumentRuleSnapshot.fiscalDocumentId->FiscalDocument.id',
  'DataLifecycleEvidence.jobId->DataLifecycleJob.id',
  'TenantMembership.userProfileId->UserProfile.id',
];

const serviceRelations = [
  'SalesInvoiceLine.productId->Product.id',
  'PurchaseInvoiceLine.productId->Product.id',
  'TaxDeclaration.periodId->TaxPeriod.id',
];

test('policy is explicit, unique, and every relation has an owner/classification', () => {
  assert.doesNotThrow(() => validatePolicy(policy));
  assert.equal(new Set(relations.map(key)).size, relations.length);
  assert.equal(policy.dbEnforceableRelations.length, 80);
  assert.equal(relationSetMd5(policy), '40bcc4ea915585c961a4327c109e4358');
  assert.equal(policy.baselineRelationSetMd5, relationSetMd5(policy));
  for (const relation of relations) {
    assert.ok(Object.values(CLASSIFICATION).includes(relation.classification));
    assert.ok(String(relation.owner || '').trim().length > 0);
    assert.ok(String(relation.reason || '').trim().length > 0);
  }
});

test('critical core/financial/fiscal/lifecycle relations are DB_ENFORCEABLE', () => {
  for (const relationKey of criticalDbRelations) {
    const relation = byKey.get(relationKey);
    assert.ok(relation, `missing policy relation ${relationKey}`);
    assert.equal(relation.classification, CLASSIFICATION.DB_ENFORCEABLE, relationKey);
    assert.equal(relation.childTenantColumn, 'tenantId');
    assert.equal(relation.parentTenantColumn, 'tenantId');
  }
});

test('line-item/fiscal references without child tenant ownership are SERVICE_ENFORCED', () => {
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
  assert.doesNotMatch(sql, /\bUPDATE\b|\bDELETE FROM\b|\bINSERT INTO\b/i);
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
  assert.equal(summary.byClassification.PLATFORM_REFERENCE, 0);
});

test('two-tenant smoke covers both cross-tenant directions, reparent and rollback cleanup', () => {
  const sql = twoTenantSmokeSql();
  assert.match(sql, /TENANT_CROSS_A_TO_B_INSERT_ACCEPTED/);
  assert.match(sql, /TENANT_CROSS_B_TO_A_INSERT_ACCEPTED/);
  assert.match(sql, /TENANT_CROSS_REPARENT_ACCEPTED/);
  assert.match(sql, /TENANT_LIFECYCLE_SEMANTICS_REGRESSION/);
  assert.match(sql, /ROLLBACK;/);
});

test('historical lifecycle projection remains valid when later migrations exist', () => {
  const ordered = [
    '20260927143000_fiscal_authority_v561',
    dataLifecycleMigrationId,
    previousProductionConvergenceMigrationId,
    migrationId,
  ];
  const plan = planHistoricalProjection(ordered, dataLifecycleMigrationId);
  assert.equal(plan.available, true);
  assert.deepEqual(plan.before, ['20260927143000_fiscal_authority_v561']);
  assert.deepEqual(plan.after, [previousProductionConvergenceMigrationId, migrationId]);
  assert.equal(plan.migration, dataLifecycleMigrationId);
});

test('historical projection plan is inert when the compatibility migration is outside a snapshot', () => {
  const ordered = ['20260827054000_financial_idempotency'];
  const plan = planHistoricalProjection(ordered, dataLifecycleMigrationId);
  assert.equal(plan.available, false);
  assert.deepEqual(plan.before, ordered);
  assert.deepEqual(plan.after, []);
});

test('forward-only migration is ordered after the already-applied production convergence migration', () => {
  assert.ok(
    migrationId.localeCompare(previousProductionConvergenceMigrationId) > 0,
    `${migrationId} must sort after ${previousProductionConvergenceMigrationId}`,
  );
});

test('forward-only migration is catalog-bounded and contains no data rewrite', async () => {
  const migration = await readFile(new URL(`../backend/prisma/migrations/${migrationId}/migration.sql`, import.meta.url), 'utf8');
  assert.match(migration, /#634 Composite Tenant Referential Integrity/);
  assert.match(migration, /candidate_count <> 80/);
  assert.match(migration, /40bcc4ea915585c961a4327c109e4358/);
  assert.match(migration, /TENANT_RELATION_CATALOG_DRIFT/);
  assert.match(migration, /_tg_fk/);
  assert.match(migration, /FOREIGN KEY \(%I, %I\) REFERENCES %I \(%I, %I\) ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID/);
  assert.match(migration, /VALIDATE CONSTRAINT/);
  assert.doesNotMatch(migration, /\bUPDATE\s+"|\bDELETE\s+FROM\s+"|\bINSERT\s+INTO\s+"/i);
  assert.doesNotMatch(migration, /DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE/i);
});
