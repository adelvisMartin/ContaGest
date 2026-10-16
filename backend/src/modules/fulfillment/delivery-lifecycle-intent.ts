/** #754. Delivery lifecycle proposal; transaction, reservations and stock remain server authorities. */
export type DeliveryStatus='draft'|'allocated'|'picking'|'dispatched'|'delivered'|'cancelled';
export type DeliveryAction='allocate'|'start_pick'|'dispatch'|'confirm_delivery'|'cancel';
const TRANSITIONS={
  draft:{allocate:'allocated',cancel:'cancelled'},
  allocated:{start_pick:'picking',cancel:'cancelled'},
  picking:{dispatch:'dispatched',cancel:'cancelled'},
  dispatched:{confirm_delivery:'delivered'},
  delivered:{},
  cancelled:{},
} as const;
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const fail=():never=>{throw new Error('DELIVERY_LIFECYCLE_TRANSITION_INVALID');};
export function prepareDeliveryTransition(input:{
  tenantId:string;actorTenantId:string;deliveryId:string;orderId:string;
  currentStatus:DeliveryStatus;action:DeliveryAction;expectedRevision:number;
}) {
  if(!input||!ID.test(input.tenantId)||input.actorTenantId!==input.tenantId||
    !ID.test(input.deliveryId)||!ID.test(input.orderId)||
    !Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||
    input.expectedRevision>=Number.MAX_SAFE_INTEGER||
    !Object.hasOwn(TRANSITIONS,input.currentStatus))fail();
  const actions=TRANSITIONS[input.currentStatus] as Partial<Record<DeliveryAction,DeliveryStatus>>;
  const target=actions[input.action];
  if(!target)fail();
  return Object.freeze({
    tenantId:input.tenantId,deliveryId:input.deliveryId,orderId:input.orderId,
    from:input.currentStatus,to:target,action:input.action,
    expectedRevision:input.expectedRevision,nextRevision:input.expectedRevision+1,
    requiresTenantScopedCompareAndSwap:true as const,
    requiresOwnerReservationCheck:input.action==='allocate'||input.action==='dispatch'||input.action==='confirm_delivery',
    requiresAtomicStockEffect:input.action==='confirm_delivery',
    requiresReservationRelease:input.action==='cancel'&&input.currentStatus!=='draft',
    persisted:false as const,stockConsumed:false as const,invoiceAuthorized:false as const,
    ledgerAuthorized:false as const,
  });
}
