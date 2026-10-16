import test from 'node:test';
import assert from 'node:assert/strict';
import { matchPosDraftProduct, normalizePosLookupCode } from '../frontend/src/services/posProductLookup.mjs';
import { addPosCartItem, removePosCartItem } from '../frontend/src/services/posCartPolicy.mjs';
import { readFileSync } from 'node:fs';

const A = 'a5b468dc-347d-416a-80a7-8184e657db61';
const B = 'b5b468dc-347d-416a-80a7-8184e657db61';
const product = (id, sku, barcode = '') => ({ id, sku, barcode, name: `Producto ${sku}`, active: true, price: '99.99', stock: '10' });
test('preserves leading zeros, punctuation and case in codes', () => {
  assert.equal(normalizePosLookupCode(' 000123 \n'), '000123');
  assert.equal(normalizePosLookupCode('AbC-09:2'), 'AbC-09:2');
});
test('rejects query injections, multiline, unicode, overlength and scalar coercion', () => {
  for (const value of [null, undefined, ['SKU'], {}, 234, '', '  ', 'A B', 'A\\B', '<script>', '.SKU', 'ＡBC', 'A'.repeat(65)]) {
    assert.equal(normalizePosLookupCode(value), null);
  }
});
test('finds exact SKU, not case-folded or partial search', () => {
  const rows=[product(A,'AbC-09')];
  assert.equal(matchPosDraftProduct(rows,'AbC-09').kind,'found');
  assert.equal(matchPosDraftProduct(rows,'abc-09').kind,'not_found');
  assert.equal(matchPosDraftProduct(rows,'AbC').kind,'not_found');
});
test('finds exact barcode and preserves leading zeros', () => {
  const result=matchPosDraftProduct([product(A,'SKU1','00001234')],'00001234');
  assert.equal(result.kind,'found');
  assert.equal(result.product.barcode,'00001234');
});
test('one product matching both fields is not ambiguous', () => {
  assert.equal(matchPosDraftProduct([product(A,'001','001')],'001').kind,'found');
});
test('fail closed on cross-column code collisions between products', () => {
  assert.deepEqual(matchPosDraftProduct([product(A,'001'), product(B,'P2','001')],'001'),{kind:'ambiguous'});
});
test('fail closed on duplicate catalog rows', () => {
  assert.equal(matchPosDraftProduct([product(A,'001'),product(A,'001')],'001').kind,'ambiguous');
});
test('inactive product is not discoverable', () => {
  assert.equal(matchPosDraftProduct([{...product(A,'OLD'),active:false}],'OLD').kind,'not_found');
});
test('malformed match never enters cart', () => {
  assert.equal(matchPosDraftProduct([product('local-123','TEST')],'TEST').kind,'invalid_catalog');
  assert.equal(matchPosDraftProduct([product(A,'TEST'),null],'TEST').kind,'invalid_catalog');
});
test('reject invalid catalog list or excessive response rather than guessing', () => {
  assert.deepEqual(matchPosDraftProduct({},'TEST'),{kind:'invalid_catalog'});
  assert.equal(matchPosDraftProduct(Array(501).fill(product(A,'TEST')),'TEST').kind,'invalid_catalog');
  assert.equal(matchPosDraftProduct([{...product(A,'TEST'),active:'yes'}],'TEST').kind,'invalid_catalog');
});
test('match returns only identity, never prices/stock/fiscal values', () => {
  const found=matchPosDraftProduct([product(A,'X1','992')],'992');
  assert.equal(found.kind,'found');
  assert.deepEqual(Object.keys(found.product).sort(),['barcode','id','name','sku']);
  assert.equal(Object.isFrozen(found.product),true);
});
test('confirmed draft identity goes through previously merged exact cart logic', () => {
  const found=matchPosDraftProduct([product(A,'S1')],'S1');
  assert.equal(found.kind,'found');
  const a=addPosCartItem([],found.product.id);
  const b=addPosCartItem(a,found.product.id);
  assert.equal(b[0].quantity,'2.000');
  assert.deepEqual(removePosCartItem(b,found.product.id),[]);
});
test('Sales view wires tenant-authoritative barcode endpoint and merged draft cart without checkout', () => {
  const s=readFileSync(new URL('../frontend/src/pages/SalesPage.jsx',import.meta.url),'utf8');
  // Server-side resolver (PR #1068/#1115) replaced the paginated client list.
  assert.match(s,/BackendApi\\.get\\(\\x60\\/sales\\/pos\\/product-lookup\\?code=/);
  assert.match(s,/acceptServerPosProduct\\(resolved\\)/);
  assert.doesNotMatch(s,/BackendApi\\.list\\('products'\\)/);
  assert.match(s,/addPosCartItem\(/);
  assert.match(s,/removePosCartItem\(/);
  assert.doesNotMatch(s,/\b(?:submitPosCheckout|confirmPosSale|postPosPayment)\b/);
});
