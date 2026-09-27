import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('issue #560 installs one authoritative multi-currency policy and audited FX lifecycle', async () => {
  const [pkgText, migration, fxService, fxRepository, currencyRoutes, salesRoutes, purchaseRoutes, qa, workflow, adr] = await Promise.all([
    read('package.json'),
    read('backend/prisma/migrations/20260927130000_financial_fx_v560/migration.sql'),
    read('backend/src/shared/financial/fx.ts'),
    read('backend/src/modules/currency/fx.repository.ts'),
    read('backend/src/modules/currency/currency.routes.ts'),
    read('backend/src/modules/sales/sales.routes.ts'),
    read('backend/src/modules/purchases/purchases.routes.ts'),
    read('qa/financial-fx-v560.test.ts'),
    read('.github/workflows/financial-fx-v560.yml'),
    read('docs/ADR_FINANCIAL_FX_V560.md')
  ]);

  const pkg = JSON.parse(pkgText);
  assert.equal(pkg.scripts['test:backend:financial:fx:real'], 'npm --workspace backend exec -- tsx --test ../qa/financial-fx-v560.test.ts');

  for (const token of ['FinancialFxPolicy', 'FinancialFxDocumentSnapshot', 'FinancialFxLedgerLineSnapshot', 'FinancialFxBankAccountMap', 'FinancialFxEvent', 'tenantId', 'exchangeRate', 'rateDate', 'rateSource']) {
    assert.match(migration, new RegExp(token, 'i'), `migration missing ${token}`);
  }
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)/i);

  for (const token of ['FX_POLICY_VERSION', 'ROUND_HALF_UP', 'functionalCurrency', 'convertToFunctional', 'functionalizeBalancedLedgerLines', 'Decimal']) {
    assert.match(fxService, new RegExp(token, 'i'), `FX policy missing ${token}`);
  }
  assert.doesNotMatch(fxService, /parseFloat|Number\s*\(/);

  for (const token of ['Prisma.sql', 'upsertFxPolicy', 'recordDocumentSnapshot', 'recordLedgerLineSnapshots', 'createFxEvent', 'tenantId']) {
    assert.match(fxRepository, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `FX repository missing ${token}`);
  }
  assert.doesNotMatch(fxRepository, /\$queryRawUnsafe|\$executeRawUnsafe/);

  for (const token of ['/fx/policy', '/fx/bank-accounts/:id/ledger-account', '/fx/settlements', '/fx/revaluations', '/fx/events/:id/reverse', '/fx/exposure']) {
    assert.ok(currencyRoutes.includes(token), `currency routes missing ${token}`);
  }
  assert.match(currencyRoutes, /assertPeriodOpen/);
  assert.match(currencyRoutes, /runFinancialIdempotentMutation/);

  for (const source of [salesRoutes, purchaseRoutes]) {
    assert.match(source, /recordDocumentSnapshot/);
    assert.match(source, /recordLedgerLineSnapshots/);
    assert.match(source, /functionalizeBalancedLedgerLines/);
    assert.match(source, /exchangeRateSource/);
    assert.match(source, /exchangeRateDate/);
  }

  for (const token of ['partial', 'Idempotency-Key', 'revaluation', 'reversalOfId', 'tenant A', 'tenant B', 'closed', 'original', 'functional', 'GITHUB_SHA']) {
    assert.match(qa, new RegExp(token, 'i'), `real PostgreSQL regression missing ${token}`);
  }

  assert.match(workflow, /postgres:17-alpine/);
  assert.match(workflow, /test:backend:financial:fx:real/);
  assert.match(workflow, /upload-artifact@v7/);
  assert.match(workflow, /CANDIDATE_SHA/);
  assert.match(adr, /moneda funcional/i);
  assert.match(adr, /realizada/i);
  assert.match(adr, /no realizada/i);
  assert.match(adr, /original/i);
  assert.match(adr, /funcional/i);
});
