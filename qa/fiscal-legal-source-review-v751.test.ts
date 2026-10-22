import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { signAccessToken } from '../backend/src/shared/auth/jwt.ts';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

test('#751 PostgreSQL17 review requires a second authorized actor and preserves immutable legal capture', async (t) => {
  const h = await createRealBackendHarness();
  t.after(async () => h.close());
  const db = await h.prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  assert.match(db[0]?.name || '', /fiscal_v561_e2e$/, 'only disposable PG17 fixture is permitted');

  const suffix = randomUUID().slice(0, 8);
  const reviewer = await h.prisma.userProfile.create({ data: {
    tenantId: h.tenant.id, email: `qa751-${suffix}@example.invalid`, fullName: 'QA fiscal independent reviewer'
  } });
  t.after(async () => { await h.prisma.userProfile.delete({ where: { id: reviewer.id } }); });
  const adminRoles = await h.prisma.userRole.findMany({ where: { userId: h.admin.id }, select: { roleId: true } });
  await h.prisma.userRole.createMany({ data: adminRoles.map(({ roleId }) => ({ userId: reviewer.id, roleId })) });
  const reviewerToken = await h.issueSessionTokenFor(reviewer);
  const unprivileged = await h.prisma.userProfile.create({ data: {
    tenantId: h.tenant.id, email: `qa751-denied-${suffix}@example.invalid`, fullName: 'QA fiscal read-only denial'
  } });
  t.after(async () => { await h.prisma.userProfile.delete({ where: { id: unprivileged.id } }); });
  const unprivilegedToken = await h.issueSessionTokenFor(unprivileged);

  const unboundToken = signAccessToken({ id: h.admin.id, email: h.admin.email }, h.tenant.id);
  await h.status('/fiscal/legal-sources', 401, {}, unboundToken);
  const contentSha256 = createHash('sha256').update(`synthetic legal source ${suffix}`).digest('hex');
  const created = await h.ok('/fiscal/legal-sources', { method: 'POST', body: JSON.stringify({
    sourceType: 'official_gazette', reference: `QA-GAZETA-${suffix}`, title: 'Documento sintético sin valor legal',
    sourceUrl: 'https://example.org/fiscal-test', contentSha256
  }) });
  assert.equal(created.status, 'DRAFT');
  assert.equal(created.tenantId, h.tenant.id);
  const reviewBody = JSON.stringify({ approved: true, reason: `Revisado contra fixture sintético ${suffix}.` });
  await h.status(`/fiscal/legal-sources/${created.id}/review`, 409, { method: 'POST', body: reviewBody });
  await h.status(`/fiscal/legal-sources/${created.id}/review`, 403, { method: 'POST', body: reviewBody }, unprivilegedToken);

  const race = await Promise.all([
    h.request(`/fiscal/legal-sources/${created.id}/review`, { method: 'POST', body: reviewBody }, reviewerToken),
    h.request(`/fiscal/legal-sources/${created.id}/review`, { method: 'POST', body: reviewBody }, reviewerToken)
  ]);
  assert.deepEqual(race.map(row => row.response.status).sort(), [200, 409]);
  const rows = await h.prisma.$queryRaw<Array<{
    status: string; contentSha256: string; createdBy: string; reviewedBy: string; reviewReason: string;
  }>>`SELECT "status", "contentSha256", "createdBy", "reviewedBy", "reviewReason"
       FROM public."FiscalLegalSource" WHERE "id" = ${created.id}::uuid AND "tenantId" = ${h.tenant.id}`;
  assert.equal(rows[0].status, 'REVIEWED');
  assert.equal(rows[0].contentSha256.trim(), contentSha256);
  assert.equal(rows[0].reviewedBy, reviewer.id);
  assert.notEqual(rows[0].createdBy, rows[0].reviewedBy);
  const audit = await h.prisma.auditLog.findMany({ where: { tenantId: h.tenant.id, entity: 'FiscalLegalSource', entityId: created.id, action: 'fiscal.legal_source.reviewed' } });
  assert.equal(audit.length, 1, 'one committed review must have one atomic audit');
  // The reviewed capture cannot be mutated through SQL even if a DB sidecar
  // inadvertently broadens privileges. Run only on the disposable fixture.
  await assert.rejects(
    h.prisma.$executeRaw`UPDATE public."FiscalLegalSource" SET "contentSha256"=${'0'.repeat(64)}
      WHERE "tenantId"=${h.tenant.id} AND "id"=${created.id}::uuid`,
    /FISCAL_LEGAL_SOURCE_IMMUTABLE/i
  );
  await assert.rejects(
    h.prisma.$executeRaw`DELETE FROM public."FiscalLegalSource"
      WHERE "tenantId"=${h.tenant.id} AND "id"=${created.id}::uuid`,
    /FISCAL_LEGAL_SOURCE_IMMUTABLE/i
  );

});
