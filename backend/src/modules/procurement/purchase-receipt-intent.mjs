/** #757 Preflight only. Inventory/GL writes belong to their respective authorities. */
const DECIMAL = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,6})?$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,119}$/;
function units(value) {
  if (typeof value !== 'string' || !DECIMAL.test(value)) throw new Error('INVALID_QUANTITY');
  const [whole, frac = ''] = value.split('.');
  return BigInt(whole) * 1000000n + BigInt(frac.padEnd(6, '0'));
}
function decimal(value) { return `${value / 1000000n}.${String(value % 1000000n).padStart(6,'0')}`; }
/**
 * Input is server-verified order facts. This function never trusts user-supplied
 * receipt totals or emits a stock movement; transaction owner must revalidate.
 */
export function preparePurchaseReceipt(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !ID.test(input.tenantId || '') || !ID.test(input.orderId || '') ||
      !ID.test(input.receiptKey || '') || !['confirmed', 'partially_received'].includes(input.orderStatus) ||
      !Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) {
    throw new Error('INVALID_RECEIPT_SCOPE');
  }
  const ids = new Set();
  const lines = input.lines.map(line => {
    if (!line || !ID.test(line.lineId || '') || !ID.test(line.productId || '') ||
        line.tenantId !== input.tenantId || line.orderId !== input.orderId ||
        ids.has(line.lineId)) throw new Error('RECEIPT_LINE_SCOPE_MISMATCH');
    ids.add(line.lineId);
    const ordered = units(line.ordered), already = units(line.previouslyReceived), incoming = units(line.incoming);
    if (ordered <= 0n || incoming <= 0n || already > ordered || already + incoming > ordered) {
      throw new Error('RECEIPT_OVER_DELIVERY');
    }
    return Object.freeze({lineId:line.lineId, productId:line.productId,
      quantityToReceive:decimal(incoming), totalAfter:decimal(already+incoming),
      outstandingAfter:decimal(ordered-already-incoming)});
  });
  const remaining = lines.reduce((v,line)=>v+units(line.outstandingAfter),0n);
  return Object.freeze({
    tenantId:input.tenantId,orderId:input.orderId,receiptKey:input.receiptKey,
    nextOrderStatus:remaining===0n && input.coversAllOpenLines===true?'received':'partially_received',
    lines:Object.freeze(lines),requiresTransactionalRevalidation:true,inventoryCommitted:false,
    invoiceCreated:false,ledgerPosted:false
  });
}
