import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import test, { after, before } from 'node:test';
import { createApp } from '../backend/src/app.ts';
import { prisma } from '../backend/src/database/prisma.ts';
import { signAccessToken } from '../backend/src/shared/auth/jwt.ts';
import {
  allocateDocumentNumber,
  configureDocumentSequence,
  PURCHASE_INVOICE_SEQUENCE_KEY,
  SALES_INVOICE_SEQUENCE_KEY
} from '../backend/src/shared/services/document-sequence.service.ts';
import { runFinancialIdempotentMutation } from '../backend/src/shared/services/financial-idempotency.service.ts';

if (process.env.DOCUMENT_SEQUENCE_TEST_ISOLATED_DB !== '1') {
  throw new Error('DOCUMENT_SEQUENCE_TEST_REQUIRES_ISOLATED_EPHEMERAL_POSTGRES');
}

const runId = randomUUID().replace(/-/g, '').slice(0, 16);
const tenantRif = `QA-762-${runId}`;
let tenantId = '';
let token = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let baseUrl = '';

async function request(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('authorization', `Bearer ${token}`);
  headers.set('x-forwarded-for', '10.76.2.1');
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${baseUrl}/api/v1${path}`, { ...options, headers });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  return { response, payload, data: payload?.data ?? payload };
}

async function expectOk(path: string, options: RequestInit = {}) {
  const result = await request(path, options);
  assert.equal(result.response.ok, true, `${options.method || 'GET'} ${path} -> ${result.response.status}: ${JSON.stringify(result.payload)}`);
  assert.notEqual(result.payload?.ok, false, `${path} returned ok=false`);
  return result;
}

before(async () => {
  const tenant = await prisma.tenant.create({
    data: {
      rif: tenantRif,
      name: `QA Document Sequence ${runId}`,
      legalName: `QA Document Sequence ${runId}`,
      plan: 'enterprise',
      status: 'active',
      settings: {}
    }
  });
  tenantId = tenant.id;

  const permissionKeys = ['sales.manage', 'sales.view', 'purchases.manage', 'admin.manage'];
  const permissions = [];
  for (const key of permissionKeys) {
    permissions.push(await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: `QA #762 ${key}` }
    }));
  }
  const role = await prisma.role.create({
    data: { tenantId, name: `QA-762-${runId}`, description: 'Ephemeral #762 test role', system: false }
  });
  const user = await prisma.userProfile.create({
    data: {
      tenantId,
      email: `qa-762-${runId}@example.invalid`,
      fullName: 'QA #762',
      status: 'active'
    }
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  await prisma.rolePermission.createMany({
    data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id }))
  });
  token = signAccessToken({ id: user.id, email: user.email }, tenantId);

  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  await prisma.$disconnect();
});

test('concurrent allocation is unique, gap-free for committed allocations, and tenant-scoped', async () => {
  const key = `qa.concurrent.${runId}`;
  const results = await Promise.all(Array.from({ length: 24 }, () =>
    prisma.$transaction((tx) => allocateDocumentNumber({ tenantId, key, defaults: { padding: 4 } }, tx))
  ));
  const numbers = results.map((result) => result.number).sort();
  assert.equal(new Set(numbers).size, 24);
  assert.deepEqual(numbers, Array.from({ length: 24 }, (_, index) => String(index + 1).padStart(4, '0')));

  const otherTenant = await prisma.tenant.create({
    data: { rif: `QA-762-B-${runId}`, name: `QA Document Sequence B ${runId}`, plan: 'enterprise', status: 'active', settings: {} }
  });
  try {
    const isolated = await prisma.$transaction((tx) => allocateDocumentNumber({ tenantId: otherTenant.id, key, defaults: { padding: 4 } }, tx));
    assert.equal(isolated.number, '0001');
  } finally {
    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  }
});

