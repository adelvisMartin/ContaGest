import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealBackendHarness } from './support/real-backend-harness.ts';
import { signAccessToken } from '../backend/src/shared/auth/jwt.ts';

const RUN = `QA91-AUTHZ-${Date.now().toString(36).toUpperCase()}`;

test('issue #91 authenticated user without accounting permissions cannot view, post or reverse ledger', async (t) => {
  const h = await createRealBackendHarness();
  t.after(async () => h.close());

  const database = await h.prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  assert.match(database[0]?.name || '', /_v91$/, 'RBAC test must run only on disposable #91 database');

  const user = await h.prisma.userProfile.create({
    data: {
      tenantId: h.tenant.id,
      email: `${RUN.toLowerCase()}@example.test`,
      fullName: `${RUN} No Accounting Role`,
      status: 'active'
    }
  });
  await h.prisma.licenseKey.create({
    data: {
      tenantId: h.tenant.id,
      userId: user.id,
      userEmail: user.email,
      plan: 'qa',
      keyHash: `${RUN}-HASH`,
      keyPreview: `${RUN.slice(0, 12)}…`,
      expiresAt: new Date('2099-12-31T23:59:59.000Z'),
      status: 'active',
      modules: []
    }
  });
  const token = signAccessToken({ id: user.id, email: user.email }, h.tenant.id);

  await h.status('/accounting/entries', 403, { method: 'GET' }, token);
  await h.status('/accounting/entries', 403, {
    method: 'POST',
    body: JSON.stringify({
      fiscalPeriod: '2097-09',
      description: `${RUN} forbidden create`,
      lines: [
        { accountCode: `${RUN}.D`, accountName: 'Debit', debit: '1.00' },
        { accountCode: `${RUN}.C`, accountName: 'Credit', credit: '1.00' }
      ]
    })
  }, token);

  const adminDraft = await h.ok('/accounting/entries', {
    method: 'POST',
    body: JSON.stringify({
      fiscalPeriod: '2097-09',
      description: `${RUN} admin draft`,
      lines: [
        { accountCode: `${RUN}.AD`, accountName: 'Admin debit', debit: '2.00' },
        { accountCode: `${RUN}.AC`, accountName: 'Admin credit', credit: '2.00' }
      ]
    })
  });
  const adminPosted = await h.ok(`/accounting/entries/${adminDraft.id}/post`, { method: 'POST' });
  assert.equal(adminPosted.posted, true);

  await h.status(`/accounting/entries/${adminPosted.id}/post`, 403, { method: 'POST' }, token);
  await h.status(`/accounting/entries/${adminPosted.id}/reverse`, 403, {
    method: 'POST',
    body: JSON.stringify({ fiscalPeriod: '2097-10' })
  }, token);
});
