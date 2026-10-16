// @ts-check
import { addPosCartItem } from './posCartPolicy.mjs';
import { acceptServerPosProduct, normalizePosLookupCode } from './posProductLookup.mjs';

/**
 * Read-only draft identity check, not a stock, price, tax, payment, checkout
 * or authorization guarantee. Every SKU is re-resolved through the server.
 * A cart mutation / tenant change invalidates in-flight results.
 */
/** @typedef {{productId:string,quantity:string}} DraftLine */
/** @typedef {{sku:string,name:string}} DraftLabel */
/** @typedef {'verified'|'invalid'|'changed'|'unavailable'|'stale'} VerificationKind */
/** @typedef {Readonly<{kind:VerificationKind,count:number}>} VerificationResult */

/**
 * @param {{
 *   lines: unknown,
 *   labels: unknown,
 *   resolve: (sku:string) => Promise<unknown>,
 *   isCurrent: () => boolean
 * }} options
 * @returns {Promise<VerificationResult>}
 */
export async function verifyPosDraftCart({ lines, labels, resolve, isCurrent }) {
  const result = /** @type {(kind:VerificationKind,count?:number)=>VerificationResult} */ (
    (kind, count = 0) => Object.freeze({ kind, count })
  );
  if (typeof resolve !== 'function' || typeof isCurrent !== 'function') return result('invalid');
  const current = () => {
    try { return isCurrent() === true; }
    catch { return false; }
  };
  if (!current()) return result('stale');
  if (!Array.isArray(lines) || !lines.length || lines.length > 100
      || !labels || typeof labels !== 'object' || Array.isArray(labels)) return result('invalid');

  /** @type {readonly DraftLine[]} */
  let validated = [];
  /** @type {DraftLabel[]} */
  const expected = [];
  try {
    const names = /** @type {Record<string,unknown>} */ (labels);
    for (const candidate of lines) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return result('invalid');
      const line = /** @type {{productId?:unknown,quantity?:unknown}} */ (candidate);
      if (typeof line.productId !== 'string' || typeof line.quantity !== 'string') return result('invalid');
      const next = addPosCartItem(validated, line.productId, line.quantity);
      if (next.length !== validated.length + 1) return result('invalid'); // duplicate products
      const label = names[next[next.length - 1].productId];
      if (!label || typeof label !== 'object' || Array.isArray(label)) return result('invalid');
      const metadata = /** @type {{sku?:unknown,name?:unknown}} */ (label);
      if (typeof metadata.sku !== 'string' || normalizePosLookupCode(metadata.sku) !== metadata.sku
          || typeof metadata.name !== 'string' || !metadata.name.trim()) return result('invalid');
      expected.push({ sku:metadata.sku, name:metadata.name });
      validated = next;
    }
  } catch {
    return result('invalid');
  }

  for (let i = 0; i < validated.length; i++) {
    if (!current()) return result('stale');
    let response;
    try {
      response = await resolve(expected[i].sku);
    } catch {
      return current() ? result('unavailable') : result('stale');
    }
    if (!current()) return result('stale');
    const decision = acceptServerPosProduct(response);
    if (decision.kind !== 'found'
        || decision.product.id !== validated[i].productId
        || decision.product.sku !== expected[i].sku) return result('changed');
  }
  return current() ? result('verified', validated.length) : result('stale');
}
