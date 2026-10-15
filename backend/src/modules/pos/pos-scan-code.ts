/**
 * POS scanner input is transport data only. The authenticated database tenant
 * and product identifiers are resolved server-side; never trust client IDs.
 */
const SCANNABLE_CODE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$/;

export function normalizePosScanCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const candidate = input.trim();
  return SCANNABLE_CODE.test(candidate) ? candidate : null;
}

export type PosScanDecision<T> =
  | { kind: 'not_found' }
  | { kind: 'ambiguous' }
  | { kind: 'found'; value: T };

/**
 * Product.sku, Product.barcode and ProductCode.value are individually unique
 * per tenant but may still collide *across* those fields. Never guess.
 * The route queries at most two distinct products for a bounded decision.
 */
export function decidePosScanMatch<T>(matches: readonly T[]): PosScanDecision<T> {
  if (matches.length === 0) return { kind: 'not_found' };
  if (matches.length !== 1) return { kind: 'ambiguous' };
  return { kind: 'found', value: matches[0]! };
}
