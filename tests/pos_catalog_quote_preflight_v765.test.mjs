import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routeSource=readFileSync(new URL('../backend/src/modules/sales/sales.routes.ts',import.meta.url),'utf8');
const uiSource=readFileSync(new URL('../frontend/src/pages/SalesPage.jsx',import.meta.url),'utf8');
const start=routeSource.indexOf("router.post('/pos/catalog-quote-preview'");
const end=routeSource.indexOf("router.get('/', requirePermission('sales.view')",start);
assert.ok(start>0&&end>start,'route exists immediately before generic sales read');
// Isolated function-source regression runs under Node without transpiling the TS route.
// Remove only this audited type annotation from the mock-executed route excerpt.
const snippet=routeSource.slice(start,end).replace('line: {productId:string;expectedSku:string}','line');
const A='a5b468dc-347d-416a-80a7-8184e657db61';
const requestLines=[{productId:A,quantity:'1.125',expectedSku:'SKU-001'}];
const price=(value)=>({toFixed:()=>value});
const product=()=>({id:A,sku:'SKU-001',name:'Producto',
  price:price('2.25'),taxRate:price('16.00'),
  stock:price('10.000'),reserved:price('1.000')});
class PosStockPreviewError extends Error {constructor(code){super(code);this.code=code;}}
class HttpError extends Error {constructor(status,message,details){super(message);this.status=status;this.details=details;}}

function setup({rows=[product()],invalid=false,stockInvalid=false,calculationInvalid=false,requested=requestLines}={}){
  const calls={};
  let handler;
  const router={post:(path,permission,validate,callback)=>{
    calls.path=path;calls.permission=permission;calls.validation=validate;handler=callback;
  }};
  const validate=(lines)=>{
    calls.requested=lines;
    if(invalid)throw new PosStockPreviewError('INVALID_LINES');
    return lines;
  };
  const stock=(lines,products)=>{
    calls.stockInput={lines,products};
    if(stockInvalid||products.length!==lines.length)throw new PosStockPreviewError('MISSING_PRODUCT');
    return {readOnly:true,ready:true,lines:[]};
  };
  const calculate=(input)=>{
    calls.calcInput=input;
    if(calculationInvalid)throw new Error('canonical failed');
    return {
      lines:input.map(()=>({total:price('2.53')})),
      subtotal:price('2.53'),tax:price('0.40'),total:price('2.93')
    };
  };
  const prisma={product:{findMany:async (query)=>{calls.query=query;return rows;}}};
  const execute=new Function('router','requirePermission','validateBody','posCatalogQuoteSchema',
    'asyncHandler','context','validatePosStockLines','PosStockPreviewError',
    'HttpError','prisma','previewPosStock','calculateInvoiceTotals','ok',snippet);
  execute(router,x=>x,x=>x,{strict:true},x=>x,
    ()=>({tenantId:'tenant-A'}),validate,PosStockPreviewError,HttpError,
    prisma,stock,calculate,(res,data)=>{calls.response=data;});
  return {calls,run:async ()=>{
    const res={setHeader:(key,value)=>{calls[key]=value;}};
    await handler({body:{lines:requested}},res);
    return calls;
  }};
}

