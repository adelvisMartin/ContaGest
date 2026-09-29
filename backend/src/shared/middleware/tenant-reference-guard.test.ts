import test from 'node:test';
import assert from 'node:assert/strict';
import type { TenantReferenceDb } from './tenant-reference-guard.js';
import { validateTenantMutationReferences } from './tenant-reference-guard.js';

type ScopedRow = { id: string; tenantId: string };

function dbFixture(options: {
  clients?: ScopedRow[];
  suppliers?: ScopedRow[];
  products?: ScopedRow[];
  taxPeriods?: ScopedRow[];
} = {}) {
  const clients = options.clients || [];
  const suppliers = options.suppliers || [];
  const products = options.products || [];
  const taxPeriods = options.taxPeriods || [];

  return {
    client: {
      findFirst: async ({ where }: any) => clients.find((row) => row.id === where.id && row.tenantId === where.tenantId)
        ? { id: where.id }
        : null,
    },
    supplier: {
      findFirst: async ({ where }: any) => suppliers.find((row) => row.id === where.id && row.tenantId === where.tenantId)
        ? { id: where.id }
        : null,
    },
    product: {
      findMany: async ({ where }: any) => products
        .filter((row) => row.tenantId === where.tenantId && (where.id.in as string[]).includes(row.id))
        .map((row) => ({ id: row.id })),
    },
    taxPeriod: {
      findFirst: async ({ where }: any) => taxPeriods.find((row) => row.id === where.id && row.tenantId === where.tenantId)
        ? { id: where.id }
        : null,
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
  const db = dbFixture({
    clients: [{ id: 'client-a', tenantId: 'tenant-a' }],
    products: [
      { id: 'product-a', tenantId: 'tenant-a' },
      { id: 'product-b', tenantId: 'tenant-a' },
    ],
  });
  await assert.doesNotReject(() => validateTenantMutationReferences(db, 'tenant-a', '/sales', {
    clientId: 'client-a', lines: [{ productId: 'product-a' }, { productId: 'product-b' }],
  }));
});

test('sales rejects an existing client owned by another tenant without disclosing existence', async () => {
  const db = dbFixture({
    clients: [
      { id: 'client-a', tenantId: 'tenant-a' },
      { id: 'client-b', tenantId: 'tenant-b' },
    ],
  });
  const error = await captureError(validateTenantMutationReferences(db, 'tenant-a', '/sales', { clientId: 'client-b' }));
  assert.equal(error.status, 409);
  assert.equal(error.details?.code, 'CROSS_TENANT_REFERENCE');
  assert.deepEqual(error.details?.fields, ['clientId']);
  assert.doesNotMatch(error.message, /client-b|tenant-b/i);
});

test('sales line products are validated against authenticated tenant', async () => {
  const db = dbFixture({
    clients: [{ id: 'client-a', tenantId: 'tenant-a' }],
    products: [
      { id: 'product-a', tenantId: 'tenant-a' },
      { id: 'product-b', tenantId: 'tenant-b' },
    ],
  });
  const error = await captureError(validateTenantMutationReferences(db, 'tenant-a', '/sales', {
    clientId: 'client-a', lines: [{ productId: 'product-a' }, { productId: 'product-b' }],
  }));
  assert.equal(error.status, 409);
  assert.equal(error.details?.code, 'CROSS_TENANT_REFERENCE');
  assert.deepEqual(error.details?.fields, ['productId']);
});

test('purchase supplier and line products are tenant-scoped', async () => {
  const db = dbFixture({
    suppliers: [
      { id: 'supplier-a', tenantId: 'tenant-a' },
      { id: 'supplier-b', tenantId: 'tenant-b' },
    ],
    products: [{ id: 'product-a', tenantId: 'tenant-a' }],
  });
  await assert.doesNotReject(() => validateTenantMutationReferences(db, 'tenant-a', '/purchases', {
    supplierId: 'supplier-a', lines: [{ productId: 'product-a' }],
  }));
  const error = await captureError(validateTenantMutationReferences(db, 'tenant-a', '/purchases', {
    supplierId: 'supplier-b', lines: [{ productId: 'product-a' }],
  }));
  assert.equal(error.details?.code, 'CROSS_TENANT_REFERENCE');
  assert.deepEqual(error.details?.fields, ['supplierId']);
});

test('fiscal periodId is service-enforced against authenticated tenant', async () => {
  const db = dbFixture({
    taxPeriods: [
      { id: 'period-a', tenantId: 'tenant-a' },
      { id: 'period-b', tenantId: 'tenant-b' },
    ],
  });
  await assert.doesNotReject(() => validateTenantMutationReferences(db, 'tenant-a', '/tax/declarations', { periodId: 'period-a' }));
  const error = await captureError(validateTenantMutationReferences(db, 'tenant-a', '/tax/declarations', { periodId: 'period-b' }));
  assert.equal(error.status, 409);
  assert.equal(error.details?.code, 'CROSS_TENANT_REFERENCE');
  assert.deepEqual(error.details?.fields, ['periodId']);
});

test('tenant scoping is mandatory in every database lookup', async () => {
  const db = dbFixture({
    clients: [{ id: 'client-a', tenantId: 'tenant-a' }],
    suppliers: [{ id: 'supplier-a', tenantId: 'tenant-a' }],
    products: [{ id: 'product-a', tenantId: 'tenant-a' }],
    taxPeriods: [{ id: 'period-a', tenantId: 'tenant-a' }],
  });
  await assert.doesNotReject(() => validateTenantMutationReferences(db, 'tenant-a', '/sales', {
    clientId: 'client-a', lines: [{ productId: 'product-a' }],
  }));
  await assert.doesNotReject(() => validateTenantMutationReferences(db, 'tenant-a', '/purchases', {
    supplierId: 'supplier-a', lines: [{ productId: 'product-a' }],
  }));
  await assert.doesNotReject(() => validateTenantMutationReferences(db, 'tenant-a', '/tax/declarations', { periodId: 'period-a' }));
});

test('unrelated routes do not perform reference validation', async () => {
  const db = dbFixture();
  await assert.doesNotReject(() => validateTenantMutationReferences(db, 'tenant-a', '/clients', { clientId: 'other' }));
});
