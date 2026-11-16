import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

// #664 representative non-financial CRUD against the actual Express API and ephemeral PG.
test('#664 real client CRUD is persisted, tenant-bound and auditable', async (t) => {
  const h = await createRealBackendHarness();
  let clientId = '';
  let restrictedUserId = '';
  t.after(async () => {
    try {
      if (clientId) {
        await h.prisma.client.deleteMany({ where: { id: clientId, tenantId: h.tenant.id } });
        await h.prisma.auditLog.deleteMany({ where: { entityId: clientId, tenantId: h.tenant.id } });
      }
    } finally {
      try { await h.close(); }
      finally {
        if (restrictedUserId) await h.prisma.userProfile.deleteMany({
          where: { id: restrictedUserId, tenantId: h.tenant.id }
        });
      }
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
  assert.equal(created.tenantId, h.tenant.id, 'tenant authority must come from the signed session');

  // A valid, active session without clients.manage does not authorize
  // object access or mass mutations, even within the same tenant.
  const restricted = await h.prisma.userProfile.create({
    data: {
      tenantId: h.tenant.id,
      email: `qa-crud-${randomUUID().slice(0, 12)}@example.test`,
      fullName: 'Synthetic CRUD Restricted',
      passwordHash: 'not-a-login-password-synthetic-qa',
      status: 'active'
    }
  });
  restrictedUserId = restricted.id;
  const deniedToken = await h.issueSessionTokenFor({ id: restricted.id, email: restricted.email });
  await h.status('/clients', 403, {}, deniedToken);
  const deniedRead = await h.status(`/clients/${encodeURIComponent(clientId)}`, 403, {}, deniedToken);
  assert.doesNotMatch(JSON.stringify(deniedRead.payload), new RegExp(rif));
  await h.status('/clients', 403, {
    method: 'POST', body: JSON.stringify({ rif: 'J-UNAUTHORIZED', name: 'Denied' })
  }, deniedToken);
  // A revoked server-side UserSession invalidates a still-unexpired JWT.
  await h.prisma.$executeRaw`
    UPDATE public."UserSession" SET "status"='revoked', "updatedAt"=now()
    WHERE "userId"=${restricted.id} AND "tenantId"=${h.tenant.id} AND "status"='active'
  `;
  await h.status('/clients', 401, {}, deniedToken);

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
