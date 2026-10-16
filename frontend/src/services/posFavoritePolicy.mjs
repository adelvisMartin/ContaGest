// @ts-check
import { normalizePosLookupCode } from './posProductLookup.mjs';

/**
 * POS shortcuts held only in component memory. A favorite is NOT a product,
 * stock, price or authorization authority; rescan via backend before cart add.
 */
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_FAVORITES = 12;
/** @typedef {Readonly<{id:string,sku:string,name:string}>} PosFavorite */

export class PosFavoriteError extends Error {
  /** @param {string} code */
  constructor(code) {
    super(`POS_FAVORITE_${code}`);
    this.name = 'PosFavoriteError';
    this.code = code;
  }
}

/** @param {unknown} value @returns {PosFavorite} */
function validateFavorite(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PosFavoriteError('INVALID_PRODUCT');
  const item = /** @type {{id?:unknown,sku?:unknown,name?:unknown}} */ (value);
  if (typeof item.id !== 'string' || !UUID.test(item.id)
      || typeof item.sku !== 'string' || normalizePosLookupCode(item.sku) !== item.sku
      || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 160) {
    throw new PosFavoriteError('INVALID_PRODUCT');
  }
  return Object.freeze({ id:item.id.toLowerCase(), sku:item.sku, name:item.name });
}

/** @param {unknown} input @returns {readonly PosFavorite[]} */
function validatedList(input) {
  if (!Array.isArray(input) || input.length > MAX_FAVORITES) throw new PosFavoriteError('INVALID_LIST');
  const ids = new Set();
  const skus = new Set();
  return Object.freeze(input.map((value) => {
    const favorite = validateFavorite(value);
    if (ids.has(favorite.id) || skus.has(favorite.sku)) throw new PosFavoriteError('DUPLICATE');
    ids.add(favorite.id);
    skus.add(favorite.sku);
    return favorite;
  }));
}

/**
 * Save an identity already returned by the authenticated server. Never accept
 * manual favorites unless the caller has first resolved their code server-side.
 * @param {unknown} favorites @param {unknown} serverProduct
 * @returns {readonly PosFavorite[]}
 */
export function addPosFavorite(favorites, serverProduct) {
  const existing = validatedList(favorites);
  const candidate = validateFavorite(serverProduct);
  if (existing.some((item) => item.id === candidate.id)) return existing;
  if (existing.some((item) => item.sku === candidate.sku)) throw new PosFavoriteError('SKU_COLLISION');
  if (existing.length >= MAX_FAVORITES) throw new PosFavoriteError('LIMIT');
  return Object.freeze([...existing, candidate]);
}

/** @param {unknown} favorites @param {unknown} id @returns {readonly PosFavorite[]} */
export function removePosFavorite(favorites, id) {
  const existing = validatedList(favorites);
  if (typeof id !== 'string' || !UUID.test(id)) throw new PosFavoriteError('INVALID_ID');
  const key = id.toLowerCase();
  return Object.freeze(existing.filter((item) => item.id !== key));
}

/**
 * A shortcut must still resolve to the same server-owned product ID; otherwise
 * its SKU may have been reassigned or the product disabled/deleted.
 * @param {unknown} favorite @param {unknown} confirmedProduct
 * @returns {boolean}
 */
export function matchesPosFavorite(favorite, confirmedProduct) {
  try {
    const expected = validateFavorite(favorite);
    const actual = validateFavorite(confirmedProduct);
    return expected.id === actual.id && expected.sku === actual.sku;
  } catch {
    return false;
  }
}
