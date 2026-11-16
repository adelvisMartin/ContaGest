import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';
import { writeAudit } from '../backend/src/shared/services/audit.service.ts';

// #664 representative non-financial CRUD against the actual Express API and ephemeral PG.
test('#664 real client CRUD is persisted, tenant-bound and auditable', async (t) => {
  const h = await createRealBackendHarness();
  let clientId = '';
  t.after(async () => {
    try {
      if (clientId) {
        await h.prisma.client.deleteMany({ where: { id: clientId, tenantId: h.tenant.id } });
        await h.prisma.auditLog.deleteMany({ where: { entityId: clientId, tenantId: h.tenant.id } });
      }
    } finally {
      await h.close();
    }
  });

  const rif = `J-SMOKE-${randomUUID().slice(0, 8)}`;
  const name = `#664 Client ${rif}`;
  // #638/#1288: a client-supplied tenant is mass assignment, not a
  // supported alias. The server must reject it before persistence.
  await h.status('/clients', 422, {
    method: 'POST', body: JSON.stringify({
      rif, name, contact: 'Synthetic QA', tenantId: randomUUID()
    })
  });
  const denied = await h.prisma.client.count({ where: { rif, tenantId: h.tenant.id } });
  assert.equal(denied, 0, 'tenant-spoofed request must not create a row');

  const created = await h.ok('/clients', {
    method: 'POST', body: JSON.stringify({ rif, name, contact: 'Synthetic QA' })
  });
  clientId = String(created.id || '');
  assert.ok(clientId, 'create should return persistent resource identity');
  assert.equal(created.tenantId, h.tenant.id, 'caller-provided tenantId must not override session');

  const before = await h.ok(`/clients/${encodeURIComponent(clientId)}`);
  assert.equal(before.rif, rif);
  assert.equal(before.name, name);

  const updatedName = `${name} updated`;
  const updated = await h.ok(`/clients/${encodeURIComponent(clientId)}`, {
    method: 'PUT', body: JSON.stringify({ name: updatedName })
  });
  assert.equal(updated.id, clientId);
  assert.equal(updated.name, updatedName);
  const reloaded = await h.ok(`/clients/${encodeURIComponent(clientId)}`);
  assert.equal(reloaded.name, updatedName);

  const audit = await h.prisma.auditLog.findMany({ where: { entityId: clientId, tenantId: h.tenant.id } });
  assert.equal(audit.filter(row => row.action === 'create').length, 1, 'one create audit for one effect');
  assert.equal(audit.filter(row => row.action === 'update').length, 1, 'one update audit for one effect');

  await h.ok(`/clients/${encodeURIComponent(clientId)}`, { method: 'DELETE' });
  await h.status(`/clients/${encodeURIComponent(clientId)}`, 404);
  const deletion = await h.prisma.auditLog.findMany({ where: { entityId: clientId, tenantId: h.tenant.id } });
  assert.equal(deletion.filter(row => row.action === 'delete').length, 1, 'one delete audit for one effect');
});


test('#638/#1289 PostgreSQL rejects unaudited CRUD when the audit FK fails', async (t) => {
  const h = await createRealBackendHarness();
  const rif = `J-ROLLBACK-${randomUUID().slice(0, 8)}`;
  t.after(async () => {
    try {
      // Idempotent guard for a failing assertion, never a production database.
      await h.prisma.client.deleteMany({ where: { tenantId: h.tenant.id, rif } });
    } finally {
      await h.close();
    }
  });

  await assert.rejects(h.prisma.$transaction(async (tx) => {
    const created = await tx.client.create({
      data: { tenantId: h.tenant.id, rif, name: 'Rollback fixture #638' }
    });
    // Valid tenant + invalid synthetic user violates AuditLog.user FK. The
    // domain mutation must roll back rather than commit without provenance.
    await writeAudit({
      tenantId: h.tenant.id, userId: randomUUID(), action: 'create',
      entity: 'client', entityId: created.id, after: created
    }, tx);
  }));
  assert.equal(await h.prisma.client.count({ where: { tenantId: h.tenant.id, rif } }), 0,
    'the client must not survive a failed audit transaction');
});
