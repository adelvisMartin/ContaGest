import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPayrollReceiptArithmetic } from '../backend/src/modules/payroll/payroll-receipt-arithmetic.ts';

test('#781 exact VES cents balance with worker deductions', () => {
  assert.deepEqual(assertPayrollReceiptArithmetic({ gross: '100.01', deductions: '12.31',
    net: '87.70' }), { balanced: true });
});
test('#781 falsified net, excessive employee deductions and negative numbers reject', () => {
  for (const row of [
    { gross: '100.00', deductions: '12.31', net: '87.70' },
    { gross: '100.00', deductions: '101.00', net: '0.00' },
    { gross: '100.00', deductions: '-1.00', net: '101.00' },
  ]) assert.throws(() => assertPayrollReceiptArithmetic(row));
});
test('#781 zero deduction and exact large decimals work without JS floats', () => {
  assert.equal(assertPayrollReceiptArithmetic({
    gross: '9999999999999999.99', deductions: '0.00', net: '9999999999999999.99',
  }).balanced, true);
});
