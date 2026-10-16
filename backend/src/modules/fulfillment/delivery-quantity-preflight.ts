/** #754 – pure delivery quantity guard; no reservation consumption or invoices. */
const DEC=/^(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
function q(s:string){if(typeof s!=='string'||!DEC.test(s))throw new TypeError('DELIVERY_QUANTITY_INVALID');const [i,f='']=s.split('.');return BigInt(i)*1000000n+BigInt(f.padEnd(6,'0'));}
function format(n:bigint){const s=(n%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return `${n/1000000n}${s?'.'+s:''}`;}
export function prepareDeliveryQuantity(input:{tenantId:string;orderTenantId:string;orderId:string;ownerType:'sales-order';ownerId:string;
  orderedExact:string;previouslyFulfilledExact:string;reservedOutstandingExact:string;requestedDeliveryExact:string}) {
 if(!input||typeof input.tenantId!=='string'||!ID.test(input.tenantId)||input.orderTenantId!==input.tenantId||
  typeof input.orderId!=='string'||!ID.test(input.orderId)||input.ownerType!=='sales-order'||input.ownerId!==input.orderId)
  throw new TypeError('DELIVERY_RESERVATION_SCOPE_INVALID');
 const ordered=q(input.orderedExact),done=q(input.previouslyFulfilledExact),reserved=q(input.reservedOutstandingExact),request=q(input.requestedDeliveryExact);
 if(ordered===0n||request===0n||done>ordered||request>reserved||request>ordered-done)throw new TypeError('DELIVERY_OVERFULFILL_OR_UNRESERVED');
 const future=done+request;
 return Object.freeze({tenantId:input.tenantId,orderId:input.orderId,deliverExact:format(request),
  fulfilledAfterExact:format(future),outstandingAfterExact:format(ordered-future),
  fullyFulfilled:future===ordered,requiresTransactionalReservationConsume:true as const,
  persisted:false as const,invoiceAuthorized:false as const,stockMovementAuthorized:false as const});
}
