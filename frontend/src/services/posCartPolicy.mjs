// @ts-check
/**
 * POS draft cart, in memory only. Product identifiers are provisional until the
 * authenticated server resolves them and recalculates stock/prices/taxes.
 * No currency, price, payment, invoice, inventory or persistence authority.
 * Quantities share Product/InvoiceLine Decimal(18,3), without binary floats.
 */
/** @typedef {Readonly<{productId: string, quantity: string}>} PosCartLine */
const PRODUCT_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const QUANTITY = /^\d+(?:\.\d{1,3})?$/;
const MAX_MILLI = 999999999999999999n; // Decimal(18,3)
const MAX_LINES = 100;

export class PosCartError extends Error {
  /** @param {string} code */
  constructor(code) {
    super(`POS_CART_${code}`);
    this.name = 'PosCartError';
    this.code = code;
  }
}

/** @param {unknown} id @returns {string} */
function canonicalId(id) {
  if (typeof id !== 'string' || !PRODUCT_ID.test(id)) throw new PosCartError('INVALID_PRODUCT');
  return id.toLowerCase();
}

/** @param {unknown} value @returns {bigint} */
function milli(value) {
  if (typeof value !== 'string' || value.length > 64 || !QUANTITY.test(value)) throw new PosCartError('INVALID_QUANTITY');
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0') || '0');
  if (amount === 0n) throw new PosCartError('ZERO_QUANTITY');
  if (amount > MAX_MILLI) throw new PosCartError('QUANTITY_OVERFLOW');
  return amount;
}

/** @param {bigint} value @returns {string} */
function format(value) {
  if (value < 1n || value > MAX_MILLI) throw new PosCartError('QUANTITY_OVERFLOW');
  return `${value / 1000n}.${(value % 1000n).toString().padStart(3, '0')}`;
}

/** @param {unknown} cart @returns {PosCartLine[]} */
function validatedCart(cart) {
  if (!Array.isArray(cart) || cart.length > MAX_LINES) throw new PosCartError('INVALID_CART');
  const seen = new Set();
  return cart.map((line) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) throw new PosCartError('INVALID_CART');
    const candidate = /** @type {{productId?: unknown, quantity?: unknown}} */ (line);
    const productId = canonicalId(candidate.productId);
    if (seen.has(productId)) throw new PosCartError('DUPLICATE_PRODUCT');
    seen.add(productId);
    return { productId, quantity: format(milli(candidate.quantity)) };
  });
}

/** @param {PosCartLine[]} lines @returns {readonly PosCartLine[]} */
function immutable(lines) {
  return Object.freeze(lines.map((line) => Object.freeze(line)));
}

/** Add quantities on a deliberate operator action; re-running a scan adds again. */
/** @param {unknown} cart @param {unknown} productId @param {unknown} [quantity] @returns {readonly PosCartLine[]} */
export function addPosCartItem(cart, productId, quantity = '1.000') {
  const lines = validatedCart(cart);
  const id = canonicalId(productId);
  const amount = milli(quantity);
  const index = lines.findIndex((line) => line.productId === id);
  if (index === -1) {
    if (lines.length >= MAX_LINES) throw new PosCartError('CART_FULL');
    return immutable([...lines, { productId: id, quantity: format(amount) }]);
  }
  const updated = [...lines];
  updated[index] = { productId: id, quantity: format(milli(lines[index].quantity) + amount) };
  return immutable(updated);
}

/** Quantity replacement never creates a new item implicitly. */
/** @param {unknown} cart @param {unknown} productId @param {unknown} quantity @returns {readonly PosCartLine[]} */
export function setPosCartQuantity(cart, productId, quantity) {
  const lines = validatedCart(cart);
  const id = canonicalId(productId);
  const index = lines.findIndex((line) => line.productId === id);
  if (index === -1) throw new PosCartError('UNKNOWN_PRODUCT');
  const updated = [...lines];
  updated[index] = { productId: id, quantity: format(milli(quantity)) };
  return immutable(updated);
}

/** Removal is idempotent; call it explicitly instead of setting quantity zero. */
/** @param {unknown} cart @param {unknown} productId @returns {readonly PosCartLine[]} */
export function removePosCartItem(cart, productId) {
  const lines = validatedCart(cart);
  const id = canonicalId(productId);
  return immutable(lines.filter((line) => line.productId !== id));
}
