import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import {
  PriceResolutionError,
  materializeResolvedAmount,
  selectPriceCandidate,
  type PriceCandidate,
} from './price-resolution.policy.js';

const instant = new Date('2026-10-05T12:00:00.000Z');

function candidate(overrides: Partial<PriceCandidate> = {}): PriceCandidate {
  return {
    entryId: 'entry-default',
    priceBookId: 'book-default',
    amount: new Prisma.Decimal('10.00'),
    currency: 'VES',
    priceMode: 'fixed',
    priority: 100,
    locationScope: 'global',
    effectiveFrom: new Date('2026-10-01T00:00:00.000Z'),
    effectiveTo: null,
    version: 1,
    ...overrides,
  };
}

test('selectPriceCandidate respects inclusive start and exclusive end boundaries', () => {
  const expired = candidate({ entryId: 'old', effectiveTo: instant });
  const current = candidate({ entryId: 'new', effectiveFrom: instant, priority: 101 });
  const resolved = selectPriceCandidate([expired, current], { instant, locationId: null });
  assert.equal(resolved.entryId, 'new');
});

test('specific-location candidates are eligible only for their assigned location', () => {
  const location = candidate({
    entryId: 'location',
    priceBookId: 'book-location',
    priority: 200,
    locationScope: 'specific_locations',
    locationIds: ['location-a'],
  });
  const fallback = candidate({ entryId: 'global', priority: 100 });

  assert.equal(selectPriceCandidate([location, fallback], { instant, locationId: 'location-a' }).entryId, 'location');
  assert.equal(selectPriceCandidate([location, fallback], { instant, locationId: 'location-b' }).entryId, 'global');
});

test('equal highest-precedence candidates fail closed instead of choosing nondeterministically', () => {
  const left = candidate({ entryId: 'left', priceBookId: 'book-left', priority: 500 });
  const right = candidate({ entryId: 'right', priceBookId: 'book-right', priority: 500 });
  assert.throws(
    () => selectPriceCandidate([left, right], { instant, locationId: null }),
    (error: unknown) => error instanceof PriceResolutionError && error.code === 'PRICE_AUTHORITY_AMBIGUOUS',
  );
});

test('no effective candidate fails with an explicit not-found authority error', () => {
  assert.throws(
    () => selectPriceCandidate([candidate({ effectiveFrom: new Date('2026-10-06T00:00:00.000Z') })], { instant, locationId: null }),
    (error: unknown) => error instanceof PriceResolutionError && error.code === 'PRICE_AUTHORITY_NOT_FOUND',
  );
});

test('fixed prices require the exact document currency and never consult FX', () => {
  const fixed = candidate({ amount: new Prisma.Decimal('12.34'), currency: 'USD', priceMode: 'fixed' });
  assert.equal(materializeResolvedAmount(fixed, { documentCurrency: 'USD' }).amount.toFixed(2), '12.34');
  assert.throws(
    () => materializeResolvedAmount(fixed, { documentCurrency: 'VES', fxRate: new Prisma.Decimal('45.00') }),
    (error: unknown) => error instanceof PriceResolutionError && error.code === 'PRICE_CURRENCY_MISMATCH',
  );
});

test('fx-derived prices require explicit financial-authority evidence and use document-to-book convention', () => {
  const derived = candidate({ amount: new Prisma.Decimal('45.00'), currency: 'VES', priceMode: 'fx_derived' });
  assert.throws(
    () => materializeResolvedAmount(derived, { documentCurrency: 'USD' }),
    (error: unknown) => error instanceof PriceResolutionError && error.code === 'PRICE_FX_EVIDENCE_REQUIRED',
  );
  const resolved = materializeResolvedAmount(derived, {
    documentCurrency: 'USD',
    fxRate: new Prisma.Decimal('45.0000'),
    fxRateDate: instant,
    fxRateSource: 'financial-policy',
  });
  assert.equal(resolved.amount.toFixed(2), '1.00');
  assert.equal(resolved.currency, 'USD');
  assert.equal(resolved.sourceCurrency, 'VES');
});