test('financial idempotency replay reuses the original number without consuming another value', async () => {
  const key = `qa.idempotent.${runId}`;
  const input = {
    tenantId,
    scope: `qa.sequence.${runId}`,
    key: `retry-${runId}`,
    request: { operation: 'allocate', runId }
  };
  const effect = (tx: Parameters<Parameters<typeof runFinancialIdempotentMutation>[1]>[0]) =>
    allocateDocumentNumber({ tenantId, key, defaults: { prefix: 'ID-', padding: 3 } }, tx)
      .then((allocated) => ({ data: { number: allocated.number }, resourceType: 'DocumentSequence' }));

  const first = await runFinancialIdempotentMutation(input, effect);
  const second = await runFinancialIdempotentMutation(input, effect);
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.deepEqual(second.data, first.data);
  assert.equal(first.data.number, 'ID-001');

  const rows = await prisma.$queryRaw<Array<{ currentValue: bigint }>>`
    SELECT "currentValue" FROM public."DocumentSequence"
    WHERE "tenantId"=${tenantId} AND "key"=${key} AND "periodKey"=''
  `;
  assert.equal(rows[0]?.currentValue, 1n);
});

test('configuration cannot rewind an existing sequence and overflow fails closed', async () => {
  const key = `qa.overflow.${runId}`;
  await configureDocumentSequence({ tenantId, key, padding: 1, currentValue: '8' });
  const ninth = await prisma.$transaction((tx) => allocateDocumentNumber({ tenantId, key }, tx));
  assert.equal(ninth.number, '9');

  await assert.rejects(
    prisma.$transaction((tx) => allocateDocumentNumber({ tenantId, key }, tx)),
    (error: any) => error?.status === 409 && error?.details?.code === 'DOCUMENT_SEQUENCE_EXHAUSTED'
  );
  await assert.rejects(
    configureDocumentSequence({ tenantId, key, currentValue: '7' }),
    (error: any) => error?.status === 409 && error?.details?.code === 'DOCUMENT_SEQUENCE_REWIND_FORBIDDEN'
  );
});

test('admin API configures formatting; invoices auto-number; explicit import numbers do not consume sequence', async () => {
  const salesPrefix = `S-${runId.slice(0, 6)}-`;
  const purchasePrefix = `P-${runId.slice(0, 6)}-`;
  const salesConfig = await expectOk(`/document-sequences/${SALES_INVOICE_SEQUENCE_KEY}`, {
    method: 'PUT',
    body: JSON.stringify({ prefix: salesPrefix, padding: 4, currentValue: '0' })
  });
  assert.equal(salesConfig.data.currentValue, '0');

  await expectOk(`/document-sequences/${PURCHASE_INVOICE_SEQUENCE_KEY}`, {
    method: 'PUT',
    body: JSON.stringify({ prefix: purchasePrefix, padding: 4, currentValue: '0' })
  });

  const saleBody = {
    fiscalPeriod: '2026-09',
    currency: 'VES',
    exchangeRate: '1',
    status: 'draft',
    lines: [{ description: 'QA #762 sale', quantity: '1', unitPrice: '10', taxRate: '0' }]
  };
  const idemKey = `sale-${runId}`;
  const firstSale = await expectOk('/sales', {
    method: 'POST',
    headers: { 'Idempotency-Key': idemKey },
    body: JSON.stringify(saleBody)
  });
  const replaySale = await expectOk('/sales', {
    method: 'POST',
    headers: { 'Idempotency-Key': idemKey },
    body: JSON.stringify(saleBody)
  });
  assert.equal(firstSale.data.number, `${salesPrefix}0001`);
  assert.equal(replaySale.data.id, firstSale.data.id);
  assert.equal(replaySale.response.headers.get('Idempotency-Replayed'), 'true');

  const explicitNumber = `IMPORT-${runId}`;
  const explicitSale = await expectOk('/sales', {
    method: 'POST',
    headers: { 'Idempotency-Key': `import-${runId}` },
    body: JSON.stringify({ ...saleBody, number: explicitNumber })
  });
  assert.equal(explicitSale.data.number, explicitNumber);

  const purchase = await expectOk('/purchases', {
    method: 'POST',
    headers: { 'Idempotency-Key': `purchase-${runId}` },
    body: JSON.stringify({
      fiscalPeriod: '2026-09',
      currency: 'VES',
      exchangeRate: '1',
      status: 'draft',
      lines: [{ description: 'QA #762 purchase', quantity: '1', unitCost: '5', taxRate: '0' }]
    })
  });
  assert.equal(purchase.data.number, `${purchasePrefix}0001`);

  const configured = await expectOk(`/document-sequences?key=${encodeURIComponent(SALES_INVOICE_SEQUENCE_KEY)}`);
  assert.equal(configured.data.length, 1);
  assert.equal(configured.data[0].currentValue, '1');
  assert.equal(configured.data[0].prefix, salesPrefix);
});
