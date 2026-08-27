import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertBalanced,
  assertLedgerActionAllowed,
  inverseLedgerLines
} from '../backend/src/modules/accounting/accounting.service.ts';
import { serializeDecimal } from '../backend/src/shared/financial/decimal.ts';
import { HttpError } from '../backend/src/shared/http.ts';

function expectConflict(fn: () => unknown, message: RegExp) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    assert.match(error.message, message);
    return true;
  });
}

test('issue #91 lifecycle allows draft work and a single post transition', () => {
  const draft = { posted: false, reversalOfId: null, reversedBy: null };
  assert.doesNotThrow(() => assertLedgerActionAllowed(draft, 'edit'));
  assert.doesNotThrow(() => assertLedgerActionAllowed(draft, 'delete'));
  assert.doesNotThrow(() => assertLedgerActionAllowed(draft, 'post'));
  expectConflict(() => assertLedgerActionAllowed(draft, 'reverse'), /Solo un asiento contabilizado/i);
});

test('issue #91 posted entries are immutable and cannot return through CRUD/post', () => {
  const posted = { posted: true, reversalOfId: null, reversedBy: null };
  expectConflict(() => assertLedgerActionAllowed(posted, 'edit'), /inmutable/i);
  expectConflict(() => assertLedgerActionAllowed(posted, 'delete'), /inmutable/i);
  expectConflict(() => assertLedgerActionAllowed(posted, 'post'), /ya está contabilizado/i);
  assert.doesNotThrow(() => assertLedgerActionAllowed(posted, 'reverse'));
});

test('issue #91 reversal policy rejects reversal chains and a second direct reversal', () => {
  const reversal = { posted: true, reversalOfId: 'original-id', reversedBy: null };
  expectConflict(() => assertLedgerActionAllowed(reversal, 'reverse'), /No se permite reversar un reverso/i);

  const alreadyReversed = { posted: true, reversalOfId: null, reversedBy: { id: 'reversal-id' } };
  expectConflict(() => assertLedgerActionAllowed(alreadyReversed, 'reverse'), /ya posee un reverso/i);
});

test('issue #91 inverse ledger preserves exact Decimal balance, currency and exchange rate', () => {
  const original = [
    { accountCode: '1.1', accountName: 'Caja', debit: '0.10', currency: 'USD', exchangeRate: '36.1234' },
    { accountCode: '1.2', accountName: 'Banco', debit: '0.20', currency: 'USD', exchangeRate: '36.1234' },
    { accountCode: '4.1', accountName: 'Ingreso', credit: '0.30', currency: 'USD', exchangeRate: '36.1234' }
  ];
  const inverse = inverseLedgerLines(original);
  const balanced = assertBalanced(inverse);

  assert.equal(serializeDecimal(balanced.debit, 2), '0.30');
  assert.equal(serializeDecimal(balanced.credit, 2), '0.30');
  assert.deepEqual(
    inverse.map((line) => ({
      code: line.accountCode,
      debit: serializeDecimal(line.debit, 2),
      credit: serializeDecimal(line.credit, 2),
      currency: line.currency,
      exchangeRate: serializeDecimal(line.exchangeRate, 4)
    })),
    [
      { code: '1.1', debit: '0.00', credit: '0.10', currency: 'USD', exchangeRate: '36.1234' },
      { code: '1.2', debit: '0.00', credit: '0.20', currency: 'USD', exchangeRate: '36.1234' },
      { code: '4.1', debit: '0.30', credit: '0.00', currency: 'USD', exchangeRate: '36.1234' }
    ]
  );
});

test('issue #91 exact balance rejects even one cent of mismatch', () => {
  const balanced = assertBalanced([
    { accountCode: 'D1', accountName: 'Débito 1', debit: '0.10' },
    { accountCode: 'D2', accountName: 'Débito 2', debit: '0.20' },
    { accountCode: 'C1', accountName: 'Crédito', credit: '0.30' }
  ]);
  assert.equal(serializeDecimal(balanced.debit, 2), '0.30');
  assert.equal(serializeDecimal(balanced.credit, 2), '0.30');

  assert.throws(() => assertBalanced([
    { accountCode: 'D1', accountName: 'Débito', debit: '10.00' },
    { accountCode: 'C1', accountName: 'Crédito', credit: '9.99' }
  ]));
});
