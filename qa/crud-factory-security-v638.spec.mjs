import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * Opt-in REAL HTTP/PG17 integration, not a browser mock.
 * Requires two isolated test-tenant identities, both with clients.manage and
 * accepted legal/licensing state. It refuses any non-loopback destination.
 *
 * Example:
 * QA_BASE_URL=http://127.0.0.1:3000
 * CG_CRUD_E2E_API_BASE_URL=http://127.0.0.1:3000
 * CG_CRUD_E2E_ISOLATED=true
 * CG_CRUD_E2E_TOKEN_A=<local-synthetic-test-token>
 * CG_CRUD_E2E_TOKEN_B=<different-tenant-test-token>
 * npx playwright test qa/crud-factory-security-v638.spec.mjs --project=chromium
 */
function fixture() {
  const raw = process.env.CG_CRUD_E2E_API_BASE_URL || '';
  if (process.env.CG_CRUD_E2E_ISOLATED !== 'true') {
    throw new Error('BLOCKED: CG_CRUD_E2E_ISOLATED=true required for a disposable PostgreSQL fixture');
  }
  let url;
  try { url = new URL(raw); }
  catch { throw new Error('BLOCKED: local CRUD E2E API URL not configured'); }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.protocol !== 'http:') {
    throw new Error('BLOCKED: CRUD E2E refuses non-loopback and production targets');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('BLOCKED: unexpected URL components');
  const tokenA = process.env.CG_CRUD_E2E_TOKEN_A;
  const tokenB = process.env.CG_CRUD_E2E_TOKEN_B;
  if (!tokenA || !tokenB || tokenA === tokenB) {
    throw new Error('BLOCKED: two different, locally seeded tenant tokens are required');
  }
  return { base: url.origin + url.pathname.replace(/\/$/, ''), tokenA, tokenB };
}

test('CRUD #638: create/read/update/delete remains tenant scoped across real API + PostgreSQL', async ({ request }) => {
  const { base, tokenA, tokenB } = fixture();
  const headersA = { Authorization: `Bearer ${tokenA}` };
  const headersB = { Authorization: `Bearer ${tokenB}` };
  const customerRif = `J${randomUUID().replaceAll('-', '').slice(0, 11)}`;
  const customer = { rif: customerRif, name: 'QA CRUD Isolation #638', active: true };
  let createdId;

  try {
    const spoof = await request.post(`${base}/api/v1/clients`, {
      headers: headersA, data: { ...customer, tenantId: 'forged-tenant-id' }
    });
    expect(spoof.status()).toBe(422);

    const bankBalanceSpoof = await request.post(`${base}/api/v1/bank-accounts`, {
      headers: headersA, data: { bankName: 'Banco QA', accountNo: randomUUID(), balance: 99999 }
    });
    expect(bankBalanceSpoof.status()).toBe(422);

    const created = await request.post(`${base}/api/v1/clients`, { headers: headersA, data: customer });
    expect([200, 201]).toContain(created.status());
    const response = await created.json();
    expect(response.ok).toBe(true);
    createdId = response.data?.id;
    expect(typeof createdId).toBe('string');

    const otherTenantRead = await request.get(`${base}/api/v1/clients/${encodeURIComponent(createdId)}`, { headers: headersB });
    expect(otherTenantRead.status()).toBe(404);

    const otherTenantWrite = await request.put(`${base}/api/v1/clients/${encodeURIComponent(createdId)}`, {
      headers: headersB, data: { name: 'INTRUSION' }
    });
    expect(otherTenantWrite.status()).toBe(404);

    const otherTenantDelete = await request.delete(`${base}/api/v1/clients/${encodeURIComponent(createdId)}`, { headers: headersB });
    expect(otherTenantDelete.status()).toBe(404);

    const fakeIdUpdate = await request.put(`${base}/api/v1/clients/${encodeURIComponent(createdId)}`, {
      headers: headersA, data: { id: 'forged-id', name: 'Changed' }
    });
    expect(fakeIdUpdate.status()).toBe(422);

    const invalidSort = await request.get(`${base}/api/v1/clients?sort=tenantId`, { headers: headersA });
    expect(invalidSort.status()).toBe(422);

    const updated = await request.put(`${base}/api/v1/clients/${encodeURIComponent(createdId)}`, {
      headers: headersA, data: { name: 'QA CRUD Isolation Patched #638' }
    });
    expect(updated.status()).toBe(200);
    const reloaded = await request.get(`${base}/api/v1/clients/${encodeURIComponent(createdId)}`, { headers: headersA });
    expect(reloaded.status()).toBe(200);
    expect((await reloaded.json()).data.name).toBe('QA CRUD Isolation Patched #638');
  } finally {
    if (createdId) {
      const cleanup = await request.delete(`${base}/api/v1/clients/${encodeURIComponent(createdId)}`, { headers: headersA });
      expect(cleanup.status(), 'Test-created client must be cleaned in disposable DB').toBe(200);
    }
  }
});
