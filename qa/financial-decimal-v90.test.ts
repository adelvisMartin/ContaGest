import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DecimalDomainError,
  add,
  compare,
  divide,
  exchangeRate,
  money,
  multiply,
  parseDecimal,
  percentOf,
  percentage,
  quantity,
  quantizeMoney,
  rate,
  serializeDecimal,
  subtract
} from '../backend/src/shared/financial/decimal.ts';
import { calculateInvoiceTotals } from '../backend/src/shared/financial/invoice.ts';
import { assertBalanced } from '../backend/src/modules/accounting/accounting.service.ts';

test('issue #90 canonical decimal primitive is exact and rejects unsafe transport values', () => {
  assert.equal(serializeDecimal(add('0.1', '0.2')), '0.3');
  assert.equal(serializeDecimal(subtract('1.00', '0.10'), 2), '0.90');
  assert.equal(serializeDecimal(multiply('1.25', '4'), 2), '5.00');
  assert.equal(serializeDecimal(divide('1', '4'), 2), '0.25');
  assert.equal(compare('0.30', add('0.10', '0.20')), 0);
  assert.equal(compare('0.29', '0.30'), -1);
  assert.equal(compare('0.31', '0.30'), 1);
  assert.equal(serializeDecimal(quantizeMoney('1.005'), 2), '1.01');
  assert.equal(serializeDecimal(quantizeMoney('-1.005'), 2), '-1.01');
  assert.equal(serializeDecimal(exchangeRate('36.1234'), 4), '36.1234');
  assert.equal(serializeDecimal(rate('4.1250'), 4), '4.1250');
  assert.equal(serializeDecimal(quantity('1.234'), 3), '1.234');
  assert.equal(serializeDecimal(percentage('16.25'), 2), '16.25');
  assert.equal(serializeDecimal(money('9999999999999999.99'), 2), '9999999999999999.99');

  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.throws(() => money(invalid), DecimalDomainError);
  }
  assert.throws(() => money('1e2'), DecimalDomainError);
  assert.throws(() => money('1.001'), DecimalDomainError);
  assert.throws(() => quantity('1.0001'), DecimalDomainError);
  assert.throws(() => exchangeRate('1.00001'), DecimalDomainError);
  assert.throws(() => parseDecimal('10000000000000000.00', 'money'), DecimalDomainError);
  assert.throws(() => money('9'.repeat(65)), DecimalDomainError);
});

test('issue #90 percentage helper keeps IVA and retention-style calculations decimal', () => {
  const taxableBase = money('1234.56');
  const iva = quantizeMoney(percentOf(taxableBase, percentage('16.00')));
  const retention = quantizeMoney(percentOf(taxableBase, percentage('2.75')));
  assert.equal(serializeDecimal(iva, 2), '197.53');
  assert.equal(serializeDecimal(retention, 2), '33.95');
  assert.equal(serializeDecimal(subtract(taxableBase, retention), 2), '1200.61');
});

test('issue #90 golden invoice dataset rounds only at documented persistence boundaries', () => {
  const result = calculateInvoiceTotals([
    { quantity: '0.333', unitAmount: '10.01', taxRate: '16.25' },
    { quantity: '2.005', unitAmount: '0.10', taxRate: '8.50' }
  ]);

  assert.equal(serializeDecimal(result.lines[0].total, 2), '3.33');
  assert.equal(serializeDecimal(result.lines[1].total, 2), '0.20');
  assert.equal(serializeDecimal(result.subtotal, 2), '3.53');
  assert.equal(serializeDecimal(result.tax, 2), '0.56');
  assert.equal(serializeDecimal(result.total, 2), '4.09');
});

test('issue #90 ledger balancing uses decimal equality rather than floating tolerance', () => {
  const balanced = assertBalanced([
    { accountCode: 'D.1', accountName: 'Débito 1', debit: '0.10' },
    { accountCode: 'D.2', accountName: 'Débito 2', debit: '0.20' },
    { accountCode: 'C.1', accountName: 'Crédito', credit: '0.30' }
  ]);
  assert.equal(serializeDecimal(balanced.debit, 2), '0.30');
  assert.equal(serializeDecimal(balanced.credit, 2), '0.30');

  assert.throws(() => assertBalanced([
    { accountCode: 'D.1', accountName: 'Débito', debit: '0.30' },
    { accountCode: 'C.1', accountName: 'Crédito', credit: '0.31' }
  ]));
});
