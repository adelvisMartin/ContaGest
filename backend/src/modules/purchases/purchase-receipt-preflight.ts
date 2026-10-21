/** #757: receipt quantity preflight only. Never books inventory or payable invoices. */
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEC=/^(0|[1-9]\d{0,14})(?:\.(\d{1,3}))?$/;
function units(v:string){if(typeof v!=='string'||!DEC.test(v))throw new TypeError('RECEIPT_QUANTITY_INVALID');const [i,f='']=v.split('.');return BigInt(i)*1000n+BigInt(f.padEnd(3,'0'));}
function exact(u:bigint){return String(u/1000n)+'.'+String(u%1000n).padStart(3,'0');}
export function preparePurchaseReceipt(input:{tenantId:string;actorTenantId:string;orderTenantId:string;orderId:string;lineId:string;status:'confirmed'|'partially_received';expectedRevision:number;orderedExact:string;alreadyReceivedExact:string;pendingOtherReceiptExact:string;requestExact:string;idempotencyKey:string}){
 if(!input||![input.tenantId,input.actorTenantId,input.orderTenantId,input.orderId,input.lineId].every(v=>typeof v==='string'&&ID.test(v))||input.actorTenantId!==input.tenantId||input.orderTenantId!==input.tenantId)throw new TypeError('RECEIPT_TENANT_SCOPE_INVALID');
 if(!['confirmed','partially_received'].includes(input.status)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||input.expectedRevision>=Number.MAX_SAFE_INTEGER)throw new TypeError('RECEIPT_STATE_REVISION_INVALID');
 if(typeof input.idempotencyKey!=='string'||!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/.test(input.idempotencyKey))throw new TypeError('RECEIPT_IDEMPOTENCY_KEY_INVALID');
 const ordered=units(input.orderedExact),received=units(input.alreadyReceivedExact),pending=units(input.pendingOtherReceiptExact),requested=units(input.requestExact);
 if(ordered===0n||requested===0n||received>ordered||pending>ordered-received||requested>ordered-received-pending)throw new TypeError('RECEIPT_OVER_RECEIPT_FORBIDDEN');
 const after=received+requested;
 return Object.freeze({tenantId:input.tenantId,orderId:input.orderId,lineId:input.lineId,idempotencyKey:input.idempotencyKey,expectedRevision:input.expectedRevision,proposedRevision:input.expectedRevision+1,
  requestedExact:exact(requested),receivedAfterExact:exact(after),outstandingAfterExact:exact(ordered-after),availableForFurtherReceiptExact:exact(ordered-after-pending),
  // Deprecated legacy suggestion: based on ONE line and never proof that the
  // multi-line PurchaseOrder is globally received.
  nextOrderStatus:after===ordered?'received':'partially_received',
  nextLineReceiptStatus:after===ordered?'received':'partially_received',
  orderWideStatusAuthorized:false as const,
  requiresOrderWideStatusReconciliation:true as const,
  requiresTenantScopedSerializableTransaction:true as const,
  persisted:false as const,inventoryMovementAuthorized:false as const,supplierInvoiceAuthorized:false as const,ledgerAuthorized:false as const});
}
