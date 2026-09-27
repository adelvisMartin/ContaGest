import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signAccessToken } from '../backend/src/shared/auth/jwt.ts';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = `QA559-${Date.now().toString(36).toUpperCase()}`;

type Check = {
  id: string;
  status: 'PASS' | 'FAIL';
  expected?: unknown;
  actual?: unknown;
  difference?: { expected: unknown; actual: unknown };
  evidence?: Record<string, unknown>;
};

type Golden = {
  schemaVersion: number;
  issue: number;
  currency: string;
  periods: { operating: string; reversal: string; closed: string };
  sale: Record<string, string>;
  saleReturn: Record<string, string>;
  purchase: Record<string, string>;
  bank: Record<string, string>;
  inventory: Record<string, string>;
};

function exact(value: unknown, scale = 2) {
  if (value && typeof value === 'object' && 'toFixed' in value && typeof (value as any).toFixed === 'function') {
    return (value as any).toFixed(scale);
  }
  const source = String(value ?? '0').trim();
  const negative = source.startsWith('-');
  const unsigned = negative ? source.slice(1) : source;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  return `${negative ? '-' : ''}${whole || '0'}.${fraction.padEnd(scale, '0').slice(0, scale)}`;
}

function scaled(value: unknown, scale = 2) {
  const normalized = exact(value, scale);
  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction] = unsigned.split('.');
  const result = BigInt(`${whole}${fraction}`);
  return negative ? -result : result;
}

function outcome(id: string, expected: unknown, actual: unknown, evidence?: Record<string, unknown>): Check {
  return String(expected) === String(actual)
    ? { id, status: 'PASS', expected, actual, evidence }
    : { id, status: 'FAIL', expected, actual, difference: { expected, actual }, evidence };
}

function ledgerBalance(entry: any) {
  const debit = (entry?.lines || []).reduce((sum: bigint, line: any) => sum + scaled(line.debit), 0n);
  const credit = (entry?.lines || []).reduce((sum: bigint, line: any) => sum + scaled(line.credit), 0n);
  return { debitExact: `${debit}`, creditExact: `${credit}` };
}

function lineAmount(entry: any, accountCode: string, side: 'debit' | 'credit') {
  const line = entry?.lines?.find((candidate: any) => candidate.accountCode === accountCode);
  return line ? exact(line[side]) : null;
}

function candidateSha() {
  const sha = String(process.env.GITHUB_SHA || '').trim() || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.match(sha, /^[a-f0-9]{40}$/i, 'candidate SHA must be exact');
  return sha;
}

function movementId(result: any) {
  const id = result?.movement?.id;
  assert.ok(id, 'inventory API response must expose movement.id');
  return String(id);
}

