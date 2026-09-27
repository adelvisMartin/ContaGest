import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('issue #559 installs one SHA-bound transversal financial reconciliation gate', async () => {
  const [pkgText, fixtureText, integrationText, workflowText, adrText] = await Promise.all([
    read('package.json'),
    read('qa/fixtures/financial-reconciliation-v559.json'),
    read('qa/financial-reconciliation-v559.test.ts'),
    read('.github/workflows/financial-reconciliation-v559.yml'),
    read('docs/ADR_FINANCIAL_RECONCILIATION_V559.md')
  ]);

  const pkg = JSON.parse(pkgText);
  const fixture = JSON.parse(fixtureText);

  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.issue, 559);
  assert.ok(fixture.sale);
  assert.ok(fixture.saleReturn);
  assert.ok(fixture.purchase);
  assert.ok(fixture.bank);
  assert.ok(fixture.inventory);

  assert.equal(
    pkg.scripts['test:backend:financial:reconciliation:real'],
    'npm --workspace backend exec -- tsx --test ../qa/financial-reconciliation-v559.test.ts'
  );

  for (const token of [
    'GITHUB_SHA',
    '_prisma_migrations',
    'current_database()',
    'Idempotency-Key',
    'tenant A',
    'tenant B',
    'reversalOfId',
    'ledgerEntryId',
    'sourceId',
    'difference',
    'report'
  ]) {
    assert.match(integrationText, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `integration gate missing ${token}`);
  }

  assert.match(workflowText, /postgres:17-alpine/);
  assert.match(workflowText, /prisma:deploy/);
  assert.match(workflowText, /test:backend:financial:reconciliation:real/);
  assert.match(workflowText, /upload-artifact@v7/);
  assert.match(workflowText, /financial-reconciliation-v559/);

  assert.match(adrText, /ventas/i);
  assert.match(adrText, /cuentas por cobrar/i);
  assert.match(adrText, /ledger/i);
  assert.match(adrText, /bancos/i);
  assert.match(adrText, /inventario/i);
  assert.match(adrText, /cuentas por pagar/i);
});
