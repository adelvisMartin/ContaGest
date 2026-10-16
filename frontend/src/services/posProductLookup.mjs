// @ts-check
/**
 * Read-only provisional match from the authenticated products list.
 * NOT a tenant/stock/pricing authority or a substitute for the atomic
 * server-scoped barcode lookup in PR #1068. This is a draft UI only.
 */
const SCANNABLE_CODE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$/;
const PRODUCT_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
/** @typedef {Readonly<{id:string,sku:string,name:string,barcode:string}>} PosDraftProduct */
/** @typedef {{kind:'invalid'|'not_found'|'ambiguous'|'invalid_catalog'}|{kind:'found',product:PosDraftProduct}} PosDraftMatch */

/** @param {unknown} code @returns {string|null} */
export function normalizePosLookupCode(code) {
  if (typeof code !== 'string') return null;
  const normalized = code.trim();
  return SCANNABLE_CODE.test(normalized) ? normalized : null;
}

/**
 * Fail closed on malformed products, duplicate rows or identifier collisions.
 * Never trust the client list to authorize checkout, fiscal/stock or payment.
 * @param {unknown} products
 * @param {unknown} code
 * @returns {PosDraftMatch}
 */
export function matchPosDraftProduct(products, code) {
  const value = normalizePosLookupCode(code);
  if (!value) return { kind: 'invalid' };
  if (!Array.isArray(products) || products.length > 500) return { kind: 'invalid_catalog' };
  /** @type {PosDraftProduct[]} */
  const matches = [];
  for (const item of products) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { kind: 'invalid_catalog' };
    const candidate = /** @type {{id?:unknown,sku?:unknown,name?:unknown,barcode?:unknown,active?:unknown}} */ (item);
    if (candidate.active === false) continue;
    if (candidate.active !== undefined && candidate.active !== true) return { kind: 'invalid_catalog' };
    if (candidate.sku !== value && candidate.barcode !== value) continue;
    if (typeof candidate.id !== 'string' || !PRODUCT_ID.test(candidate.id)
        || typeof candidate.name !== 'string' || !candidate.name.trim()
        || typeof candidate.sku !== 'string' || !candidate.sku.trim()) return { kind: 'invalid_catalog' };
    matches.push({
      id: candidate.id.toLowerCase(),
      sku: candidate.sku,
      name: candidate.name,
      barcode: typeof candidate.barcode === 'string' ? candidate.barcode : ''
    });
    if (matches.length > 1) return { kind: 'ambiguous' };
  }
  if (!matches.length) return { kind: 'not_found' };
  return { kind: 'found', product: Object.freeze(matches[0]) };
}

/**
 * Server lookup is tenant/RBAC authoritative and may match ProductCode aliases
 * that are not present in sku/barcode. Never re-match the returned identity
 * against a stale browser catalogue. Strip prices/stock/other fields.
 * @param {unknown} response
 * @returns {PosDraftMatch}
 */
export function acceptServerPosProduct(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return { kind:'invalid_catalog' };
  const item = /** @type {{id?:unknown,sku?:unknown,name?:unknown,barcode?:unknown}} */ (response);
  if (typeof item.id !== 'string' || !PRODUCT_ID.test(item.id)
      || typeof item.sku !== 'string' || !item.sku.trim()
      || typeof item.name !== 'string' || !item.name.trim()
      || (item.barcode !== undefined && item.barcode !== null && typeof item.barcode !== 'string')) {
    return { kind:'invalid_catalog' };
  }
  return { kind:'found', product:Object.freeze({
    id:item.id.toLowerCase(), sku:item.sku, name:item.name, barcode:typeof item.barcode==='string'?item.barcode:''
  }) };
}
