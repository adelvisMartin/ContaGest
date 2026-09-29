import test from 'node:test';
import assert from 'node:assert/strict';
import type { TenantReferenceDb } from './tenant-reference-guard.js';
import { validateTenantMutationReferences } from './tenant-reference-guard.js';

function dbFixture(options: {
  clientIds?: string[];
  supplierIds?: string[];
  productIds?: string[];
  taxPeriodIds?: string[];
} = {}) {
  const clientIds = new Set(options.clientIds || []);
  const supplierIds = new Set(options.supplierIds || []);
  const productIds = new Set(options.productIds || []);
  const taxPeriodIds = new Set(options.taxPeriodIds || []);
  return {
    client: {
      findFirst: async ({ where }: any) => clientIds.has(where.id) ? { id: where.id } : null,
    },
    supplier: {
      findFirst: async ({ where }: any) => supplierIds.has(where.id) ? { id: where.id } : null,
    },
    product: {
      findMany: async ({ where }: any) => (where.id.in as string[]).filter((id) => productIds.has(id)).map((id) => ({ id })),
    },
    taxPeriod: {
      findFirst: async ({ where }: any) => taxPeriodIds.has(where.id) ? { id: where.id } : null,
    },
  } as unknown as TenantReferenceDb;
}

async function captureError(promise: Promise<unknown>) {
  try {
    await promise;
    assert.fail('Expected tenant reference validation to reject');
  } catch (error: any) {
    return error;
  }
}

test('sales accepts same-tenant client and product references', async () => {
  const db = dbFixture({ clientIds: ['client-a'], productIds: ['product-a', 'product-b'] });
  await assert.doesNotReject(() => validateTenantMutationReferences(db, 'tenant-a', '/sales', {
    clientId: 'client-a',
    lines: [{ productId: 'product-a' }, { productId: 'product-b' }],
  }));
});

test('sales rejects unavailable/cross-tenant client without disclosing existence', async () => {
  const db = dbFixture({ clientIds: ['client-a'] });
  const error = await captureError(validateTenantMutationReferences(db, 'tenant-a', '/sales', { clientId: 'client-b' }));
  assert.equal(error.status, 409);
  assert.equal(error.details?.code, 'CROSS_TENANT_REFERENCE');
  assert.deepEqual(error.details?.fields, ['clientId']);
  assert.doesNotMatch(error.message, /client-b|tenant-b/i);
});

test('sales line products are validated against authenticated tenant', async () => {
  const db = dbFixture({ clientIds: ['client-a'], productIds: ['product-a'] });
  const error = await captureError(validateTenantMutationReferences(db, 'tenant-a', '/sales', {
    clientId: 'client-a',
    lines: [{ productId: 'product-a' }, { productId: 'product-b' }],
  }));
  assert.equal(error.status, 409);
  assert.equal(error.details?.code, 'CROSS_TENANT_REFERENCE');
  assert.deepEqual(error.details?.fields, ['productId']);
});

test('purchase supplier and line products are tenant-scoped', async () => {
  const db = dbFixture({ supplierIds: ['supplier-a'], productIds: ['product-a'] });
  await assert.doesNotReject(() => validateTenantMutationReferences(db, 'tenant-a', '/purchases', {
    supplierId: 'supplier-a',
    lines: [{ productId: 'product-a' }],
  }));

  const error = await captureError(validateTenantMutationReferences(db, 'tenant-a', '/purchases', {
    supplierId: 'supplier-b',
    lines: [{ productId: 'product-a' }],
  }));
  assert.equal(error.details?.code, 'CROSS_TENANT_REFERENCE');
  assert.deepEqual(error.details?.fields, ['supplierId']);
});

test('fiscal taxPeriodId is service-enforced against authenticated tenant', async () => {
  const db = dbFixture({ taxPeriodIds: ['period-a'] });
  await assert.doesNotReject(() => validateTenantMutationReferences(db, 'tenant-a', '/tax/declarations', { taxPeriodId: 'period-a' }));
  const error = await captureError(validateTenantMutationReferences(db, 'tenant-a', '/tax/declarations', { taxPeriodId: 'period-b' }));
  assert.equal(error.status, 409);
  assert.equal(error.details?.code, 'CROSS_TENANT_REFERENCE');
  assert.deepEqual(error.details?.fields, ['taxPeriodId']);
});

test('read-only methods and unrelated routes do not perform reference validation', async () => {
  const db = dbFixture();
  await assert.doesNotReject(() => validateTenantMutationReferences(db, 'tenant-a', '/clients', { clientId: 'other' }));
});
