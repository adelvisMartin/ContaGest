import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

const RUN = `QA90-${Date.now().toString(36).toUpperCase()}`;
const PERIOD = '2096-09';
const fixed = (value: any, scale = 2) => value?.toFixed ? value.toFixed(scale) : String(value);

test('issue #90 decimal financial core reconciles API, domain and PostgreSQL exactly', async (t) => {
  const h = await createRealBackendHarness();
  const ids = {
    sales: [] as string[],
    purchases: [] as string[],
    ledgers: [] as string[],
    bankAccounts: [] as string[],
    bankMovements: [] as string[],
    employees: [] as string[],
    payrollPeriods: [] as string[],
    payrollReceipts: [] as string[]
  };

  t.after(async () => {
    await h.prisma.payrollReceipt.deleteMany({ where: { id: { in: ids.payrollReceipts } } }).catch(() => undefined);
    await h.prisma.payrollPeriod.deleteMany({ where: { id: { in: ids.payrollPeriods } } }).catch(() => undefined);
    await h.prisma.employee.deleteMany({ where: { id: { in: ids.employees } } }).catch(() => undefined);
    await h.prisma.bankMovement.deleteMany({ where: { id: { in: ids.bankMovements } } }).catch(() => undefined);
    await h.prisma.bankAccount.deleteMany({ where: { id: { in: ids.bankAccounts } } }).catch(() => undefined);
    await h.prisma.ledgerEntry.deleteMany({ where: { OR: [{ id: { in: ids.ledgers } }, { sourceId: { startsWith: RUN } }] } }).catch(() => undefined);
    await h.prisma.salesInvoice.deleteMany({ where: { id: { in: ids.sales } } }).catch(() => undefined);
    await h.prisma.purchaseInvoice.deleteMany({ where: { id: { in: ids.purchases } } }).catch(() => undefined);
    await h.close();
  });

  await t.test('manual ledger accepts 0.10 + 0.20 == 0.30 exactly', async () => {
    const entry = await h.ok('/accounting/entries', {
      method: 'POST',
      body: JSON.stringify({
        fiscalPeriod: PERIOD,
        description: `${RUN} decimal balance`,
        source: 'manual',
        lines: [
          { accountCode: `${RUN}.D1`, accountName: 'QA debit 1', debit: '0.10' },
          { accountCode: `${RUN}.D2`, accountName: 'QA debit 2', debit: '0.20' },
          { accountCode: `${RUN}.C`, accountName: 'QA credit', credit: '0.30' }
        ]
      })
    });
    ids.ledgers.push(entry.id);
    const stored = await h.prisma.ledgerEntry.findUnique({ where: { id: entry.id }, include: { lines: true } });
    assert.ok(stored);
    const debit = stored.lines.reduce((sum, line) => sum.plus(line.debit), stored.lines[0].debit.minus(stored.lines[0].debit));
    const credit = stored.lines.reduce((sum, line) => sum.plus(line.credit), stored.lines[0].credit.minus(stored.lines[0].credit));
    assert.equal(debit.toFixed(2), '0.30');
    assert.equal(credit.toFixed(2), '0.30');

    const trial = await h.ok('/accounting/trial-balance');
    const row = trial.find((item: any) => item.accountCode === `${RUN}.D1`);
    assert.equal(row.debitExact, '0.10');
    assert.equal(row.balanceExact, '0.10');
  });

  await t.test('sales golden dataset persists line totals, IVA, total and ledger without residues', async () => {
    const sale = await h.ok('/sales', {
      method: 'POST',
      body: JSON.stringify({
        number: `${RUN}-SALE`,
        fiscalPeriod: PERIOD,
        status: 'issued',
        currency: 'VES',
        exchangeRate: '36.1234',
        lines: [
          { description: 'Golden A', quantity: '0.333', unitPrice: '10.01', taxRate: '16.25' },
          { description: 'Golden B', quantity: '2.005', unitPrice: '0.10', taxRate: '8.50' }
        ]
      })
    });
    ids.sales.push(sale.id);
    if (sale.ledgerEntryId) ids.ledgers.push(sale.ledgerEntryId);
    const stored = await h.prisma.salesInvoice.findUnique({ where: { id: sale.id }, include: { lines: true, ledgerEntries: { include: { lines: true } } } });
    assert.ok(stored);
    assert.deepEqual(stored.lines.map((line) => line.total.toFixed(2)), ['3.33', '0.20']);
    assert.equal(stored.subtotal.toFixed(2), '3.53');
    assert.equal(stored.iva.toFixed(2), '0.56');
    assert.equal(stored.total.toFixed(2), '4.09');
    assert.equal(stored.exchangeRate.toFixed(4), '36.1234');
    const ledger = stored.ledgerEntries[0];
    assert.ok(ledger);
    const debit = ledger.lines.reduce((sum, line) => sum.plus(line.debit), stored.total.minus(stored.total));
    const credit = ledger.lines.reduce((sum, line) => sum.plus(line.credit), stored.total.minus(stored.total));
    assert.equal(debit.toFixed(2), '4.09');
    assert.equal(credit.toFixed(2), '4.09');
  });

  await t.test('purchase golden dataset uses the same centralized rounding boundary', async () => {
    const purchase = await h.ok('/purchases', {
      method: 'POST',
      body: JSON.stringify({
        number: `${RUN}-PURCHASE`,
        fiscalPeriod: PERIOD,
        status: 'issued',
        lines: [{ description: 'Golden purchase', quantity: '1.005', unitCost: '19.99', taxRate: '16.00' }]
      })
    });
    ids.purchases.push(purchase.id);
    if (purchase.ledgerEntryId) ids.ledgers.push(purchase.ledgerEntryId);
    const stored = await h.prisma.purchaseInvoice.findUnique({ where: { id: purchase.id }, include: { lines: true } });
    assert.ok(stored);
    assert.equal(stored.lines[0].total.toFixed(2), '20.09');
    assert.equal(stored.subtotal.toFixed(2), '20.09');
    assert.equal(stored.iva.toFixed(2), '3.21');
    assert.equal(stored.total.toFixed(2), '23.30');
  });

  await t.test('bank balance applies and reverses 0.20 over 0.10 exactly', async () => {
    const account = await h.ok('/bank-accounts', {
      method: 'POST',
      body: JSON.stringify({ bankName: `${RUN} Bank`, accountNo: `${RUN}-ACCT`, currency: 'USD', balance: '0.10' })
    });
    ids.bankAccounts.push(account.id);
    const movement = await h.ok('/banking/movements', {
      method: 'POST',
      body: JSON.stringify({ accountId: account.id, description: `${RUN} income`, type: 'income', currency: 'USD', amount: '0.20' })
    });
    ids.bankMovements.push(movement.id);
    assert.equal(movement.amountExact, '0.20');
    let stored = await h.prisma.bankAccount.findUnique({ where: { id: account.id } });
    assert.equal(stored?.balance.toFixed(2), '0.30');
    await h.ok(`/banking/movements/${movement.id}`, { method: 'DELETE' });
    ids.bankMovements = ids.bankMovements.filter((id) => id !== movement.id);
    stored = await h.prisma.bankAccount.findUnique({ where: { id: account.id } });
    assert.equal(stored?.balance.toFixed(2), '0.10');
  });

  await t.test('payroll aggregate keeps 0.10 + 0.20 == 0.30 in PostgreSQL', async () => {
    const period = await h.ok('/payroll/periods', { method: 'POST', body: JSON.stringify({ period: `${RUN}-P1` }) });
    ids.payrollPeriods.push(period.id);
    for (const [index, gross] of ['0.10', '0.20'].entries()) {
      const employee = await h.ok('/employees', {
        method: 'POST',
        body: JSON.stringify({ idNumber: `${RUN}-E${index}`, fullName: `${RUN} Employee ${index}`, position: 'QA', salary: gross })
      });
      ids.employees.push(employee.id);
      const receipt = await h.ok('/payroll/receipts', {
        method: 'POST',
        body: JSON.stringify({ periodId: period.id, employeeId: employee.id, gross, deductions: '0.00', net: gross })
      });
      ids.payrollReceipts.push(receipt.receipt.id);
    }
    const stored = await h.prisma.payrollPeriod.findUnique({ where: { id: period.id } });
    assert.equal(stored?.totalGross.toFixed(2), '0.30');
    assert.equal(stored?.totalNet.toFixed(2), '0.30');
  });

  await t.test('API rejects out-of-policy monetary scale instead of truncating silently', async () => {
    const account = await h.prisma.bankAccount.findFirst({ where: { id: { in: ids.bankAccounts } } });
    assert.ok(account);
    await h.status('/banking/movements', 422, {
      method: 'POST',
      body: JSON.stringify({ accountId: account.id, description: 'bad scale', type: 'income', amount: '0.001' })
    });
    await h.status('/sales', 422, {
      method: 'POST',
      body: JSON.stringify({ number: `${RUN}-BAD`, fiscalPeriod: PERIOD, lines: [{ description: 'bad price', quantity: '1.000', unitPrice: '1.001', taxRate: '16.00' }] })
    });
  });
});
