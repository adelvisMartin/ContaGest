// @ts-check
import { addPosCartItem } from './posCartPolicy.mjs';

/** Only unsaved, non-financial, in-memory drafts. No tenant or user identity is persisted. */
const MAX_HELD = 5;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
/** @typedef {Readonly<{productId:string,quantity:string}>} CartLine */
/** @typedef {Readonly<{sku:string,name:string}>} ProductLabel */
/** @typedef {Readonly<Record<string,ProductLabel>>} Names */
/** @typedef {Readonly<{id:string,lines:readonly CartLine[],names:Names}>} HeldCart */

export class PosHoldError extends Error {
  /** @param {string} code */
  constructor(code) {
    super(`POS_HOLD_${code}`);
    this.name = 'PosHoldError';
    this.code = code;
  }
}

/** @param {unknown} id @returns {string} */
function validId(id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new PosHoldError('INVALID_ID');
  return id.toLowerCase();
}

/** @param {unknown} input @returns {readonly CartLine[]} */
function validatedLines(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 100) throw new PosHoldError('INVALID_LINES');
  /** @type {readonly CartLine[]} */
  let lines = [];
  for (const value of input) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PosHoldError('INVALID_LINES');
    const line = /** @type {{productId?:unknown,quantity?:unknown}} */ (value);
    if (typeof line.productId !== 'string' || typeof line.quantity !== 'string') throw new PosHoldError('INVALID_LINES');
    const next = addPosCartItem(lines, line.productId, line.quantity);
    if (next.length !== lines.length + 1) throw new PosHoldError('DUPLICATE_LINE');
    lines = next;
  }
  return lines;
}

/** @param {unknown} input @param {readonly CartLine[]} lines @returns {Names} */
function validatedNames(input, lines) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PosHoldError('INVALID_NAMES');
  const raw = /** @type {Record<string,unknown>} */ (input);
  /** @type {Record<string,ProductLabel>} */
  const names = {};
  for (const line of lines) {
    const value = raw[line.productId];
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PosHoldError('INVALID_NAMES');
    const item = /** @type {{sku?:unknown,name?:unknown}} */ (value);
    if (typeof item.sku !== 'string' || !item.sku.trim() || item.sku.length > 80
        || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 160) {
      throw new PosHoldError('INVALID_NAMES');
    }
    names[line.productId] = Object.freeze({ sku:item.sku, name:item.name });
  }
  return Object.freeze(names);
}

/** @param {unknown} input @returns {readonly HeldCart[]} */
function validatedHeld(input) {
  if (!Array.isArray(input) || input.length > MAX_HELD) throw new PosHoldError('INVALID_HELD');
  const seen = new Set();
  return Object.freeze(input.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PosHoldError('INVALID_HELD');
    const candidate = /** @type {{id?:unknown,lines?:unknown,names?:unknown}} */ (value);
    const id = validId(candidate.id);
    if (seen.has(id)) throw new PosHoldError('DUPLICATE_HOLD');
    seen.add(id);
    const lines = validatedLines(candidate.lines);
    return Object.freeze({ id, lines, names:validatedNames(candidate.names, lines) });
  }));
}

/**
 * Holds a snapshot and never mutates or stores the active cart.
 * @param {unknown} held @param {unknown} cart @param {unknown} names @param {unknown} id
 * @returns {readonly HeldCart[]}
 */
export function holdPosCart(held, cart, names, id) {
  const current = validatedHeld(held);
  if (current.length >= MAX_HELD) throw new PosHoldError('LIMIT');
  const holdId = validId(id);
  if (current.some((item) => item.id === holdId)) throw new PosHoldError('DUPLICATE_HOLD');
  const lines = validatedLines(cart);
  const labelSnapshot = validatedNames(names, lines);
  return Object.freeze([...current, Object.freeze({ id:holdId, lines, names:labelSnapshot })]);
}

/**
 * Resume fails closed when active draft is occupied; never overwrite a cashier's work.
 * @param {unknown} held @param {unknown} id @param {unknown} activeCart
 * @returns {Readonly<{held:readonly HeldCart[],cart:readonly CartLine[],names:Names}>}
 */
export function resumePosCart(held, id, activeCart) {
  if (!Array.isArray(activeCart) || activeCart.length !== 0) throw new PosHoldError('ACTIVE_CART_NOT_EMPTY');
  const current = validatedHeld(held);
  const resumeId = validId(id);
  const chosen = current.find((item) => item.id === resumeId);
  if (!chosen) throw new PosHoldError('NOT_FOUND');
  return Object.freeze({
    held:Object.freeze(current.filter((item) => item.id !== resumeId)),
    cart:chosen.lines,
    names:chosen.names
  });
}

/** @param {unknown} held @param {unknown} id @returns {readonly HeldCart[]} */
export function discardHeldPosCart(held, id) {
  const current = validatedHeld(held);
  const discardId = validId(id);
  if (!current.some((item) => item.id === discardId)) throw new PosHoldError('NOT_FOUND');
  return Object.freeze(current.filter((item) => item.id !== discardId));
}
