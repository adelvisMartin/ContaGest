/** Canonical query-string page integers for bounded multi-tenant reads.
 * Express query values are untrusted: arrays/objects, whitespace, signs,
 * decimals, exponents and leading zeros are not interchangeable with integers.
 * Invalid shapes become NaN for Zod to reject with the existing HTTP schema
 * handling. Undefined is kept for route-specific defaults.
 */
export function canonicalPageInteger(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value))
    return Number.NaN;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}
