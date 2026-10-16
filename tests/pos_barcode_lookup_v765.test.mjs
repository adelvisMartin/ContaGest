import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePosScanCode, decidePosScanMatch } from '../backend/src/modules/pos/pos-scan-code.ts';

const sales = readFileSync(new URL('../backend/src/modules/sales/sales.routes.ts', import.meta.url), 'utf8');
const backend = JSON.parse(readFileSync(new URL('../backend/package.json', import.meta.url), 'utf8'));

test('SKU and barcode preserve exact case and leading zeroes', () => {
  for (const code of ['0001234567890', 'SKU-A_01', '12/08:AA.2', 'aBc']) {
    assert.equal(normalizePosScanCode(code), code);
  }
  assert.equal(normalizePosScanCode(' 00120 '), '00120');
});

test('reject arrays, objects, empty, excessive, control and injection-like codes', () => {
  for (const value of [undefined, null, 1234, ['a'], { code: 'SKU-1' }, '', ' ', 'A B', 'a'.repeat(65), '%', '1\\2', '<script>', "a' OR '1'='1", 'ñ']) {
    assert.equal(normalizePosScanCode(value), null);
  }
});

test('never silently pick one product for cross-field collision', () => {
  assert.deepEqual(decidePosScanMatch([]), { kind: 'not_found' });
  const a = { id: 'tenantA-product1' };
  const b = { id: 'tenantA-product2' };
  assert.deepEqual(decidePosScanMatch([a]), { kind: 'found', value: a });
  assert.deepEqual(decidePosScanMatch([a, b]), { kind: 'ambiguous' });
  assert.deepEqual(decidePosScanMatch([a, b, a]), { kind: 'ambiguous' });
});

test('read-only route uses authenticated tenant, permission and two-record cap', () => {
  const routeStart = sales.indexOf("router.get('/pos/product-lookup'");
  const routeEnd = sales.indexOf("router.get('/', requirePermission('sales.view')", routeStart);
  assert.ok(routeStart > 0 && routeEnd > routeStart, 'lookup precedes generic sales list');
  const route = sales.slice(routeStart, routeEnd);
  assert.match(route, /requirePermission\('sales\.view'\)/);
  assert.match(route, /context\(req\)\.tenantId/);
  assert.match(route, /tenantId,\s*active:\s*true/);
  assert.match(route, /productCodes:\s*\{\s*some:\s*\{\s*tenantId,\s*active:\s*true,\s*kind:\s*'barcode'/);
  assert.match(route, /take:\s*2/);
  assert.match(route, /decidePosScanMatch\(matches\)/);
  assert.match(route, /Cache-Control', 'private, no-store'/);
  assert.match(route, /404/);
  assert.match(route, /409/);
  assert.doesNotMatch(route, /\.create\(|\.update\(|\.delete\(|\.upsert\(|\.\$executeRaw/);
  assert.doesNotMatch(route, /\bcost\s*:\s*true|\bprice\s*:\s*true|\bstock\s*:\s*true/);
});

test('scanner regressions are included in backend test suite', () => {
  assert.match(backend.scripts.test, /node --experimental-strip-types --test \.\.\/tests\/pos_barcode_lookup_v765\.test\.mjs/);
});
