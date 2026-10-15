import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

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
  const created = await h.ok('/clients', {
    method: 'POST', body: JSON.stringify({
      rif, name, contact: 'Synthetic QA', tenantId: randomUUID()
    })
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
  assert.ok(audit.some(row => row.action === 'create'));
  assert.ok(audit.some(row => row.action === 'update'));

  await h.ok(`/clients/${encodeURIComponent(clientId)}`, { method: 'DELETE' });
  await h.status(`/clients/${encodeURIComponent(clientId)}`, 404);
  const deletion = await h.prisma.auditLog.findMany({ where: { entityId: clientId, tenantId: h.tenant.id } });
  assert.ok(deletion.some(row => row.action === 'delete'));
});
