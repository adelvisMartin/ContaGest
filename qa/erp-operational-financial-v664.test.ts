import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

// #664: only execute against the disposable database created by the smoke runner.
// The only financial POST is deliberately invalid, so no ledger can be posted.
test('#664 ERP health, tenant/auth, finance read and rejected synthetic posting', async (t) => {
  const h = await createRealBackendHarness();
  t.after(async () => { await h.close(); });

  for (const [path, status] of [['/health/live', 'live'], ['/health/ready', 'ready']] as const) {
    const response = await fetch(h.base + path, { redirect: 'error', cache: 'no-store' });
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type') || '', /^application\/json(?:;|$)/i);
    const result = await response.json();
    assert.equal(result.status, status, path);
    assert.equal(result.ok, true, path);
    assert.equal(typeof result.buildCommit, 'string');
    if (path.endsWith('ready')) {
      assert.equal(result.checks?.configuration, 'ok');
      assert.equal(result.checks?.database, 'ok');
    }
  }

  const unauthenticated = await h.request('/accounting/trial-balance', {}, null);
  assert.ok([401, 403].includes(unauthenticated.response.status), 'finance read must require identity');

  const trial = await h.ok('/accounting/trial-balance');
  assert.ok(Array.isArray(trial), 'trial balance contract must return rows');

  const tenantId = h.tenant.id;
  const before = await h.prisma.ledgerEntry.count({ where: { tenantId } });
  await h.status('/accounting/entries', 422, {
    method: 'POST',
    body: JSON.stringify({
      fiscalPeriod: '2097-10',
      description: 'Synthetic smoke: reject unbalanced entry',
      source: 'manual',
      lines: [
        { accountCode: 'SMOKE.D', accountName: 'Synthetic Debit', debit: 7, credit: 0 },
        { accountCode: 'SMOKE.C', accountName: 'Synthetic Credit', debit: 0, credit: 6 }
      ]
    })
  });
  const after = await h.prisma.ledgerEntry.count({ where: { tenantId } });
  assert.equal(after, before, 'rejected command must not persist a journal');
});