test('issue #559 reconciles the golden financial dataset end-to-end on isolated PostgreSQL', async (t) => {
  const fixture = JSON.parse(await readFile(path.join(HERE, 'fixtures/financial-reconciliation-v559.json'), 'utf8')) as Golden;
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.issue, 559);

  const h = await createRealBackendHarness();
  t.after(async () => h.close());

  const sha = candidateSha();
  const databaseRows = await h.prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  const database = databaseRows[0]?.name || '';
  assert.match(database, /finance_v559$/, 'issue #559 must run only on the disposable *_finance_v559 database');

  const migrations = await h.prisma.$queryRaw<Array<{ migration_name: string; checksum: string; finished_at: Date | null }>>`
    SELECT migration_name, checksum, finished_at
    FROM "_prisma_migrations"
    WHERE rolled_back_at IS NULL
    ORDER BY finished_at, migration_name
  `;
  assert.ok(migrations.length > 0, 'real migration history is required');

  const checks: Check[] = [];
  const add = (id: string, expected: unknown, actual: unknown, evidence?: Record<string, unknown>) => {
    const check = outcome(id, expected, actual, evidence);
    checks.push(check);
    return check;
  };

  const syntheticDifference = outcome('difference-proof', '10.00', '10.01', { sourceId: 'synthetic-only' });
  assert.equal(syntheticDifference.status, 'FAIL');
  assert.deepEqual(syntheticDifference.difference, { expected: '10.00', actual: '10.01' });

  let fatal: unknown = null;
  try {
    const product = await h.prisma.product.create({
      data: {
        tenantId: h.tenant.id,
        sku: `${RUN}-SKU`,
        name: `${RUN} Golden product`,
        cost: fixture.inventory.unitCost,
        price: fixture.sale.unitPrice,
        stock: 0,
        reserved: 0,
        active: true
      }
    });

    const openingKey = `${RUN}-inventory-opening`;
    const openingBody = {
      productId: product.id,
      type: 'in',
      quantity: fixture.inventory.openingQuantity,
      unitCost: fixture.inventory.unitCost,
      source: 'opening',
      sourceId: `${RUN}-opening`
    };
    const opening = await h.ok('/inventory/movements', { method: 'POST', headers: { 'Idempotency-Key': openingKey }, body: JSON.stringify(openingBody) });
    const openingReplay = await h.ok('/inventory/movements', { method: 'POST', headers: { 'Idempotency-Key': openingKey }, body: JSON.stringify(openingBody) });
    add('inventory-opening-retry-resource', movementId(opening), movementId(openingReplay), { sourceId: openingBody.sourceId });

    const purchaseBody = {
      number: `${RUN}-PURCHASE`,
      fiscalPeriod: fixture.periods.operating,
      status: 'issued',
      currency: fixture.currency,
      exchangeRate: '1.0000',
      lines: [{ productId: product.id, description: `${RUN} purchase line`, quantity: fixture.purchase.quantity, unitCost: fixture.purchase.unitCost, taxRate: fixture.purchase.taxRate }]
    };
    const purchaseKey = `${RUN}-purchase-create`;
    const purchase = await h.ok('/purchases', { method: 'POST', headers: { 'Idempotency-Key': purchaseKey }, body: JSON.stringify(purchaseBody) });
    const purchaseReplay = await h.ok('/purchases', { method: 'POST', headers: { 'Idempotency-Key': purchaseKey }, body: JSON.stringify(purchaseBody) });
    add('purchase-retry-document', purchase.id, purchaseReplay.id, { sourceId: purchase.id });
    add('purchase-retry-ledger', purchase.ledgerEntryId, purchaseReplay.ledgerEntryId, { sourceId: purchase.id });

    const purchaseStockBody = { productId: product.id, type: 'in', quantity: fixture.inventory.purchaseInQuantity, unitCost: fixture.purchase.unitCost, source: 'purchase', sourceId: purchase.id };
    const purchaseStockKey = `${RUN}-purchase-stock`;
    const purchaseStock = await h.ok('/inventory/movements', { method: 'POST', headers: { 'Idempotency-Key': purchaseStockKey }, body: JSON.stringify(purchaseStockBody) });
    const purchaseStockReplay = await h.ok('/inventory/movements', { method: 'POST', headers: { 'Idempotency-Key': purchaseStockKey }, body: JSON.stringify(purchaseStockBody) });
    add('purchase-stock-retry', movementId(purchaseStock), movementId(purchaseStockReplay), { sourceId: purchase.id });

    const saleBody = {
      number: `${RUN}-SALE`,
      fiscalPeriod: fixture.periods.operating,
      status: 'issued',
      currency: fixture.currency,
      exchangeRate: '1.0000',
      lines: [{ productId: product.id, description: `${RUN} sale line`, quantity: fixture.sale.quantity, unitPrice: fixture.sale.unitPrice, taxRate: fixture.sale.taxRate }]
    };
    const saleKey = `${RUN}-sale-create`;
    const concurrentSales = await Promise.all([
      h.ok('/sales', { method: 'POST', headers: { 'Idempotency-Key': saleKey }, body: JSON.stringify(saleBody) }),
      h.ok('/sales', { method: 'POST', headers: { 'Idempotency-Key': saleKey }, body: JSON.stringify(saleBody) })
    ]);
    const sale = concurrentSales[0];
    add('sale-concurrent-retry-document', sale.id, concurrentSales[1].id, { sourceId: sale.id });
    add('sale-concurrent-retry-ledger', sale.ledgerEntryId, concurrentSales[1].ledgerEntryId, { sourceId: sale.id });

    const saleStockBody = { productId: product.id, type: 'out', quantity: fixture.inventory.saleOutQuantity, unitCost: fixture.inventory.unitCost, source: 'sales', sourceId: sale.id };
    const saleStockKey = `${RUN}-sale-stock`;
    const saleStock = await h.ok('/inventory/movements', { method: 'POST', headers: { 'Idempotency-Key': saleStockKey }, body: JSON.stringify(saleStockBody) });
    const saleStockReplay = await h.ok('/inventory/movements', { method: 'POST', headers: { 'Idempotency-Key': saleStockKey }, body: JSON.stringify(saleStockBody) });
    const saleStockId = movementId(saleStock);
    add('sale-stock-retry', saleStockId, movementId(saleStockReplay), { sourceId: sale.id });

    const storedSale = await h.prisma.salesInvoice.findUniqueOrThrow({ where: { id: sale.id } });
    const storedPurchase = await h.prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: purchase.id } });
    add('sale-subtotal', fixture.sale.subtotal, exact(storedSale.subtotal), { sourceId: sale.id });
    add('sale-tax', fixture.sale.tax, exact(storedSale.iva), { sourceId: sale.id });
    add('sale-total', fixture.sale.total, exact(storedSale.total), { sourceId: sale.id });
    add('purchase-subtotal', fixture.purchase.subtotal, exact(storedPurchase.subtotal), { sourceId: purchase.id });
    add('purchase-tax', fixture.purchase.tax, exact(storedPurchase.iva), { sourceId: purchase.id });
    add('purchase-total', fixture.purchase.total, exact(storedPurchase.total), { sourceId: purchase.id });

    const saleLedger = await h.prisma.ledgerEntry.findUniqueOrThrow({ where: { id: sale.ledgerEntryId }, include: { lines: true } });
    const purchaseLedger = await h.prisma.ledgerEntry.findUniqueOrThrow({ where: { id: purchase.ledgerEntryId }, include: { lines: true } });
    const saleBalance = ledgerBalance(saleLedger);
    const purchaseBalance = ledgerBalance(purchaseLedger);
    add('sale-ledger-balanced', saleBalance.debitExact, saleBalance.creditExact, { sourceId: sale.id, ledgerEntryId: saleLedger.id });
    add('purchase-ledger-balanced', purchaseBalance.debitExact, purchaseBalance.creditExact, { sourceId: purchase.id, ledgerEntryId: purchaseLedger.id });
    add('sale-ledger-source', sale.id, saleLedger.sourceId, { ledgerEntryId: saleLedger.id });
    add('purchase-ledger-source', purchase.id, purchaseLedger.sourceId, { ledgerEntryId: purchaseLedger.id });
    add('accounts-receivable', fixture.sale.total, lineAmount(saleLedger, '1.1.03.001', 'debit'), { sourceId: sale.id, ledgerEntryId: saleLedger.id });
    add('sales-tax-payable', fixture.sale.tax, lineAmount(saleLedger, '2.1.02.001', 'credit'), { sourceId: sale.id, ledgerEntryId: saleLedger.id });
    add('accounts-payable', fixture.purchase.total, lineAmount(purchaseLedger, '2.1.01.001', 'credit'), { sourceId: purchase.id, ledgerEntryId: purchaseLedger.id });
    add('purchase-cogs-contract', fixture.purchase.subtotal, lineAmount(purchaseLedger, '5.1.01', 'debit'), { sourceId: purchase.id, ledgerEntryId: purchaseLedger.id });
    add('purchase-vat-credit', fixture.purchase.tax, lineAmount(purchaseLedger, '1.1.05.001', 'debit'), { sourceId: purchase.id, ledgerEntryId: purchaseLedger.id });

    const accountKey = `${RUN}-bank-account`;
    const accountBody = { bankName: fixture.bank.bankName, accountNo: `${fixture.bank.accountNo}-${RUN}`, currency: fixture.currency, openingBalance: fixture.bank.openingBalance };
    const bankAccount = await h.ok('/banking/accounts', { method: 'POST', headers: { 'Idempotency-Key': accountKey }, body: JSON.stringify(accountBody) });
    const bankAccountReplay = await h.ok('/banking/accounts', { method: 'POST', headers: { 'Idempotency-Key': accountKey }, body: JSON.stringify(accountBody) });
    add('bank-account-retry', bankAccount.id, bankAccountReplay.id, { sourceId: bankAccount.id });

    const collectionKey = `${RUN}-collection`;
    const collectionBody = { accountId: bankAccount.id, description: `${RUN} customer collection`, reference: sale.id, type: 'income', currency: fixture.currency, amount: fixture.sale.total };
    const collection = await h.ok('/banking/movements', { method: 'POST', headers: { 'Idempotency-Key': collectionKey }, body: JSON.stringify(collectionBody) });
    const collectionReplay = await h.ok('/banking/movements', { method: 'POST', headers: { 'Idempotency-Key': collectionKey }, body: JSON.stringify(collectionBody) });
    add('collection-retry', collection.id, collectionReplay.id, { sourceId: sale.id });
    await h.ok(`/banking/movements/${collection.id}/reconcile`, { method: 'PATCH', body: JSON.stringify({ matched: true, ledgerEntryId: saleLedger.id }) });

    const paymentKey = `${RUN}-payment`;
    const paymentBody = { accountId: bankAccount.id, description: `${RUN} supplier payment`, reference: purchase.id, type: 'expense', currency: fixture.currency, amount: fixture.purchase.total };
    const payment = await h.ok('/banking/movements', { method: 'POST', headers: { 'Idempotency-Key': paymentKey }, body: JSON.stringify(paymentBody) });
    const paymentReplay = await h.ok('/banking/movements', { method: 'POST', headers: { 'Idempotency-Key': paymentKey }, body: JSON.stringify(paymentBody) });
    add('payment-retry', payment.id, paymentReplay.id, { sourceId: purchase.id });
    await h.ok(`/banking/movements/${payment.id}/reconcile`, { method: 'PATCH', body: JSON.stringify({ matched: true, ledgerEntryId: purchaseLedger.id }) });

    const storedCollection = await h.prisma.bankMovement.findUniqueOrThrow({ where: { id: collection.id } });
    const storedPayment = await h.prisma.bankMovement.findUniqueOrThrow({ where: { id: payment.id } });
    add('collection-ledger-link', saleLedger.id, storedCollection.ledgerEntryId, { sourceId: sale.id, ledgerEntryId: saleLedger.id });
    add('payment-ledger-link', purchaseLedger.id, storedPayment.ledgerEntryId, { sourceId: purchase.id, ledgerEntryId: purchaseLedger.id });
    const bankAfter = await h.prisma.bankAccount.findUniqueOrThrow({ where: { id: bankAccount.id } });
    add('bank-ending-balance', fixture.bank.expectedEndingBalance, exact(bankAfter.balance), { sourceId: bankAccount.id });

    const returnSaleBody = {
      number: `${RUN}-RETURN-SOURCE`,
      fiscalPeriod: fixture.periods.operating,
      status: 'issued',
      currency: fixture.currency,
      exchangeRate: '1.0000',
      lines: [{ productId: product.id, description: `${RUN} return source line`, quantity: fixture.saleReturn.quantity, unitPrice: fixture.saleReturn.unitPrice, taxRate: fixture.saleReturn.taxRate }]
    };
    const returnSale = await h.ok('/sales', { method: 'POST', headers: { 'Idempotency-Key': `${RUN}-return-sale` }, body: JSON.stringify(returnSaleBody) });
    const returnStock = await h.ok('/inventory/movements', {
      method: 'POST',
      headers: { 'Idempotency-Key': `${RUN}-return-stock-out` },
      body: JSON.stringify({ productId: product.id, type: 'out', quantity: fixture.inventory.returnOutQuantity, unitCost: fixture.inventory.unitCost, source: 'sales', sourceId: returnSale.id })
    });
    const returnStockId = movementId(returnStock);
    const cancelBody = { reason: `${RUN} customer return`, reversalFiscalPeriod: fixture.periods.reversal, reversalDate: '2098-02-15T12:00:00.000Z' };
    const cancelled = await h.ok(`/sales/${returnSale.id}/cancel`, { method: 'PATCH', headers: { 'Idempotency-Key': `${RUN}-return-cancel` }, body: JSON.stringify(cancelBody) });
    const cancelledReplay = await h.ok(`/sales/${returnSale.id}/cancel`, { method: 'PATCH', headers: { 'Idempotency-Key': `${RUN}-return-cancel` }, body: JSON.stringify(cancelBody) });
    add('sale-return-retry', cancelled.reversalId, cancelledReplay.reversalId, { sourceId: returnSale.id });

    await h.ok(`/inventory/movements/${returnStockId}/reverse`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `${RUN}-return-stock-reverse` },
      body: JSON.stringify({ reasonCode: 'customer-return', reason: `${RUN} reverse stock for customer return` })
    });
    const originalReturnLedger = await h.prisma.ledgerEntry.findUniqueOrThrow({ where: { id: returnSale.ledgerEntryId }, include: { lines: true } });
    const reversal = await h.prisma.ledgerEntry.findUniqueOrThrow({ where: { id: cancelled.reversalId }, include: { lines: true } });
    add('sale-return-reversal-link', originalReturnLedger.id, reversal.reversalOfId, { sourceId: returnSale.id, ledgerEntryId: reversal.id });
    const originalSnapshot = ledgerBalance(originalReturnLedger);
    const reversalSnapshot = ledgerBalance(reversal);
    add('sale-return-original-still-balanced', originalSnapshot.debitExact, originalSnapshot.creditExact, { sourceId: returnSale.id, ledgerEntryId: originalReturnLedger.id });
    add('sale-return-reversal-balanced', reversalSnapshot.debitExact, reversalSnapshot.creditExact, { sourceId: returnSale.id, ledgerEntryId: reversal.id });
    const reversalAudit = await h.prisma.auditLog.findFirst({ where: { tenantId: h.tenant.id, action: 'ledger.entry.reversed', entityId: reversal.id } });
    add('sale-return-audit-trail', true, Boolean(reversalAudit), { sourceId: returnSale.id, ledgerEntryId: reversal.id });

    const returnLink = await h.prisma.$queryRaw<Array<{ originalMovementId: string | null; relatedMovementId: string }>>`
      SELECT "originalMovementId", "relatedMovementId"
      FROM "InventoryMovementAuditLink"
      WHERE "tenantId" = ${h.tenant.id} AND "originalMovementId" = ${returnStockId} AND "kind" = 'reversal'
      LIMIT 1
    `;
    add('inventory-return-audit-link', returnStockId, returnLink[0]?.originalMovementId || null, { sourceId: returnSale.id });

    const finalProduct = await h.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    add('inventory-ending-stock', fixture.inventory.expectedEndingStock, exact(finalProduct.stock, 3), { sourceId: product.id });
    const derivedCogs = (scaled(fixture.inventory.saleOutQuantity, 3) * scaled(fixture.inventory.unitCost, 2)) / 1000n;
    add('inventory-derived-cogs', scaled(fixture.inventory.derivedSaleCogs, 2).toString(), derivedCogs.toString(), { sourceId: sale.id });

    const periodEntries = await h.prisma.ledgerEntry.findMany({
      where: { tenantId: h.tenant.id, fiscalPeriod: { in: [fixture.periods.operating, fixture.periods.reversal] }, posted: true },
      include: { lines: true },
      orderBy: { createdAt: 'asc' }
    });
    for (const entry of periodEntries) {
      const balance = ledgerBalance(entry);
      add(`ledger-entry-balanced:${entry.id}`, balance.debitExact, balance.creditExact, { sourceId: entry.sourceId || undefined, ledgerEntryId: entry.id });
    }
    for (const periodName of [fixture.periods.operating, fixture.periods.reversal]) {
      const entries = periodEntries.filter((entry) => entry.fiscalPeriod === periodName);
      const debit = entries.flatMap((entry) => entry.lines).reduce((sum, line) => sum + scaled(line.debit), 0n);
      const credit = entries.flatMap((entry) => entry.lines).reduce((sum, line) => sum + scaled(line.credit), 0n);
      add(`ledger-period-balanced:${periodName}`, debit.toString(), credit.toString(), { sourceId: periodName });
    }

    const period = await h.ok('/accounting/closing-periods', { method: 'POST', body: JSON.stringify({ period: fixture.periods.closed, note: `${RUN} closed-period gate` }) });
    await h.ok(`/accounting/closing-periods/${period.id}/close`, { method: 'POST', body: JSON.stringify({ note: `${RUN} closed` }) });
    await h.status('/sales', 409, {
      method: 'POST',
      headers: { 'Idempotency-Key': `${RUN}-closed-sale` },
      body: JSON.stringify({ ...saleBody, number: `${RUN}-CLOSED-SALE`, fiscalPeriod: fixture.periods.closed })
    });
    await h.status('/purchases', 409, {
      method: 'POST',
      headers: { 'Idempotency-Key': `${RUN}-closed-purchase` },
      body: JSON.stringify({ ...purchaseBody, number: `${RUN}-CLOSED-PURCHASE`, fiscalPeriod: fixture.periods.closed })
    });
    add('closed-period-no-sale-ledger', 0, await h.prisma.ledgerEntry.count({ where: { tenantId: h.tenant.id, fiscalPeriod: fixture.periods.closed, source: 'sales' } }), { sourceId: fixture.periods.closed });
    add('closed-period-no-purchase-ledger', 0, await h.prisma.ledgerEntry.count({ where: { tenantId: h.tenant.id, fiscalPeriod: fixture.periods.closed, source: 'purchase' } }), { sourceId: fixture.periods.closed });

    const tenantB = await h.prisma.tenant.create({ data: { rif: `${RUN}-B`, name: `${RUN} tenant B`, legalName: `${RUN} tenant B` } });
    const permissions = await h.prisma.permission.findMany({ where: { key: { in: ['banking.manage', 'inventory.adjust'] } } });
    assert.equal(permissions.length, 2, 'tenant B negative actor permissions missing');
    const roleB = await h.prisma.role.create({
      data: { tenantId: tenantB.id, name: `${RUN}-role-b`, description: 'QA559 tenant B', permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) } }
    });
    const userB = await h.prisma.userProfile.create({ data: { tenantId: tenantB.id, email: `${RUN.toLowerCase()}-b@example.invalid`, fullName: `${RUN} Tenant B`, status: 'active' } });
    await h.prisma.userRole.create({ data: { userId: userB.id, roleId: roleB.id } });
    const tokenB = signAccessToken({ id: userB.id, email: userB.email }, tenantB.id);
    const productB = await h.prisma.product.create({ data: { tenantId: tenantB.id, sku: `${RUN}-B-SKU`, name: `${RUN} B product`, cost: '1.00', price: '2.00', stock: '1.000' } });
    const movementB = await h.prisma.inventoryMovement.create({ data: { tenantId: tenantB.id, productId: productB.id, type: 'in', quantity: '1.000', unitCost: '1.00', source: 'qa559', sourceId: `${RUN}-B` } });
    const bankB = await h.prisma.bankAccount.create({ data: { tenantId: tenantB.id, bankName: 'B Bank', accountNo: `${RUN}-B-ACCOUNT`, currency: fixture.currency, balance: '1.00', active: true } });
    const bankMovementB = await h.prisma.bankMovement.create({ data: { tenantId: tenantB.id, accountId: bankB.id, description: `${RUN} B movement`, reference: `${RUN}-B`, credit: '1.00', debit: '0.00', matched: false } });

    // tenant A -> tenant B must fail closed.
    await h.status(`/inventory/movements/${movementB.id}/reverse`, 404, { method: 'POST', headers: { 'Idempotency-Key': `${RUN}-A-TO-B-INVENTORY` }, body: JSON.stringify({ reasonCode: 'tenant-isolation', reason: `${RUN} tenant A cannot reverse tenant B` }) });
    await h.status(`/banking/movements/${bankMovementB.id}/reconcile`, 404, { method: 'PATCH', body: JSON.stringify({ matched: true, ledgerEntryId: saleLedger.id }) });
    // tenant B -> tenant A must fail closed.
    await h.status(`/inventory/movements/${saleStockId}/reverse`, 404, { method: 'POST', headers: { 'Idempotency-Key': `${RUN}-B-TO-A-INVENTORY` }, body: JSON.stringify({ reasonCode: 'tenant-isolation', reason: `${RUN} tenant B cannot reverse tenant A` }) }, tokenB);
    await h.status(`/banking/movements/${collection.id}/reconcile`, 404, { method: 'PATCH', body: JSON.stringify({ matched: true }) }, tokenB);
    add('tenant A->tenant B isolation', true, true, { sourceId: tenantB.id });
    add('tenant B->tenant A isolation', true, true, { sourceId: h.tenant.id });

    const saleLedgerCount = await h.prisma.ledgerEntry.count({ where: { tenantId: h.tenant.id, source: 'sales', sourceId: sale.id } });
    const purchaseLedgerCount = await h.prisma.ledgerEntry.count({ where: { tenantId: h.tenant.id, source: 'purchase', sourceId: purchase.id } });
    const openingMovementCount = await h.prisma.inventoryMovement.count({ where: { tenantId: h.tenant.id, source: 'opening', sourceId: openingBody.sourceId } });
    const saleStockCount = await h.prisma.inventoryMovement.count({ where: { tenantId: h.tenant.id, source: 'sales', sourceId: sale.id } });
    const bankMovementCount = await h.prisma.bankMovement.count({ where: { tenantId: h.tenant.id, id: { in: [collection.id, payment.id] } } });
    add('retry-no-duplicate-sale-ledger', 1, saleLedgerCount, { sourceId: sale.id });
    add('retry-no-duplicate-purchase-ledger', 1, purchaseLedgerCount, { sourceId: purchase.id });
    add('retry-no-duplicate-opening-stock', 1, openingMovementCount, { sourceId: openingBody.sourceId });
    add('retry-no-duplicate-sale-stock', 1, saleStockCount, { sourceId: sale.id });
    add('retry-no-duplicate-bank-effects', 2, bankMovementCount, { sourceId: bankAccount.id });
    const idempotencyRecords = await h.prisma.idempotencyRecord.count({ where: { tenantId: h.tenant.id } });
    add('idempotency-records-observable', true, idempotencyRecords > 0, { sourceId: h.tenant.id });
  } catch (error) {
    fatal = error;
    const actual = error instanceof Error ? error.message : String(error);
    checks.push({ id: 'fatal-execution', status: 'FAIL', actual, difference: { expected: 'completed golden flow', actual } });
  } finally {
    const reportDir = path.resolve(process.env.FINANCIAL_RECONCILIATION_REPORT_DIR || path.join(HERE, '..', 'artifacts', 'financial-reconciliation-v559'));
    await mkdir(reportDir, { recursive: true });
    const failures = checks.filter((check) => check.status === 'FAIL');
    const report = {
      schemaVersion: 1,
      issue: 559,
      candidateSha: sha,
      datasetVersion: fixture.schemaVersion,
      run: RUN,
      database,
      migrations: migrations.map((migration) => ({ name: migration.migration_name, checksum: migration.checksum, finishedAt: migration.finished_at?.toISOString() || null })),
      checks,
      summary: { status: failures.length ? 'FAIL' : 'PASS', total: checks.length, passed: checks.length - failures.length, failed: failures.length },
      generatedAt: new Date().toISOString()
    };
    await writeFile(path.join(reportDir, `financial-reconciliation-${sha}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  if (fatal) throw fatal;
  const failures = checks.filter((check) => check.status === 'FAIL');
  assert.equal(failures.length, 0, `financial reconciliation differences:\n${JSON.stringify(failures, null, 2)}`);
});
