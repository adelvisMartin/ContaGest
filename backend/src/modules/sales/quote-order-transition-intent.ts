/** #753 – deterministic pre-transaction intent; this helper cannot create orders, reservations or invoices. */
export type CommercialDocument = 'quote'|'order';
export type CommercialAction = 'send'|'accept'|'reject'|'expire'|'cancel'|'confirm'|'start_partial'|'fulfill';
export const QUOTE_ORDER_TRANSITIONS = Object.freeze({
  quote:{draft:{send:'sent',cancel:'cancelled'},sent:{accept:'accepted',reject:'rejected',expire:'expired',cancel:'cancelled'}},
  order:{draft:{confirm:'confirmed',cancel:'cancelled'},confirmed:{start_partial:'partially_fulfilled',fulfill:'fulfilled',cancel:'cancelled'},partially_fulfilled:{fulfill:'fulfilled',cancel:'cancelled'}}
} as const);
const KEY = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
export function prepareQuoteOrderTransition(input:{kind:CommercialDocument; tenantId:string; documentId:string;
  from:string; action:CommercialAction; expectedRevision:number; actorTenantId:string}) {
  if(!input||!['quote','order'].includes(input.kind)||typeof input.tenantId!=='string'||
    !KEY.test(input.tenantId)||typeof input.actorTenantId!=='string'||input.actorTenantId!==input.tenantId||
    typeof input.documentId!=='string'||!KEY.test(input.documentId))throw new TypeError('SALES_TRANSITION_SCOPE_INVALID');
  if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||input.expectedRevision>=Number.MAX_SAFE_INTEGER)
    throw new TypeError('SALES_TRANSITION_REVISION_INVALID');
  const domain=QUOTE_ORDER_TRANSITIONS[input.kind] as Record<string,Record<string,string>|undefined>;
  // TypeScript unions do not protect JavaScript/API callers at runtime.
  // An inherited Object.prototype method is never an authorized transition.
  const state=Object.hasOwn(domain,input.from)?domain[input.from]:undefined;
  const to=state&&Object.hasOwn(state,input.action)?state[input.action]:undefined;
  if(typeof to!=='string')throw new TypeError('SALES_TRANSITION_NOT_ALLOWED');
  return Object.freeze({kind:input.kind,tenantId:input.tenantId,documentId:input.documentId,
    from:input.from,to,action:input.action,expectedRevision:input.expectedRevision,
    proposedRevision:input.expectedRevision+1,requiresTenantScopedCAS:true as const,
    persisted:false as const,invoiceAuthorized:false as const,reservationAuthorized:false as const,
    ledgerAuthorized:false as const});
}
