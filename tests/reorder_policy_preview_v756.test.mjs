import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewReorderPolicy, REORDER_POLICY_PREVIEW_VERSION } from '../backend/src/modules/reports/reorder-policy-preview.ts';

const preview = (override = {}) => previewReorderPolicy({
  stockExact: '10.000', reservedExact: '8.000', canonicalMinStockExact: '3.000',
  reorderPointExact: '5.000', targetStockExact: '20.000', safetyStockExact: '2.000',
  orderMultipleExact: '6.000', leadTimeDays: '7', ...override
});

test('uses available stock after reserves and rounds review quantity up to multiple', () => {
  const x = preview();
  assert.equal(x.availableExact, '2.000');
  assert.equal(x.deficitToTargetExact, '18.000');
  assert.equal(x.suggestedReviewQuantityExact, '18.000');
  assert.equal(x.canonicalMinStockExact, '3.000');
});
test('rounding never recommends less than the requested target gap', () => {
  const x = preview({ orderMultipleExact: '5.000' });
  assert.equal(x.deficitToTargetExact, '18.000');
  assert.equal(x.suggestedReviewQuantityExact, '20.000');
});
test('above reorder point produces no proposed purchase', () => {
  const x = preview({ stockExact: '15', reservedExact: '0' });
  assert.equal(x.status, 'ABOVE_REORDER_POINT');
  assert.equal(x.triggered, false);
  assert.equal(x.suggestedReviewQuantityExact, '0.000');
});
test('equality with reorder point triggers manual replenishment review', () => {
  const x = preview({ stockExact: '5', reservedExact: '0' });
  assert.equal(x.triggered, true);
  assert.equal(x.deficitToTargetExact, '15.000');
  assert.equal(x.suggestedReviewQuantityExact, '18.000');
});
test('no stock and no reservations still preserves exact Decimal thousandths', () => {
  const x = preview({ stockExact: '0.001', reservedExact: '0.001', targetStockExact: '5.001', reorderPointExact: '2.001', safetyStockExact: '0.001', orderMultipleExact: '0.005' });
  assert.equal(x.availableExact, '0.000');
  assert.equal(x.suggestedReviewQuantityExact, '5.005');
});
test('defaults are explicit and lead time does not fabricate velocity', () => {
  const x = preview({ safetyStockExact: undefined, orderMultipleExact: undefined, leadTimeDays: undefined });
  assert.equal(x.assumedPolicy.safetyStockExact, '0.000');
  assert.equal(x.assumedPolicy.orderMultipleExact, '1.000');
  assert.equal(x.assumedPolicy.leadTimeDays, 0);
  assert.equal(x.assumedPolicy.leadTimeAffectsQuantity, false);
});
test('refuses over-reserved stock as corrupted available authority', () => {
  assert.throws(() => preview({ reservedExact: '10.001' }), /REORDER_POLICY_UNRECONCILED_RESERVATIONS/);
});
test('safety must not exceed reorder point and target must be greater than point', () => {
  assert.throws(() => preview({ safetyStockExact: '5.001' }), /REORDER_POLICY_INCONSISTENT/);
  assert.throws(() => preview({ targetStockExact: '5.000' }), /REORDER_POLICY_INCONSISTENT/);
  assert.throws(() => preview({ orderMultipleExact: '0' }), /REORDER_POLICY_INCONSISTENT/);
});
test('invalid decimals and mixed signs never reach projection', () => {
  for (const qty of ['-1', 'NaN', '2e2', '1.0001', '01', ' 1', '1,000', '9999999999999999']) {
    assert.throws(() => preview({ targetStockExact: qty }), /REORDER_POLICY_QUANTITY_INVALID/);
  }
});
test('overflow after multiple rounding fails instead of exceeding database precision', () => {
  assert.throws(() => preview({ stockExact:'0',reservedExact:'0',reorderPointExact:'1',targetStockExact:'999999999999999.999',safetyStockExact:'0',orderMultipleExact:'100.000' }), /REORDER_POLICY_AMOUNT_OVERFLOW/);
});
test('big stock values remain exactly representable without float', () => {
  const x = preview({ stockExact:'999999999999999.999', reservedExact:'0', reorderPointExact:'1', targetStockExact:'2', safetyStockExact:'0', orderMultipleExact:'0.001' });
  assert.equal(x.stockExact, '999999999999999.999');
  assert.equal(x.status, 'ABOVE_REORDER_POINT');
});
test('lead time rejects invalid numeric encodings and ranges', () => {
  for (const leadTimeDays of ['-1', '366', '1.0', '1e2', '01', 'Infinity', ' 1']) {
    assert.throws(() => preview({ leadTimeDays }), /REORDER_POLICY_LEAD_TIME_INVALID/);
  }
  assert.equal(preview({ leadTimeDays: '365' }).assumedPolicy.leadTimeDays, 365);
});
test('result is not a stored policy, forecast or automatic purchase instruction', () => {
  const x = preview();
  assert.equal(x.version, REORDER_POLICY_PREVIEW_VERSION);
  assert.equal(x.mode, 'WHAT_IF_READ_ONLY');
  assert.equal(x.policyPersistence, 'NOT_STORED');
  assert.equal(x.requiresManualApproval, true);
  assert.equal(x.demandForecastAvailable, false);
  assert.equal(x.locationAllocationVerified, false);
  assert.equal(x.autoPurchaseEnabled, false);
});
