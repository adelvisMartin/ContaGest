import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';
import { writeAudit } from '../backend/src/shared/services/audit.service.ts';

/**
 * Real PostgreSQL17 only. The shared harness refuses databases without an
 * ephemeral suffix before creating any server-bound test session.
 *
 * A non-existent synthetic user ID deterministically violates AuditLog's
 * foreign key. The client mutation must roll back with the audit write.
 * No triggers, schema changes, authorization bypasses or production data.
 */
test('#638/#1289 CRUD audit rollback: create/update/delete never commit without audit', async (t) => {
  const h = await createRealBackendHarness();
  const tenantId = h.tenant.id;
  const invalidUserId = randomUUID();
  const rif = `J-QA-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  let clientId = '';

  // Rejecting on *any* Prisma error can hide a broken fixture. Each negative
  // transaction must reach the audit write and fail with the FK violation.
  async function expectAuditFkFailure(action: string, run: (reachedAudit: () => void) => Promise<unknown>) {
    let auditAttempted = false;
    await assert.rejects(run(() => { auditAttempted = true; }), (error: unknown) => {
      assert.equal(auditAttempted, true, action + ': mutation must reach AuditLog');
      const code = String((error as { code?: unknown; meta?: { code?: unknown } })?.code
        ?? (error as { meta?: { code?: unknown } })?.meta?.code ?? '');
      assert.ok(code === 'P2003' || code === '23503',
        action + ': expected an AuditLog foreign-key error, received ' + (code || 'no database code'));
      return true;
    });
  }

  t.after(async () => {
    try {
      if (clientId) {
        await h.prisma.auditLog.deleteMany({ where: { tenantId, entity: 'client', entityId: clientId } });
        await h.prisma.client.deleteMany({ where: { tenantId, id: clientId } });
      }
      await h.prisma.client.deleteMany({ where: { tenantId, rif } });
    } finally {
      await h.close();
    }
  });

  // CREATE: never persist a customer if the transaction's audit cannot commit.
  await expectAuditFkFailure('create', (reachedAudit) => h.prisma.$transaction(async (tx) => {
    const created = await tx.client.create({ data: { tenantId, rif, name: 'QA Audit Rollback Create' } });
    reachedAudit();
    await writeAudit({
      tenantId, userId: invalidUserId, action: 'create',
      entity: 'client', entityId: created.id, after: created
    }, tx);
  }));
  assert.equal(await h.prisma.client.count({ where: { tenantId, rif } }), 0,
    'CREATE must roll back after the AuditLog foreign-key error');

  // Positive control: a valid audit and client are committed together.
  const created = await h.prisma.$transaction(async (tx) => {
    const customer = await tx.client.create({ data: { tenantId, rif, name: 'QA Audit Original' } });
    await writeAudit({
      tenantId, userId: h.admin.id, action: 'create',
      entity: 'client', entityId: customer.id, after: customer
    }, tx);
    return customer;
  });
  clientId = created.id;
  assert.equal(await h.prisma.auditLog.count({
    where: { tenantId, entity: 'client', entityId: clientId, action: 'create' }
  }), 1);

  // UPDATE: data and audit use the same interactive Prisma transaction.
  await expectAuditFkFailure('update', (reachedAudit) => h.prisma.$transaction(async (tx) => {
    const updated = await tx.client.update({
      where: { id: clientId, tenantId },
      data: { name: 'QA Audit Should Not Persist' }
    });
    reachedAudit();
    await writeAudit({
      tenantId, userId: invalidUserId, action: 'update',
      entity: 'client', entityId: clientId, before: created, after: updated
    }, tx);
  }));
  const afterUpdate = await h.prisma.client.findFirst({ where: { tenantId, id: clientId } });
  assert.equal(afterUpdate?.name, 'QA Audit Original',
    'UPDATE must roll back after the AuditLog foreign-key error');

  // DELETE: audit failure cannot permanently remove the business record.
  await expectAuditFkFailure('delete', (reachedAudit) => h.prisma.$transaction(async (tx) => {
    const before = await tx.client.findFirstOrThrow({ where: { tenantId, id: clientId } });
    await tx.client.delete({ where: { id: clientId, tenantId } });
    reachedAudit();
    await writeAudit({
      tenantId, userId: invalidUserId, action: 'delete',
      entity: 'client', entityId: clientId, before
    }, tx);
  }));
  assert.equal(await h.prisma.client.count({ where: { tenantId, id: clientId } }), 1,
    'DELETE must roll back after the AuditLog foreign-key error');

  assert.equal(await h.prisma.auditLog.count({ where: {
    tenantId, entity: 'client', entityId: clientId
  } }), 1, 'Only the successfully committed positive create may be audited');
});
