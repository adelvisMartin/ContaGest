// @ts-check
/**
 * The FoodOrder API is the only authority for order creation. No local order
 * should be fabricated when a server write has an ambiguous outcome.
 * A duplicate click while in flight must never issue another POST.
 */
/** @typedef {{id: string}} ConfirmedFoodOrder */
/**
 * @param {{save: (draft: unknown) => Promise<unknown>, commit: (saved: ConfirmedFoodOrder) => void}} adapters
 * @returns {(draft: unknown) => Promise<{status:'busy'}|{status:'saved',order:ConfirmedFoodOrder,uiUpdated:boolean}>}
 */
export function createCounterOrderCommit(adapters) {
  if (!adapters || typeof adapters.save !== 'function' || typeof adapters.commit !== 'function') {
    throw new TypeError('POS_ORDER_INVALID_ADAPTERS');
  }
  let inFlight = false;
  return async (draft) => {
    if (inFlight) return { status: 'busy' };
    inFlight = true;
    try {
      const saved = await adapters.save(draft);
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)
          || typeof /** @type {{id?:unknown}} */ (saved).id !== 'string'
          || !/** @type {{id:string}} */ (saved).id.trim()) {
        throw new Error('POS_ORDER_SERVER_CONFIRMATION_MISSING');
      }
      const order = /** @type {ConfirmedFoodOrder} */ (saved);
      try {
        adapters.commit(order);
        return { status: 'saved', order, uiUpdated: true };
      } catch {
        // The backend returned an authoritative order ID. A local Store failure
        // cannot undo that remote write; do not invite a second POST.
        return { status: 'saved', order, uiUpdated: false };
      }
    } finally {
      inFlight = false;
    }
  };
}
