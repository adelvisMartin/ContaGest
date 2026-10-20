import test from 'node:test';
import assert from 'node:assert/strict';
import { previewPosTender, PosTenderPreviewError } from '../backend/src/modules/pos/tender-preview.ts';

const t = (method, amount, currency = 'VES') => ({ method, amount, currency });
const preview = (due, tenders, currency = 'VES') => previewPosTender({ due, tenders, currency });
const error = (fn, code) => assert.throws(fn, (e) => e instanceof PosTenderPreviewError && e.code === code);

test('empty tender proposal remains pending and has no side effects', () => {
  assert.deepEqual(preview('15.75', []), {
    currency: 'VES', due: '15.75', paid: '0.00', remaining: '15.75', change: '0.00',
    status: 'pending', cashTendered: '0.00', nonCashTendered: '0.00'
  });
});
test('single cash tender exact', () => { assert.equal(preview('10.50', [t('cash', '10.50')]).status, 'exact'); });
test('single card tender exact, without change', () => { const p = preview('10.50', [t('card', '10.50')]); assert.equal(p.change, '0.00'); assert.equal(p.status, 'exact'); });
test('single transfer exact, without change', () => { assert.equal(preview('10.50', [t('transfer', '10.50')]).status, 'exact'); });
test('cash overpayment computes exact change', () => { const p = preview('19.95', [t('cash', '20')]); assert.equal(p.change, '0.05'); assert.equal(p.status, 'change'); });
test('cash + card computes change from cash only', () => {
  const p = preview('20.00', [t('card', '5.00'), t('cash', '20.00')]);
  assert.equal(p.change, '5.00'); assert.equal(p.cashTendered, '20.00'); assert.equal(p.nonCashTendered, '5.00');
});
test('mixed card + transfer + cash exact', () => {
  const p = preview('20.00', [t('card', '5.00'), t('transfer', '7.00'), t('cash', '8.00')]);
  assert.equal(p.status, 'exact'); assert.equal(p.change, '0.00');
});
test('partial tender returns positive remaining', () => { const p = preview('18.00', [t('card', '5.00')]); assert.equal(p.remaining, '13.00'); assert.equal(p.status, 'pending'); });
test('a cent is never lost to binary floating point', () => {
  const p = preview('0.30', [t('cash', '0.10'), t('cash', '0.20')]);
  assert.equal(p.status, 'exact'); assert.equal(p.paid, '0.30');
});
test('rejects noncash-only overpayment', () => error(() => preview('10', [t('card', '10.01')]), 'NONCASH_OVERPAYMENT'));
test('rejects transfer overpayment even when another tender is cash', () => error(() => preview('10', [t('cash', '1.00'), t('transfer', '11.00')]), 'NONCASH_OVERPAYMENT'));
test('rejects combined noncash overpayment across methods', () => error(() => preview('10', [t('card', '6'), t('transfer', '5')]), 'NONCASH_OVERPAYMENT'));
test('cross-currency input is rejected, no implied FX conversion', () => error(() => preview('10.00', [t('cash', '10.00', 'USD')]), 'CURRENCY_MISMATCH'));
test('same ISO-like currency is canonicalized consistently', () => { const p = previewPosTender({ currency: ' ves ', due: '2', tenders: [{ currency: 'ves', method: 'cash', amount: '2' }] }); assert.equal(p.currency, 'VES'); });
test('unknown currency format is rejected', () => error(() => preview('10', [], 'VE'), 'INVALID_CURRENCY'));
test('numeric and exponent amounts are rejected', () => {
  for (const amount of [0.1, 10, '1e3', '1.234', 'NaN', 'Infinity', ' 2', '2 ', '-1', '+1', '01.00', '', null]) {
    error(() => previewPosTender({ currency: 'VES', due: amount, tenders: [] }), 'INVALID_MONEY');
  }
});
test('zero total invoice is not an accepted tender authority', () => error(() => preview('0.00', []), 'INVALID_MONEY'));
test('zero tender is not allowed', () => error(() => preview('10', [t('cash', '0')]), 'INVALID_MONEY'));
test('invalid method rejected', () => error(() => preview('10', [t('cheque', '10')]), 'INVALID_METHOD'));
test('unknown shapes and oversized proposal rejected', () => {
  error(() => previewPosTender(null), 'INVALID_INPUT');
  error(() => previewPosTender({ currency: 'VES', due: '10', tenders: {} }), 'INVALID_INPUT');
  error(() => preview('15', Array.from({ length: 13 }, () => t('cash', '1'))), 'INVALID_INPUT');
});
test('rejects result overflowing Decimal(18,2)', () => error(() => preview('1', [t('cash', '9999999999999999.99'), t('cash', '0.01')]), 'AMOUNT_OVERFLOW'));
test('handles maximum representable invoice without float precision loss', () => {
  const p = preview('9999999999999999.99', [t('card', '9999999999999999.99')]);
  assert.equal(p.paid, '9999999999999999.99'); assert.equal(p.status, 'exact');
});
test('preview does not mutate frozen input', () => {
  const tenders = Object.freeze([Object.freeze(t('card', '4.00'))]);
  const data = Object.freeze({ currency: 'VES', due: '4.00', tenders });
  assert.equal(previewPosTender(data).status, 'exact'); assert.equal(tenders[0].amount, '4.00');
});

test('preview result fields cannot be overwritten after exact tender calculation', () => {
  const result = preview('10.00', [t('card', '4.00'), t('cash', '7.00')]);
  assert.equal(result.change, '1.00');
  assert.ok(Object.isFrozen(result));
  for (const [field, forged] of [['paid', '0.00'], ['change', '1000.00'], ['status', 'exact']]) {
    assert.throws(() => { result[field] = forged; }, TypeError);
  }
  assert.equal(result.paid, '11.00');
  assert.equal(result.change, '1.00');
  assert.equal(result.status, 'change');
});
test('all preview stages are immutable, with no payment authorization granted', () => {
  for (const tenders of [[], [t('card', '3')], [t('cash', '10')], [t('cash', '12')]]) {
    const result = preview('10.00', tenders);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.hasOwn(result, 'paymentCaptured'), false);
    assert.equal(Object.hasOwn(result, 'checkoutAuthorized'), false);
    assert.equal(Object.hasOwn(result, 'receiptId'), false);
  }
});
