// @ts-check
// #757: pure intent over server-verified purchase order rows. No inventory, AP or ledger write.
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
const QUANTITY = /^(?:0|[1-9][0-9]{0,12})(?:\.[0-9]{1,6})?$/;
const MAX = 999999999999999999n;
export class ProcurementPreflightError extends Error {
  /** @param {string} code */
  constructor(code) { super('PROCUREMENT_' + code); this.name = 'ProcurementPreflightError'; this.code = code; }
}
/** @param {unknown} value */
function ident(value) { if (typeof value !== 'string' || !ID.test(value)) throw new ProcurementPreflightError('IDENTITY_INVALID'); return value; }
/** @param {unknown} value */
function units(value) {
  if (typeof value !== 'string' || !QUANTITY.test(value)) throw new ProcurementPreflightError('QUANTITY_INVALID');
  const [integer, fraction = ''] = value.split('.');
  const v = BigInt(integer) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
  if (v > MAX) throw new ProcurementPreflightError('QUANTITY_OVERFLOW');
  return v;
}
/** @param {bigint} value */
function format(value) { return (value / 1000000n) + '.' + (value % 1000000n).toString().padStart(6, '0'); }
/**
 * @param {{ tenantId:unknown,actorTenantId:unknown,orderId:unknown,supplierId:unknown,actorId:unknown,
 * sourceVerified:unknown,status:unknown,expectedRevision:unknown,effectKey:unknown,
 * previousEffectKeys:unknown,orderLines:unknown,receiptLines:unknown }} input
 */
export function prepareProcurementReceipt(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ProcurementPreflightError('INPUT_INVALID');
  const tenantId = ident(input.tenantId), actorTenantId = ident(input.actorTenantId);
  if (tenantId !== actorTenantId || input.sourceVerified !== true) throw new ProcurementPreflightError('SCOPE_OR_SOURCE_UNVERIFIED');
  const orderId = ident(input.orderId), supplierId = ident(input.supplierId), actorId = ident(input.actorId);
  if (!['confirmed', 'partially_received'].includes(input.status)) throw new ProcurementPreflightError('ORDER_NOT_RECEIVABLE');
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 || input.expectedRevision >= Number.MAX_SAFE_INTEGER) throw new ProcurementPreflightError('REVISION_INVALID');
  const effectKey = ident(input.effectKey);
  if (!Array.isArray(input.previousEffectKeys) || input.previousEffectKeys.length > 500 || input.previousEffectKeys.some(k => typeof k !== 'string')) throw new ProcurementPreflightError('EFFECT_HISTORY_INVALID');
  if (new Set(input.previousEffectKeys).size !== input.previousEffectKeys.length) throw new ProcurementPreflightError('EFFECT_HISTORY_INVALID');
  if (input.previousEffectKeys.includes(effectKey)) throw new ProcurementPreflightError('DUPLICATE_EFFECT');
  if (!Array.isArray(input.orderLines) || input.orderLines.length < 1 || input.orderLines.length > 200 ||
      !Array.isArray(input.receiptLines) || input.receiptLines.length < 1 || input.receiptLines.length > 200) throw new ProcurementPreflightError('LINES_INVALID');
  const byId = new Map();
  for (const line of input.orderLines) {
    if (!line || typeof line !== 'object' || Array.isArray(line) || line.tenantId !== tenantId || line.orderId !== orderId || line.supplierId !== supplierId) throw new ProcurementPreflightError('LINE_SCOPE_INVALID');
    const id = ident(line.id);
    if (byId.has(id)) throw new ProcurementPreflightError('DUPLICATE_ORDER_LINE');
    const quantity = units(line.quantity), received = units(line.received);
    if (quantity === 0n || received > quantity) throw new ProcurementPreflightError('ORDER_QUANTITY_INVALID');
    byId.set(id, { id, productId: ident(line.productId), quantity, received, increment: 0n });
  }
  const seen = new Set();
  for (const line of input.receiptLines) {
    if (!line || typeof line !== 'object' || Array.isArray(line)) throw new ProcurementPreflightError('RECEIPT_LINE_INVALID');
    const id = ident(line.orderLineId);
    if (seen.has(id)) throw new ProcurementPreflightError('DUPLICATE_RECEIPT_LINE');
    seen.add(id);
    const owner = byId.get(id);
    if (!owner || line.tenantId !== tenantId || line.productId !== owner.productId) throw new ProcurementPreflightError('RECEIPT_SCOPE_INVALID');
    const quantity = units(line.quantity);
    if (quantity === 0n || quantity > owner.quantity - owner.received) throw new ProcurementPreflightError('OVER_RECEIPT');
    owner.increment = quantity;
  }
  const lines = Object.freeze([...byId.values()].map(line => Object.freeze({
    orderLineId: line.id, productId: line.productId, previouslyReceived: format(line.received),
    proposedReceipt: format(line.increment), outstandingAfter: format(line.quantity - line.received - line.increment)
  })));
  const complete = [...byId.values()].every(line => line.quantity === line.received + line.increment);
  return Object.freeze({ tenantId, orderId, supplierId, actorId, effectKey, expectedRevision: input.expectedRevision,
    proposedRevision: input.expectedRevision + 1, nextStatus: complete ? 'received' : 'partially_received',
    lines, persisted: false, stockMoved: false, apPosted: false, ledgerPosted: false,
    requiresTenantScopedTransaction: true, requiresEffectKeyUniqueness: true, requiresOrderRevisionCAS: true });
}
