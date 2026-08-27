import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealBackendHarness } from './support/real-backend-harness.ts';
import { signAccessToken } from '../backend/src/shared/auth/jwt.ts';

const RUN = `QA91-AUTHZ-${Date.now().toString(36).toUpperCase()}`;
const CUSTOMER_ID = `${RUN}-customer`;
const SUBSCRIPTION_ID = `${RUN}-subscription`;
const SUBSCRIPTION_TENANT_ID = `${RUN}-subscription-tenant`;
const LICENSE_ID = `${RUN}-license`;

test('issue #91 authenticated licensed user without accounting permissions cannot view, post or reverse ledger', async (t) => {
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

  // Honor the same commercial entitlement chain enforced by the #28 database triggers.
  // The test intentionally grants identity + active license, but no accounting role/permission,
  // so the expected denial exercises RBAC rather than failing earlier on licensing.
  await h.prisma.$executeRaw`
    INSERT INTO public."CustomerAccount"
      ("id","legalName","rif","segment","status","metadata","createdAt","updatedAt")
    VALUES
      (${CUSTOMER_ID},${`${RUN} Customer`},${`J-${RUN.slice(-8)}`},'qa','active','{}'::jsonb,now(),now())
  `;
  await h.prisma.$executeRaw`
    INSERT INTO public."Subscription"
      ("id","customerAccountId","planCode","customerSegment","billingCycle","currency","amount","status","startsAt","maxTenants","maxUsers","supportLevel","metadata","createdAt","updatedAt")
    VALUES
      (${SUBSCRIPTION_ID},${CUSTOMER_ID},'qa91','qa','monthly','USD',1,'active',now(),1,1,'standard','{}'::jsonb,now(),now())
  `;
  await h.prisma.$executeRaw`
    INSERT INTO public."SubscriptionTenant"
      ("id","subscriptionId","tenantId","status","createdAt","updatedAt")
    VALUES
      (${SUBSCRIPTION_TENANT_ID},${SUBSCRIPTION_ID},${h.tenant.id},'active',now(),now())
  `;
  const keyHash = `${RUN.replace(/[^A-Z0-9]/gi, '').padEnd(64, '9').slice(0, 64)}`;
  await h.prisma.$executeRaw`
    INSERT INTO public."LicenseKey"
      ("id","tenantId","userId","userEmail","plan","keyHash","keyPreview","modules","expiresAt","status","subscriptionId","createdAt","updatedAt")
    VALUES
      (${LICENSE_ID},${h.tenant.id},${user.id},${user.email},'qa91',${keyHash},${`${RUN.slice(0, 12)}…`},'[]'::jsonb,'2099-12-31T23:59:59.000Z'::timestamptz,'active',${SUBSCRIPTION_ID},now(),now())
  `;

  const token = signAccessToken({ id: user.id, email: user.email }, h.tenant.id);

  const viewDenied = await h.status('/accounting/entries', 403, { method: 'GET' }, token);
  assert.match(JSON.stringify(viewDenied.payload), /Permiso requerido: accounting\.view/i);

  const createDenied = await h.status('/accounting/entries', 403, {
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
  assert.match(JSON.stringify(createDenied.payload), /Permiso requerido: accounting\.post/i);

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

  const postDenied = await h.status(`/accounting/entries/${adminPosted.id}/post`, 403, { method: 'POST' }, token);
  assert.match(JSON.stringify(postDenied.payload), /Permiso requerido: accounting\.post/i);
  const reverseDenied = await h.status(`/accounting/entries/${adminPosted.id}/reverse`, 403, {
    method: 'POST',
    body: JSON.stringify({ fiscalPeriod: '2097-10' })
  }, token);
  assert.match(JSON.stringify(reverseDenied.payload), /Permiso requerido: accounting\.post/i);
});
