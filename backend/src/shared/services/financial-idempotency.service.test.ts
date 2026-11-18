import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import {
  canonicalRequestHash,
  canonicalRequestJson,
  hashIdempotencyKey,
  normalizeIdempotencyKey,
  normalizeIdempotencyScope
} from './financial-idempotency.service.js';

function captureError(fn: () => unknown) {
  try {
    fn();
    assert.fail('Expected function to throw');
  } catch (error: any) {
    return error;
  }
}

test('canonical request hashing ignores object key insertion order', () => {
  const left = { z: 3, a: { y: 2, x: 1 }, items: [{ b: 2, a: 1 }] };
  const right = { items: [{ a: 1, b: 2 }], a: { x: 1, y: 2 }, z: 3 };
  assert.equal(canonicalRequestJson(left), canonicalRequestJson(right));
  assert.equal(canonicalRequestHash(left), canonicalRequestHash(right));
});

test('same idempotency key and same logical payload resolve to the same identity hashes', () => {
  const key = 'sale-retry-01J6A6D2K4W2N8TRXQ0A123456';
  const first = { number:'F-001', amount:10, meta:{ currency:'USD', rate:1 } };
  const retry = { meta:{ rate:1, currency:'USD' }, amount:10, number:'F-001' };
  assert.equal(hashIdempotencyKey(key), hashIdempotencyKey(key));
  assert.equal(canonicalRequestHash(first), canonicalRequestHash(retry));
});

test('same idempotency key and materially different payload have different request hashes', () => {
  const key = 'sale-retry-01J6A6D2K4W2N8TRXQ0A123456';
  assert.equal(hashIdempotencyKey(key), hashIdempotencyKey(key));
  assert.notEqual(
    canonicalRequestHash({ number:'F-001', amount:10, currency:'USD' }),
    canonicalRequestHash({ number:'F-001', amount:11, currency:'USD' })
  );
});

test('canonical request hashing distinguishes materially different payloads', () => {
  assert.notEqual(
    canonicalRequestHash({ amount: 10, currency: 'USD' }),
    canonicalRequestHash({ amount: 11, currency: 'USD' })
  );
});

test('canonical request hashing normalizes dates and negative zero deterministically', () => {
  const date = new Date('2026-08-27T05:00:00.000Z');
  assert.equal(canonicalRequestJson({ date, value: -0 }), '{"date":"2026-08-27T05:00:00.000Z","value":0}');
});

test('financial Decimal canonical hashes are scale-independent without discarding request values', () => {
  const parsed = {
    exchangeRate: new Prisma.Decimal('1.0000'),
    lines: [{ quantity: new Prisma.Decimal('1.000'), unitPrice: new Prisma.Decimal('10.00'), taxRate: new Prisma.Decimal('0.00') }]
  };
  const canonical = {
    lines: [{ taxRate: '0', unitPrice: '10', quantity: '1' }],
    exchangeRate: '1'
  };
  assert.equal(canonicalRequestJson(parsed), canonicalRequestJson(canonical));
  assert.equal(canonicalRequestHash(parsed), canonicalRequestHash(canonical));
  assert.notEqual(canonicalRequestHash(parsed),
    canonicalRequestHash({ ...parsed, lines: [{ ...parsed.lines[0], unitPrice: new Prisma.Decimal('11') }] }));
});

test('scope normalization is stable and rejects unsafe scopes', () => {
  assert.equal(normalizeIdempotencyScope(' Sales.Create '), 'sales.create');
  const error = captureError(() => normalizeIdempotencyScope('sales create'));
  assert.equal(error.status, 500);
  assert.equal(error.details?.code, 'IDEMPOTENCY_SCOPE_INVALID');
});

test('idempotency keys are opaque, bounded and never stored as raw hashes accidentally', () => {
  const key = 'sale_01J6A6D2K4W2N8TRXQ0A123456';
  assert.equal(normalizeIdempotencyKey(key), key);
  assert.match(hashIdempotencyKey(key), /^[0-9a-f]{64}$/);
  assert.notEqual(hashIdempotencyKey(key), key);

  const short = captureError(() => normalizeIdempotencyKey('short'));
  assert.equal(short.status, 400);
  assert.equal(short.details?.code, 'IDEMPOTENCY_KEY_INVALID');

  const whitespace = captureError(() => normalizeIdempotencyKey('invalid key with spaces'));
  assert.equal(whitespace.status, 400);
  assert.equal(whitespace.details?.code, 'IDEMPOTENCY_KEY_INVALID');
});

test('non-finite numeric input is rejected before hashing', () => {
  const error = captureError(() => canonicalRequestHash({ amount: Number.POSITIVE_INFINITY }));
  assert.equal(error.status, 422);
  assert.equal(error.details?.code, 'IDEMPOTENCY_REQUEST_NOT_CANONICAL');
});

test('#1289 prototype-named JSON fields must affect request hashes, not disappear', () => {
  const ordinary = { amount: 10, currency: 'USD' };
  const crafted = JSON.parse('{"amount":10,"currency":"USD","__proto__":{"sideEffect":true}}');
  const canonical = canonicalRequestJson(crafted);
  assert.equal(canonical, '{"__proto__":{"sideEffect":true},"amount":10,"currency":"USD"}');
  assert.notEqual(canonicalRequestHash(ordinary), canonicalRequestHash(crafted));
  assert.equal(({} as any).sideEffect, undefined, 'no pollution of the global prototype');
});

test('#1289 canonical hash preserves explicit sensitive-looking keys as data without prototype pollution', () => {
  const payload = JSON.parse('{"constructor":{"prototype":{"admin":true}},"amount":1}');
  assert.equal(canonicalRequestJson(payload), '{"amount":1,"constructor":{"prototype":{"admin":true}}}');
  const original = JSON.parse('{"__proto__":1,"nested":{"__proto__":2}}');
  assert.equal(canonicalRequestJson(original), '{"__proto__":1,"nested":{"__proto__":2}}');
});

test('invalid Date values are canonical request errors rather than uncaught RangeError', () => {
  const error = captureError(() => canonicalRequestHash({ issuedAt: new Date(Number.NaN) }));
  assert.equal(error.status, 422);
  assert.equal(error.details?.code, 'IDEMPOTENCY_REQUEST_NOT_CANONICAL');
});
