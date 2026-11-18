import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

const RUN = 'QA757-' + randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase();

test('#757 draft deletion is atomic, audited and tenant-scoped in disposable PostgreSQL', async (t) => {
  const h = await createRealBackendHarness();
  const invoiceIds: string[] = [];
  let otherTenantId: string | null = null;

  t.after(async () => {
    try {
      await h.prisma.auditLog.deleteMany({
        where: { tenantId: h.tenant.id, entity: 'PurchaseInvoice', entityId: { in: invoiceIds } },
      });
      await h.prisma.purchaseInvoice.deleteMany({
        where: { tenantId: h.tenant.id, id: { in: invoiceIds } },
      });
      if (otherTenantId) await h.prisma.tenant.delete({ where: { id: otherTenantId } });
    } finally {
      await h.close();
    }
  });

  async function draft(label: string) {
    const purchase = await h.ok('/purchases', {
      method: 'POST',
      body: JSON.stringify({
        number: ${RUN}-${label}, fiscalPeriod: '2097-07', status: 'draft',
        lines: [{ description: ${RUN} test, quantity: '1.000', unitCost: '17.25', taxRate: '0' }],
      }),
    }) as { id: string; status: string };
    invoiceIds.push(purchase.id);
    assert.equal(purchase.status, 'draft');
    assert.equal(await h.prisma.ledgerEntry.count({
      where: { tenantId: h.tenant.id, source: 'purchase', sourceId: purchase.id },
    }), 0, 'Draft creation must not post AP/GL');
    return purchase;
  }

  await t.test('success deletes only the draft and persists exactly one actor audit', async () => {
    const purchase = await draft('SUCCESS');
    const result = await h.ok($/purchases/${purchase.id}, { method: 'DELETE' }) as { deleted: boolean; id: string };
    assert.deepEqual(result, { deleted: true, id: purchase.id });
    assert.equal(await h.prisma.purchaseInvoice.count({ where: { id: purchase.id, tenantId: h.tenant.id } }), 0);
    const audit = await h.prisma.auditLog.findMany({
      where: { tenantId: h.tenant.id, entity: 'PurchaseInvoice', entityId: purchase.id, action: 'delete-draft' },
    });
    assert.equal(audit.length, 1);
    assert.equal(audit[0].userId, h.admin.id);
    assert.equal((audit[0].before as { id?: string } | null)?.id, purchase.id);
  });

  await t.test('forced audit failure rolls back the invoice deletion and line cascades', async () => {
    const purchase = await draft('AUDIT-ROLLBACK');
    const guard = 'qa757_' + randomUUID().replaceAll('-', '');
    // Constructed exclusively from random UUIDs and ids issued by the QA
    // database; this trigger is never created outside the guarded _e2e DB.
    assert.match(guard, /^qa757_[a-f0-9]{32}$/);
    assert.match(purchase.id, /^[a-f0-9-]{36}$/i);
    assert.match(h.tenant.id, /^[a-f0-9-]{36}$/i);
    try {
      await h.prisma.$executeRawUnsafe($
        CREATE FUNCTION public."${guard}"() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW."tenantId"='${h.tenant.id}'
            AND NEW."entityId"='${purchase.id}'
            AND NEW."action"='delete-draft'
          THEN RAISE EXCEPTION 'QA757_AUDIT_FAILURE';
          END IF;
          RETURN NEW;
        END;
        $$$);
      await h.prisma.$executeRawUnsafe($
        CREATE TRIGGER "${guard}" BEFORE INSERT ON public."AuditLog"
        FOR EACH ROW EXECUTE FUNCTION public."${guard}"()$);
      await h.status($/purchases/${purchase.id}, 500, { method: 'DELETE' });
    } finally {
      await h.prisma.$executeRawUnsafe($DROP TRIGGER IF EXISTS "${guard}" ON public."AuditLog"$);
      await h.prisma.$executeRawUnsafe($DROP FUNCTION IF EXISTS public."${guard}"()$);
    }
    assert.equal(await h.prisma.purchaseInvoice.count({
      where: { id: purchase.id, tenantId: h.tenant.id },
    }), 1, 'Audit failure must roll back the draft deletion');
    assert.equal(await h.prisma.purchaseInvoiceLine.count({ where: { invoiceId: purchase.id } }), 1,
      'Failed deletion must not cascade into invoice lines');
    assert.equal(await h.prisma.auditLog.count({
      where: { tenantId: h.tenant.id, entityId: purchase.id, action: 'delete-draft' },
    }), 0);
    await h.ok($/purchases/${purchase.id}, { method: 'DELETE' });
  });

  await t.test('foreign tenant draft is not exposed or deleted', async () => {
    const tenant = await h.prisma.tenant.create({
      data: { rif: ${RUN}-TENANT-B, name: ${RUN} tenant B, legalName: 'QA isolated tenant' },
    });
    otherTenantId = tenant.id;
    const purchase = await h.prisma.purchaseInvoice.create({
      data: {
        tenantId: tenant.id, number: ${RUN}-FOREIGN, fiscalPeriod: '2097-07', status: 'draft',
        lines: { create: [{ description: 'QA isolated supplier invoice', quantity: '1.000',
          unitCost: '1.00', taxRate: '0', total: '1.00' }] },
      },
    });
    await h.status($/purchases/${purchase.id}, 404, { method: 'DELETE' });
    assert.equal(await h.prisma.purchaseInvoice.count({
      where: { id: purchase.id, tenantId: tenant.id },
    }), 1, 'Tenant A must never delete tenant B draft');
  });

  await t.test('missing draft returns 404 without audit side effect', async () => {
    const unknown = randomUUID();
    await h.status($/purchases/${unknown}, 404, { method: 'DELETE' });
    assert.equal(await h.prisma.auditLog.count({
      where: { tenantId: h.tenant.id, entity: 'PurchaseInvoice', entityId: unknown, action: 'delete-draft' },
    }), 0);
  });
});
