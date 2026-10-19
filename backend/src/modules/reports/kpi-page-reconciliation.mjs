// @ts-check
/**
 * #771 A page can only be compared to the canonical summary if it contains
 * ALL rows. This is not a ledger reconciliation or posting authority.
 */
const DEC=/^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,6})?$/;
const DIM=/^[A-Z][A-Z0-9]{2,7}$/;
/** @param {unknown} value */
function exact(value){
 if(typeof value!=='string'||!DEC.test(value))throw new TypeError('KPI_RECONCILIATION_DECIMAL_INVALID');
 const negative=value[0]==='-',s=negative?value.slice(1):value;
 const [whole,decimal='']=s.split('.');
 const n=BigInt(whole)*1000000n+BigInt(decimal.padEnd(6,'0')||'0');
 return negative?-n:n;
}
/**
 * @param {{summary:unknown, rows:unknown, skip:unknown, hasMore:unknown}} input
 */
export function reconcileKpiPage(input){
 if(!input||typeof input!=='object'||Array.isArray(input)
   ||!Array.isArray(input.summary)||!Array.isArray(input.rows)
   ||!Number.isSafeInteger(input.skip)||input.skip<0||typeof input.hasMore!=='boolean')
   throw new TypeError('KPI_RECONCILIATION_INPUT_INVALID');
 const groupCount=new Map(),groupAmount=new Map();
 let fullCount=0;
 for(const group of input.summary){
   if(!group||typeof group!=='object'||Array.isArray(group)
     ||!DIM.test(group.currency)||typeof group.status!=='string'||!['issued','paid','overdue'].includes(group.status)
     ||!Number.isSafeInteger(group.invoiceCount)||group.invoiceCount<0)
     throw new TypeError('KPI_RECONCILIATION_GROUP_INVALID');
   const key=group.currency+'|'+group.status;
   if(groupCount.has(key))throw new TypeError('KPI_RECONCILIATION_GROUP_DUPLICATE');
   groupCount.set(key,group.invoiceCount);groupAmount.set(key,exact(group.totalExact));
   fullCount+=group.invoiceCount;
   if(!Number.isSafeInteger(fullCount))throw new TypeError('KPI_RECONCILIATION_COUNT_OVERFLOW');
 }
 const totalCount=fullCount;
 if(input.skip!==0||input.hasMore===true){
   return Object.freeze({status:'NOT_COMPLETE',detailsComplete:false,summaryMatchesVisibleRows:null,
     fullDocumentCount:totalCount,visibleDocumentCount:input.rows.length,ledgerReconciled:false});
 }
 const seen=new Set(),matchedCounts=new Map(),matchedAmounts=new Map();
 for(const row of input.rows){
   if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id
     ||seen.has(row.id)||!DIM.test(row.currency)||!['issued','paid','overdue'].includes(row.status))
     throw new TypeError('KPI_RECONCILIATION_ROW_INVALID');
   seen.add(row.id);
   const key=row.currency+'|'+row.status;
   if(!groupCount.has(key))throw new TypeError('KPI_RECONCILIATION_ROW_GROUP_INVALID');
   matchedCounts.set(key,(matchedCounts.get(key)||0)+1);
   matchedAmounts.set(key,(matchedAmounts.get(key)||0n)+exact(row.totalExact));
 }
 const matches=totalCount===input.rows.length&&[...groupCount].every(([key,count])=>
   count===(matchedCounts.get(key)||0)&&groupAmount.get(key)===(matchedAmounts.get(key)||0n));
 return Object.freeze({status:matches?'MATCH':'MISMATCH',detailsComplete:true,
   summaryMatchesVisibleRows:matches,fullDocumentCount:totalCount,
   visibleDocumentCount:input.rows.length,ledgerReconciled:false});
}
