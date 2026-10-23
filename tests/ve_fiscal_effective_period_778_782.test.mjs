import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFiscalEffectivePeriod } from '../backend/src/modules/fiscal/fiscal-effective-period-policy.ts';

test('#778 boundary: a rule issue date must be within its UTC fiscal period', () => {
  assert.deepEqual(assertFiscalEffectivePeriod('2026-09', new Date('2026-09-30T23:59:59.999Z')), {
    period: '2026-09', effectiveAtUtc: '2026-09-30T23:59:59.999Z',
  });
  assert.deepEqual(assertFiscalEffectivePeriod('2026-10', new Date('2026-10-01T00:00:00.000Z')), {
    period: '2026-10', effectiveAtUtc: '2026-10-01T00:00:00.000Z',
  });
});
test('#778/#782 period must not differ by a day, timezone or invalid clock', () => {
  assert.throws(() => assertFiscalEffectivePeriod('2026-09', new Date('2026-10-01T00:00:00.000Z')));
  assert.throws(() => assertFiscalEffectivePeriod('2026-10', new Date('2026-09-30T23:59:59.999Z')));
  assert.throws(() => assertFiscalEffectivePeriod('2026-09', new Date(NaN)));
  assert.throws(() => assertFiscalEffectivePeriod('2026-13', new Date('2026-12-01T00:00:00Z')));
  assert.throws(() => assertFiscalEffectivePeriod('2026-09', null));
});
