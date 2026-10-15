import assert from 'node:assert/strict';
import test from 'node:test';
import { PosCartError, addPosCartItem, setPosCartQuantity, removePosCartItem } from '../frontend/src/services/posCartPolicy.mjs';

const id = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const rejects = (action, code) => assert.throws(action, (error) => error instanceof PosCartError && error.code === code);

test('adds one unit with canonical three decimal places', () => {
  assert.deepEqual(addPosCartItem([], id(1)), [{ productId: id(1), quantity: '1.000' }]);
});
test('allows the smallest sale quantity', () => { assert.equal(addPosCartItem([], id(1), '0.001')[0].quantity, '0.001'); });
test('adds fractional quantities without float rounding', () => {
  const first = addPosCartItem([], id(1), '0.1');
  assert.equal(addPosCartItem(first, id(1), '0.2')[0].quantity, '0.300');
});
test('merges repeated product scans, not new lines', () => {
  const twice = addPosCartItem(addPosCartItem([], id(1)), id(1));
  assert.equal(twice.length, 1); assert.equal(twice[0].quantity, '2.000');
});
test('combines upper/lowercase UUIDs as same product', () => {
  const upper = 'AAAAAAAA-1111-4111-8111-111111111111';
  const twice = addPosCartItem(addPosCartItem([], upper), upper.toLowerCase());
  assert.equal(twice.length, 1); assert.equal(twice[0].productId, upper.toLowerCase());
});
test('keeps different product order stable', () => {
  let cart = addPosCartItem([], id(1)); cart = addPosCartItem(cart, id(2)); cart = addPosCartItem(cart, id(1));
  assert.deepEqual(cart.map((line) => line.productId), [id(1), id(2)]);
});
test('set replaces quantity without changing other products', () => {
  const cart = addPosCartItem(addPosCartItem([], id(1)), id(2));
  assert.deepEqual(setPosCartQuantity(cart, id(2), '3.125'), [{ productId: id(1), quantity: '1.000' }, { productId: id(2), quantity: '3.125' }]);
});
test('set must not silently add an unknown item', () => { rejects(() => setPosCartQuantity([], id(1), '1'), 'UNKNOWN_PRODUCT'); });
test('remove is idempotent and preserves order', () => {
  const a = addPosCartItem(addPosCartItem([], id(1)), id(2));
  assert.deepEqual(removePosCartItem(removePosCartItem(a, id(1)), id(1)), [{ productId: id(2), quantity: '1.000' }]);
});
test('all functions work on frozen arrays and return immutable snapshots', () => {
  const initial = Object.freeze([]);
  const added = addPosCartItem(initial, id(1));
  assert.ok(Object.isFrozen(added)); assert.ok(Object.isFrozen(added[0]));
  const changed = setPosCartQuantity(added, id(1), '2');
  assert.equal(added[0].quantity, '1.000'); assert.equal(changed[0].quantity, '2.000');
  assert.ok(Object.isFrozen(removePosCartItem(changed, id(1))));
});
test('reject invalid ids and identifier injection', () => {
  for (const productId of [null, '', 'x', '1'.repeat(36), id(1) + ' ', `${id(1)};DROP`, {}, 123]) {
    rejects(() => addPosCartItem([], productId), 'INVALID_PRODUCT');
  }
});
test('reject quantity numbers and exponential/negative/floating precision', () => {
  for (const quantity of [NaN, 1, 1.5, null, '', ' ', '1e3', '-1', '+1', '0.0009', '1.1234', 'abc', '1,23', '1 ', '.5']) {
    rejects(() => addPosCartItem([], id(1), quantity), 'INVALID_QUANTITY');
  }
});
test('zero quantity must use explicit remove', () => {
  rejects(() => addPosCartItem([], id(1), '0'), 'ZERO_QUANTITY');
  rejects(() => setPosCartQuantity(addPosCartItem([], id(1)), id(1), '0.000'), 'ZERO_QUANTITY');
});
test('maximum Decimal(18,3) is preserved', () => {
  assert.equal(addPosCartItem([], id(1), '999999999999999.999')[0].quantity, '999999999999999.999');
});
test('overflows on addition beyond Decimal(18,3)', () => {
  const old = addPosCartItem([], id(1), '999999999999999.999');
  rejects(() => addPosCartItem(old, id(1), '0.001'), 'QUANTITY_OVERFLOW');
});
test('rejects out-of-range input quantity', () => { rejects(() => addPosCartItem([], id(1), '1000000000000000.000'), 'QUANTITY_OVERFLOW'); });
test('maximum 100 distinct lines, including after delete', () => {
  let cart = [];
  for (let n = 1; n <= 100; n++) cart = addPosCartItem(cart, id(n));
  assert.equal(cart.length, 100);
  rejects(() => addPosCartItem(cart, id(101)), 'CART_FULL');
  assert.equal(addPosCartItem(cart, id(1)).length, 100);
  const next = addPosCartItem(removePosCartItem(cart, id(1)), id(101));
  assert.equal(next.length, 100);
});
test('rejects oversized/untrusted pre-existing carts', () => {
  const line = { productId: id(1), quantity: '1.000' };
  rejects(() => removePosCartItem(Array.from({ length: 101 }, () => line), id(1)), 'INVALID_CART');
  rejects(() => addPosCartItem({}, id(1)), 'INVALID_CART');
});
test('rejects duplicate identifiers already embedded in untrusted cart state', () => {
  rejects(() => setPosCartQuantity([{ productId: id(1), quantity: '1' }, { productId: id(1), quantity: '1' }], id(1), '2'), 'DUPLICATE_PRODUCT');
});
test('rejects invalid existing line without silently dropping it', () => {
  rejects(() => addPosCartItem([null], id(2)), 'INVALID_CART');
  rejects(() => removePosCartItem([{ productId: id(1), quantity: '-1' }], id(1)), 'INVALID_QUANTITY');
});
test('no price/FX/tax/stock is generated from untrusted client draft', () => {
  const cart = addPosCartItem([], id(1), '0.5');
  assert.deepEqual(Object.keys(cart[0]).sort(), ['productId', 'quantity']);
});
