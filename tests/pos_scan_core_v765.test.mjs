import assert from 'node:assert/strict';
import test from 'node:test';
import { decidePosScanMatch, normalizePosScanCode } from '../backend/src/modules/pos/pos-scan-code.ts';

test('scanner preserves significant zeros and case', () => {
  assert.equal(normalizePosScanCode('00000012345'), '00000012345');
  assert.equal(normalizePosScanCode('xAbC-9'), 'xAbC-9');
});

test('scanner accepts bounded, documented punctuation', () => {
  assert.equal(normalizePosScanCode('A_b.2/C:3-4'), 'A_b.2/C:3-4');
  assert.equal(normalizePosScanCode('A'.repeat(64)), 'A'.repeat(64));
});

test('scanner trims benign outer whitespace from keyboard scanners', () => {
  assert.equal(normalizePosScanCode('\t00123\r\n'), '00123');
});

test('scanner rejects missing and nonscalar query values', () => {
  for (const value of [undefined, null, '', '  ', [], ['A1'], { code: 'A1' }, 1234, true]) {
    assert.equal(normalizePosScanCode(value), null);
  }
});

test('scanner rejects whitespace inside codes and excessive length', () => {
  for (const code of ['A B', 'A\nB', 'A\tB', 'A'.repeat(65)]) {
    assert.equal(normalizePosScanCode(code), null);
  }
});

test('scanner rejects common injection/control and Unicode confusables', () => {
  for (const code of ['<script>', "a' OR 1=1 --", '1\\2', '../', 'ＡBC', 'SKU💳', '\u0000A']) {
    assert.equal(normalizePosScanCode(code), null);
  }
});

test('scanner requires an initial ASCII letter or number', () => {
  assert.equal(normalizePosScanCode('-123'), null);
  assert.equal(normalizePosScanCode('.sku'), null);
  assert.equal(normalizePosScanCode('A-123'), 'A-123');
});

test('not-found is explicit and contains no product data', () => {
  assert.deepEqual(decidePosScanMatch([]), { kind: 'not_found' });
});

test('one match returns exactly the original candidate', () => {
  const product = Object.freeze({ id: 'a', sku: '001' });
  const decision = decidePosScanMatch([product]);
  assert.deepEqual(decision, { kind: 'found', value: product });
  assert.equal(decision.value, product);
});

test('cross-field collisions fail closed without picking a product', () => {
  const a = { id: 'a' }, b = { id: 'b' };
  assert.deepEqual(decidePosScanMatch([a, b]), { kind: 'ambiguous' });
  assert.deepEqual(decidePosScanMatch([a, b, a]), { kind: 'ambiguous' });
});

test('match policy does not mutate candidates or collections', () => {
  const values = Object.freeze([Object.freeze({ id: 'p1' })]);
  assert.deepEqual(decidePosScanMatch(values), { kind: 'found', value: values[0] });
  assert.equal(values.length, 1);
});
