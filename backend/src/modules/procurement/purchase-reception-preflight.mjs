// @ts-check
/** #757 Pure intake preflight. Server must re-read and lock PO/receipt rows in its transaction. */
const DEC=/^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,6})?$/;
const KEY=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const SCALE=1000000n;
const MAX=999999999999999999999n;
/** @param {unknown} value */
function units(value){
 if(typeof value!=='string'||!DEC.test(value))throw new TypeError('PURCHASE_RECEPTION_DECIMAL_INVALID');
 const [w,f='']=value.split('.');
 const v=BigInt(w)*SCALE+BigInt(f.padEnd(6,'0')||'0');
 if(v>MAX)throw new TypeError('PURCHASE_RECEPTION_DECIMAL_OVERFLOW');
 return v;
}
/** @param {bigint} value */
function formatted(value){return (value/SCALE)+'.'+(value%SCALE).toString().padStart(6,'0');}
/**
 * @param {{tenantId:string,orderTenantId:string,orderId:string,receiptOrderId:string,
 * lineId:string,receiptLineId:string,orderStatus:string,
 * orderedExact:string,receivedExact:string,pendingOtherReceiptExact:string,requestedExact:string}} input
 */
export function preparePurchaseReception(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('PURCHASE_RECEPTION_INPUT_INVALID');
 const fields=[input.tenantId,input.orderTenantId,input.orderId,input.receiptOrderId,input.lineId,input.receiptLineId];
 if(fields.some(v=>typeof v!=='string'||!KEY.test(v))||input.orderTenantId!==input.tenantId||
    input.receiptOrderId!==input.orderId||input.receiptLineId!==input.lineId)
   throw new TypeError('PURCHASE_RECEPTION_SCOPE_INVALID');
 if(!['confirmed','partially_received'].includes(input.orderStatus))
   throw new TypeError('PURCHASE_RECEPTION_ORDER_NOT_RECEIVABLE');
 const ordered=units(input.orderedExact),received=units(input.receivedExact),
       pending=units(input.pendingOtherReceiptExact),request=units(input.requestedExact);
 if(ordered===0n||request===0n||received>ordered||pending>ordered-received||request>ordered-received-pending)
   throw new TypeError('PURCHASE_RECEPTION_OVERRECEIPT');
 const remaining=ordered-received-pending-request;
 return Object.freeze({tenantId:input.tenantId,orderId:input.orderId,lineId:input.lineId,
   requestedExact:formatted(request),outstandingAfterExact:formatted(remaining),
   fullyReceivedWhenPendingSettled:remaining===0n,requiresLockedOwnerTransaction:true,
   persisted:false,stockMovementAuthorized:false,accountsPayableAuthorized:false});
}
