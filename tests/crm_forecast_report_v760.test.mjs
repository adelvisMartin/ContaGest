import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeCrmForecast,CrmForecastLimitError,CrmForecastDataError,
  CRM_FORECAST_MAX_ROWS,CRM_FORECAST_PAGE_SIZE} from '../backend/src/modules/crm/crm-forecast.mjs';

const record=(id,change={})=>({
  id,tenantId:'tenant-a',moduleSlug:'crm-opportunities',status:'qualified',
  payload:{currency:'USD',expectedValue:'0.01',probability:50},...change
});
const list=(values)=>values.sort((a,b)=>a.id.localeCompare(b));
function fakeDb(values,{mapQuery}={}){
  const queries=[],transactions=[];
  const db={$transaction:async(fn,opts)=>{
    transactions.push(opts);
    const tx={moduleRecord:{findMany:async(q)=>{
      queries.push(q);
      if(mapQuery)return mapQuery(q,queries.length);
      const index=q.cursor?values.findIndex(row=>row.id===q.cursor.id)+1:0;
      return values.slice(index,index+q.take);
    }}};
    return fn(tx);
  }};
  return {db,queries,transactions};
}
test('empty company forecast is an explicit zero, never a reused tenant value',async()=>{
 const s=fakeDb([]);
 const x=await summarizeCrmForecast({db:s.db,tenantId:'tenant-a'});
 assert.deepEqual(x,{policy:'crm-qualified-forecast-v1',evaluatedCount:0,
  excludedLostCount:0,currencyTotals:[]});
 assert.deepEqual(s.transactions,[{isolationLevel:'RepeatableRead',timeout:15000}]);
 assert.deepEqual(s.queries[0].where,{
  tenantId:'tenant-a',moduleSlug:'crm-opportunities',status:{not:'archived'}
 });
 assert.deepEqual(s.queries[0].select,{
  id:true,tenantId:true,moduleSlug:true,status:true,payload:true
 });
});
test('tiny weighted cents round ONCE per currency rather than per deal',async()=>{
 const s=fakeDb(list([record('001'),record('002')]));
 const result=await summarizeCrmForecast({db:s.db,tenantId:'tenant-a'});
 assert.deepEqual(result.currencyTotals,[{currency:'USD',count:2,gross:'0.02',weighted:'0.01'}]);
 assert.equal(result.evaluatedCount,2);
});
test('mixed currencies are never converted or added together',async()=>{
 const s=fakeDb(list([
  record('001',{payload:{currency:'VES',expectedValue:'100.00',probability:20}}),
  record('002',{payload:{currency:'USD',expectedValue:'2.00',probability:50}})
 ]));
 const x=await summarizeCrmForecast({db:s.db,tenantId:'tenant-a'});
 assert.deepEqual(x.currencyTotals,[
  {currency:'USD',count:1,gross:'2.00',weighted:'1.00'},
  {currency:'VES',count:1,gross:'100.00',weighted:'20.00'}
 ]);
});
test('lost opportunities are counted as excluded but never contribute income',async()=>{
 const s=fakeDb(list([
  record('001',{status:'lost',payload:{currency:'USD',expectedValue:'99999.99',probability:100}}),
  record('002',{payload:{currency:'USD',expectedValue:'2.00',probability:75}})
 ]));
 const x=await summarizeCrmForecast({db:s.db,tenantId:'tenant-a'});
 assert.equal(x.excludedLostCount,1);
 assert.equal(x.evaluatedCount,2);
 assert.deepEqual(x.currencyTotals,[{currency:'USD',count:1,gross:'2.00',weighted:'1.50'}]);
});
test('keyset pagination covers ALL pages beyond default 50 or 100 rows',async()=>{
 const values=Array.from({length:501},(_,i)=>record(String(i+1).padStart(5,'0')));
 const s=fakeDb(values);
 const x=await summarizeCrmForecast({db:s.db,tenantId:'tenant-a'});
 assert.equal(CRM_FORECAST_PAGE_SIZE,250);
 assert.equal(x.evaluatedCount,501);
 assert.equal(x.currencyTotals[0].gross,'5.01');
 assert.equal(x.currencyTotals[0].weighted,'2.51');
 assert.deepEqual(s.queries[1].cursor,{id:'00250'});
 assert.equal(s.queries[1].skip,1);
 assert.equal(s.queries[2].take,250);
});
test('exactly 10000 rows succeeds only after verifying there is no extra page',async()=>{
 const values=Array.from({length:CRM_FORECAST_MAX_ROWS},(_,i)=>record(String(i+1).padStart(5,'0')));
 const s=fakeDb(values);
 const x=await summarizeCrmForecast({db:s.db,tenantId:'tenant-a'});
 assert.equal(x.evaluatedCount,10000);
 assert.equal(x.currencyTotals[0].gross,'100.00');
 assert.equal(s.queries.length,41);
});
test('10001st record causes fail-closed limit error: never a partial forecast',async()=>{
 const values=Array.from({length:CRM_FORECAST_MAX_ROWS+1},(_,i)=>record(String(i+1).padStart(5,'0')));
 const s=fakeDb(values);
 await assert.rejects(summarizeCrmForecast({db:s.db,tenantId:'tenant-a'}),CrmForecastLimitError);
});
test('tenant leak in a broken Prisma reader blocks the whole summary',async()=>{
 const s=fakeDb([record('001',{tenantId:'tenant-b'})]);
 await assert.rejects(summarizeCrmForecast({db:s.db,tenantId:'tenant-a'}),CrmForecastDataError);
});
test('wrong ModuleRecord slug or unsupported commercial stage fails closed',async()=>{
 for(const item of [record('001',{moduleSlug:'sales'}),
   record('001',{status:'won'}),record('001',{status:'proposal'})]){
  const s=fakeDb([item]);
  await assert.rejects(summarizeCrmForecast({db:s.db,tenantId:'tenant-a'}),CrmForecastDataError);
 }
});
test('invalid money or probability blocks all totals',async()=>{
 for(const payload of [
  {currency:'USD',expectedValue:'1.001',probability:90},
  {currency:'usd',expectedValue:'1.00',probability:90},
  {currency:'USD',expectedValue:'1.00',probability:150},
  {currency:'USD',expectedValue:'1.00',probability:'50'},
  null
 ]){
  const s=fakeDb([record('001',{payload})]);
  await assert.rejects(summarizeCrmForecast({db:s.db,tenantId:'tenant-a'}));
 }
});
test('reader returning too many rows or non-array fails closed',async()=>{
 for(const output of [null,{},Array.from({length:251},(_,i)=>record(String(i).padStart(5,'0')))]){
  const s=fakeDb([],{mapQuery:()=>output});
  await assert.rejects(summarizeCrmForecast({db:s.db,tenantId:'tenant-a'}),CrmForecastDataError);
 }
});
test('nonascending duplicated cursor IDs block inconsistent paging',async()=>{
 const s=fakeDb([],{mapQuery:(q,i)=>i===1?[record('002'),record('001')]:[]});
 await assert.rejects(summarizeCrmForecast({db:s.db,tenantId:'tenant-a'}),CrmForecastDataError);
});
test('tenant context and read transaction are mandatory',async()=>{
 await assert.rejects(summarizeCrmForecast({db:fakeDb([]).db,tenantId:''}),/CRM_TENANT_REQUIRED/);
 await assert.rejects(summarizeCrmForecast({db:{},tenantId:'tenant-a'}),/CRM_TRANSACTION_REQUIRED/);
 await assert.rejects(summarizeCrmForecast({db:{$transaction:async fn=>fn({})},tenantId:'tenant-a'}),/CRM_FORECAST_STORE_REQUIRED/);
});
test('route enforces sales.view and reports capacity errors without false success',()=>{
 const route=readFileSync(new URL('../backend/src/modules/crm/crm-opportunities.routes.ts',import.meta.url),'utf8');
 assert.match(route,/router\.get\('\/forecast',requirePermission\('sales\.view'\)/);
 assert.match(route,/summarizeCrmForecast\(\{db:prisma,tenantId:ctx\.tenantId\}\)/);
 assert.match(route,/CrmForecastLimitError/);
 assert.match(route,/new HttpError\(503/);
 assert.match(route,/Cache-Control','private, no-store'/);
});
test('backend packaged ESM contains forecast file without adding a second DB',()=>{
 const file=readFileSync(new URL('../backend/scripts/copy-runtime-assets.mjs',import.meta.url),'utf8');
 assert.match(file,/src\/modules\/crm\/crm-forecast\.mjs/);
 assert.match(file,/dist\/src\/modules\/crm\/crm-forecast\.mjs/);
});
