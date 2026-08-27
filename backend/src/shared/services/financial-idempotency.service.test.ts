import test from 'node:test';
import assert from 'node:assert/strict';
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
