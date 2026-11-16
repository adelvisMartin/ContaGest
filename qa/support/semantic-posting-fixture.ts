import assert from 'node:assert/strict';
import type { createRealBackendHarness } from './real-backend-harness.ts';

/**
 * Explicitly opt in to #785 account-role configuration in an isolated QA DB.
 * Never run this on a production or shared tenant; production mappings must be
 * reviewed and selected by its accounting administrator.
 */
export async function prepareQaSemanticPosting(
  h: Pick<Awaited<ReturnType<typeof createRealBackendHarness>>, 'ok' | 'prisma'>,
) {
  const db = await h.prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  assert.match(db[0]?.name || '', /^contagest_[a-z0-9_]+(?:_v\d+|_e2e)$/i,
    '#785 fixture may run only in a disposable versioned QA PostgreSQL database');

  await h.ok('/chart-accounts/sync-template', { method: 'POST', body: '{}' });
  const fixtureAccounts = {
    ar: '1.1.03.001', revenue: '4.1.01', vat_output: '2.1.02.001',
    tax_payable: '2.1.02.005', ap: '2.1.01.001',
    cost_of_sales: '5.1.01', vat_input: '1.1.05.001',
  } as const;
  const current = await h.ok('/chart-accounts/role-mappings') as Array<{ role: string; accountCode: string }>;
  for (const [role, accountCode] of Object.entries(fixtureAccounts)) {
    // Preserve existing operator-selected mappings even in a QA database.
    if (!current.some(binding => binding.role === role)) {
      await h.ok('/chart-accounts/role-mappings', {
        method: 'POST', body: JSON.stringify({ role, accountCode }),
      });
    }
  }

  for (const flow of ['sales', 'sales_with_tax_payable', 'purchases']) {
    const readiness = await h.ok(`/chart-accounts/role-mappings/readiness?flow=${flow}`);
    assert.equal(readiness.ready, true, `#785 QA fixture not ready for ${flow}: ${JSON.stringify(readiness)}`);
  }
}

/** Provision synthetic manual ledger codes via the authenticated API only.
 * No test may bypass the chart-of-accounts authorization or target shared DBs.
 */
export async function prepareQaManualPostingAccounts(
  h: Pick<Awaited<ReturnType<typeof createRealBackendHarness>>, 'ok' | 'prisma' | 'tenant'>,
  accounts: readonly Readonly<{ code: string; nature: 'debit' | 'credit' }>[],
) {
  const db = await h.prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  assert.match(db[0]?.name || '', /^contagest_[a-z0-9_]+(?:_v\\d+|_e2e)$/i,
    'Manual chart fixture requires an isolated disposable QA database');
  assert.equal(new Set(accounts.map(account => account.code)).size, accounts.length,
    'Fixture must not contain duplicate account codes');
  for (const account of accounts) {
    assert.match(account.code, /^[A-Za-z0-9._-]{1,40}$/, 'Invalid QA account code');
    await h.ok('/chart-accounts', {
      method: 'POST',
      body: JSON.stringify({
        code: account.code,
        name: `Synthetic QA ${account.code}`,
        type: account.nature === 'debit' ? 'asset' : 'liability',
        nature: account.nature, level: 1, allowPosting: true, active: true,
      }),
    });
  }
  const stored = await h.prisma.chartAccount.findMany({
    where: { tenantId: h.tenant.id, code: { in: accounts.map(account => account.code) } },
  });
  assert.equal(stored.length, accounts.length, 'Fixture accounts must persist under this tenant');
  for (const account of stored) {
    assert.equal(account.active && account.allowPosting, true, 'QA account cannot be non-postable');
  }
}