test('route has view RBAC, strict body, no-store and tenant scoped active products',async()=>{
  const x=setup();const c=await x.run();
  assert.equal(c.path,'/pos/catalog-quote-preview');
  assert.equal(c.permission,'sales.view');
  assert.equal(c['Cache-Control'],'private, no-store');
  assert.deepEqual(c.query.where,{tenantId:'tenant-A',active:true,id:{in:[A]}});
  assert.deepEqual(c.query.select,{id:true,sku:true,name:true,price:true,taxRate:true,stock:true,reserved:true});
});
test('calculator is the existing canonical invoice function, with server price not browser price',async()=>{
  const c=await setup().run();
  assert.deepEqual(c.calcInput,[{productId:A,sku:'SKU-001',name:'Producto',quantity:'1.125',unitAmount:'2.25',taxRate:'16.00'}]);
  assert.equal(c.response.subtotal,'2.53');
  assert.equal(c.response.estimatedTax,'0.40');
  assert.equal(c.response.estimatedTotal,'2.93');
  assert.equal(c.response.lines[0].lineSubtotal,'2.53');
});
test('quote is explicitly read-only and not fiscal, currency or checkout authority',async()=>{
  const q=(await setup().run()).response;
  assert.equal(q.readOnly,true);
  assert.equal(q.authoritativeForCheckout,false);
  assert.equal(q.currency,null);
  assert.equal(q.fiscalLocalizationApplied,false);
  assert.equal(q.priceListsApplied,false);
  assert.equal(q.pricingBasis,'current_product_catalog');
});
test('stock preview is reused for the same tenant-scoped product snapshot',async()=>{
  const c=await setup().run();
  assert.deepEqual(c.stockInput.lines,requestLines);
  assert.deepEqual(c.stockInput.products,[{id:A,stock:'10.000',reserved:'1.000'}]);
  assert.equal(c.response.stock.ready,true);
});
test('invalid cart rejected 400 before any product query',async()=>{
  const x=setup({invalid:true});
  await assert.rejects(x.run(),err=>err instanceof HttpError && err.status===400);
  assert.equal(x.calls.query,undefined);
});
test('missing stock/other-tenant product rejected 409 before calculating totals',async()=>{
  const x=setup({rows:[]});
  await assert.rejects(x.run(),err=>err instanceof HttpError && err.status===409);
  assert.equal(x.calls.calcInput,undefined);
});
test('unidentified server product cannot be priced or silently matched',async()=>{
  const x=setup({rows:[{...product(),name:'  '}]});
  await assert.rejects(x.run(),err=>err instanceof HttpError&&err.status===409);
  assert.equal(x.calls.calcInput,undefined);
});
test('canonical financial calculation failures are not converted to fake success',async()=>{
  const x=setup({calculationInvalid:true});
  await assert.rejects(x.run(),/canonical failed/);
  assert.equal(x.calls.response,undefined);
});
test('no invoice, payment, stock or audit mutation in preflight route',()=>{
  assert.doesNotMatch(snippet,/\b(?:create|update|delete|upsert|executeRaw|queryRaw)\s*\(/);
  assert.doesNotMatch(snippet,/runFinancialIdempotentMutation|ledgerEntry|payment\.create/);
  assert.match(snippet,/calculateInvoiceTotals\(catalogLines\)/);
});
test('Sales UI calls estimate endpoint and rejects stale or malformed response',()=>{
  assert.match(uiSource,/BackendApi\.post\('\/sales\/pos\/catalog-quote-preview'/);
  assert.match(uiSource,/posCartRevisionRef\.current===revision/);
  assert.match(uiSource,/posCartRef\.current===snapshot/);
  assert.match(uiSource,/result\.authoritativeForCheckout!==false/);
  assert.match(uiSource,/result\.currency!==null/);
  assert.match(uiSource,/No aplica listas de precios/);
  assert.match(uiSource,/Esta estimación no es una factura/);
});
test('Sales UI clears prior quote on quantity edit and tenant switch',()=>{
  assert.match(uiSource,/function invalidatePosVerification\(\)\{[\s\S]*?setPosQuotePreview\(null\)/);
  assert.match(uiSource,/posTenantRef\.current===posTenantId\?posQuotePreview:null/);
  assert.match(uiSource,/setPosQuotePreview\(null\)/);
});
test('rejects stale SKU for the same product UUID before quoting price',async()=>{
  const x=setup({rows:[{...product(),sku:'SKU-002'}]});
  await assert.rejects(x.run(),err=>err instanceof HttpError
    && err.status===409 && err.details?.code==='POS_CATALOG_SKU_CHANGED');
  assert.equal(x.calls.calcInput,undefined);
  assert.equal(x.calls.response,undefined);
});
test('validates product identity without case folding or trimming, keeping leading zeros',async()=>{
  const x=setup({rows:[{...product(),sku:'0000123'}],requested:[{...requestLines[0],expectedSku:'0000123'}]});
  const c=await x.run();
  assert.equal(c.response.lines[0].sku,'0000123');
  assert.equal(c.response.estimatedTotal,'2.93');
});
test('SKU differing only by case still rejects stale identity',async()=>{
  const x=setup({rows:[{...product(),sku:'sku-001'}]});
  await assert.rejects(x.run(),err=>err instanceof HttpError&&err.status===409
    && err.details?.code==='POS_CATALOG_SKU_CHANGED');
  assert.equal(x.calls.calcInput,undefined);
});
test('missing expected SKU rejects stale snapshot before canonical invoice calculation',async()=>{
  const x=setup({requested:[{productId:A,quantity:'1.125'}]});
  await assert.rejects(x.run(),err=>err instanceof HttpError&&err.status===409
    && err.details?.code==='POS_CATALOG_SKU_CHANGED');
  assert.equal(x.calls.calcInput,undefined);
});
test('new route uses strict request schema with normalized expected SKU',()=>{
  assert.match(routeSource,/const posCatalogQuoteSchema = z\.object\(\{/);
  assert.match(routeSource,/expectedSku:z\.string\(\)\.min\(1\)\.max\(64\)\.refine\(sku=>normalizePosScanCode\(sku\)===sku\)/);
  assert.match(routeSource,/validateBody\(posCatalogQuoteSchema\)/);
  assert.match(routeSource,/\.strict\(\)\)\.min\(1\)\.max\(100\)/);
});
test('Sales quote sends exact previously confirmed SKU and checks echo',()=>{
  const start=uiSource.indexOf('async function checkPosCatalogQuote');
  const end=uiSource.indexOf('async function checkPosStockPreview',start);
  const code=uiSource.slice(start,end);
  assert.match(code,/expectedSkus=snapshot\.map\(\(line\)=>posNames\[line\.productId\]\?\.sku\)/);
  assert.match(code,/expectedSku:expectedSkus\[index\]/);
  assert.match(code,/line\.sku!==expectedSkus\[index\]/);
  assert.match(code,/posCartRevisionRef\.current===revision/);
});
