import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CLASSIFICATION,
  buildGuardStatements,
  validatePolicy,
  summarizePolicy,
} from '../scripts/composite-tenant-integrity-v634.mjs';

const policy = JSON.parse(await readFile(new URL('../config/composite-tenant-integrity-v634.json', import.meta.url), 'utf8'));

const key = (relation) => `${relation.childTable}.${relation.childColumn}->${relation.parentTable}.${relation.parentColumn}`;
const byKey = new Map(policy.relations.map((relation) => [key(relation), relation]));

const criticalDbRelations = [
  'BankMovement.accountId->BankAccount.id',
  'InventoryMovement.productId->Product.id',
  'SalesInvoice.clientId->Client.id',
  'PurchaseInvoice.supplierId->Supplier.id',
  'LedgerEntry.salesInvoiceId->SalesInvoice.id',
  'LedgerEntry.purchaseInvoiceId->PurchaseInvoice.id',
  'TenantMembership.userProfileId->UserProfile.id',
];

const serviceRelations = [
  'SalesInvoiceLine.productId->Product.id',
  'PurchaseInvoiceLine.productId->Product.id',
  'TaxDeclaration.taxPeriodId->TaxPeriod.id',
];

test('policy is explicit, unique, and every relation has an owner/classification', () => {
  assert.doesNotThrow(() => validatePolicy(policy));
  assert.equal(new Set(policy.relations.map(key)).size, policy.relations.length);
  for (const relation of policy.relations) {
    assert.ok(Object.values(CLASSIFICATION).includes(relation.classification));
    assert.ok(String(relation.owner || '').trim().length > 0);
    assert.ok(String(relation.reason || '').trim().length > 0);
  }
});

test('critical core relations are DB_ENFORCEABLE', () => {
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
  const clinical = policy.relations.filter((relation) => relation.owner === 'clinical-care' && relation.classification === CLASSIFICATION.DB_ENFORCEABLE);
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
  assert.match(sql, /ON DELETE NO ACTION ON UPDATE NO ACTION/);
  assert.doesNotMatch(sql, /\bUPDATE\b|\bDELETE FROM\b|\bINSERT INTO\b/i);
});

test('policy summary leaves no critical relation unclassified', () => {
  const summary = summarizePolicy(policy);
  assert.equal(summary.total, policy.relations.length);
  assert.equal(summary.unclassified, 0);
  assert.ok(summary.byClassification.DB_ENFORCEABLE >= criticalDbRelations.length + 30);
  assert.ok(summary.byClassification.SERVICE_ENFORCED >= serviceRelations.length);
});

test('forward-only migration is generated from the same policy and contains no data rewrite', async () => {
  const migration = await readFile(new URL('../backend/prisma/migrations/20260929162000_composite_tenant_referential_integrity/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /#634 Composite Tenant Referential Integrity/);
  assert.match(migration, /BankMovement_tenantId_accountId_tenant_guard_fkey/);
  assert.match(migration, /CareEncounter_tenantId_patientId_tenant_guard_fkey/);
  assert.doesNotMatch(migration, /\bUPDATE\s+"|\bDELETE\s+FROM\s+"|\bINSERT\s+INTO\s+"/i);
  assert.doesNotMatch(migration, /DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE/i);
});
