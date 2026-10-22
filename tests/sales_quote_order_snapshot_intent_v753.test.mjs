import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAcceptedQuoteSnapshot} from '../backend/src/modules/sales/quote-order-snapshot-intent.ts';
const quote={id:'quote-1',tenantId:'tenant-A',clientId:'client-1',status:'accepted',revision:2,currency:'VES',totalExact:'120.00',
 lines:[{id:'l-1',tenantId:'tenant-A',productId:'p-1',quantityExact:'2.000',unitPriceExact:'50.00',taxAmountExact:'20.00',lineTotalExact:'120.00',currency:'VES'}]};
const go=(q=quote,rev=2,actor='tenant-A')=>prepareAcceptedQuoteSnapshot({quote:q,expectedRevision:rev,actorTenantId:actor});
const fail=fn=>assert.throws(fn,{message:'QUOTE_SNAPSHOT_CONVERSION_PRECONDITION_FAILED'});
test('#753 preserves quoted unit price, tax and currency without current-rate recompute',()=>{
 const a=go();assert.equal(a.lines[0].unitPriceExact,'50.00');assert.equal(a.lines[0].taxAmountExact,'20.00');
 assert.equal(a.priceRecalculated,false);assert.equal(a.taxRecalculated,false);assert.equal(a.orderCreated,false);assert.ok(Object.isFrozen(a.lines));
});
test('#753 cannot create an order from draft/rejected quote or stale revision',()=>{
 fail(()=>go({...quote,status:'draft'}));fail(()=>go({...quote,status:'rejected'}));fail(()=>go(quote,1));
});
test('#753 cross-tenant quote and product line snapshots fail closed',()=>{
 fail(()=>go(quote,2,'tenant-B'));
 fail(()=>go({...quote,lines:[{...quote.lines[0],tenantId:'tenant-B'}]}));
});
test('#753 total mismatch and precision failures must not silently round',()=>{
 fail(()=>go({...quote,totalExact:'119.99'}));fail(()=>go({...quote,totalExact:'1e5'}));
 fail(()=>go({...quote,lines:[{...quote.lines[0],quantityExact:'0.000'}]}));
 fail(()=>go({...quote,lines:[{...quote.lines[0],unitPriceExact:'1.123'}]}));
});
test('#753 duplicate line identity and currency mismatch forbidden',()=>{
 fail(()=>go({...quote,lines:[quote.lines[0],quote.lines[0]]}));
 fail(()=>go({...quote,lines:[{...quote.lines[0],currency:'USD'}]}));
});
test('#753 output is an intent only; never allocates nor authorizes invoice/ledger',()=>{
 const a=go();assert.equal(a.inventoryReserved,false);assert.equal(a.converted,false);assert.equal(a.requiresTenantScopedConversionKey,true);
});

// Identifiers must be real strings, never JS objects with coercing toString().
test('#753 rejects coercible quote, actor, customer, line and product identifiers',()=>{
 const forged=value=>({toString:()=>value});
 const tenant=forged('tenant-A');
 fail(()=>go({...quote,tenantId:tenant},2,tenant));
 fail(()=>go({...quote,id:forged('quote-1')}));
 fail(()=>go({...quote,clientId:forged('client-1')}));
 fail(()=>go({...quote,lines:[{...quote.lines[0],id:forged('l-1')}]}));
 fail(()=>go({...quote,lines:[{...quote.lines[0],productId:forged('p-1')}]}));
});

test('#753 rejects coerced quote/line currency identities',()=>{
 const currency={toString:()=> 'VES'};
 fail(()=>go({...quote,currency,lines:[{...quote.lines[0],currency}]}));
});
