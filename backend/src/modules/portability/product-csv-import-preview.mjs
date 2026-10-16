// @ts-check
/**
 * #770 No-write product CSV dry run, NOT import authorization.
 * All headers/fields are strict; no tenant/price/stock/audit mutable columns.
 */
const MAX_BYTES=262144,MAX_ROWS=1000,MAX_CELLS=3;
const KEY=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const SKU=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const ALLOWED=new Set(['sku','name','description']);
/** @param {string} code */
function fail(code){throw new TypeError('PORTABILITY_CSV_'+code);}
/** Parse RFC 4180-style quoted fields without evaluating CSV data. @param {string} csv */
function parse(csv){
 /** @type {string[][]} */ const rows=[];
 /** @type {string[]} */ let row=[];
 let cell='',quoted=false,afterQuote=false,start=true;
 const flush=()=>{row.push(cell);if(row.length>MAX_CELLS)fail('TOO_MANY_COLUMNS');cell='';start=true;afterQuote=false;};
 const finish=()=>{flush();if(row.length!==1||row[0]!=='')rows.push(row);row=[];if(rows.length>MAX_ROWS+1)fail('TOO_MANY_ROWS');};
 for(let i=0;i<csv.length;i++){
  const ch=csv[i];
  if(quoted){
   if(ch==='"'){if(csv[i+1]==='"'){cell+='"';i++;}else{quoted=false;afterQuote=true;}}
   else cell+=ch;
  }else if(ch==='"'){
   if(!start||afterQuote)fail('MALFORMED_QUOTE');
   quoted=true;start=false;
  }else if(ch===',' ){flush();}
  else if(ch==='\n'||ch==='\r'){
   if(ch==='\r'){if(csv[i+1]!=='\n')fail('MALFORMED_LINE_ENDING');i++;}
   finish();
  }else{
   if(afterQuote)fail('MALFORMED_QUOTE');
   cell+=ch;start=false;
  }
 }
 if(quoted)fail('UNCLOSED_QUOTE');
 if(cell!==''||row.length||afterQuote)finish();
 return rows;
}
/**
 * @param {{tenantId:unknown,actorTenantId:unknown,entity:unknown,csv:unknown}} input
 */
export function previewProductCsvImport(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('INPUT_INVALID');
 if(typeof input.tenantId!=='string'||!KEY.test(input.tenantId)
   ||input.actorTenantId!==input.tenantId||input.entity!=='products')fail('SCOPE_INVALID');
 if(typeof input.csv!=='string'||Buffer.byteLength(input.csv,'utf8')>MAX_BYTES)fail('SIZE_INVALID');
 const csv=input.csv.charCodeAt(0)===0xfeff?input.csv.slice(1):input.csv;
 if(csv.includes('\0'))fail('NULL_BYTE');
 const rows=parse(csv);
 if(rows.length<2)fail('NO_ROWS');
 const header=rows[0].map(c=>c.trim().toLowerCase());
 if(header.length<2||header.length>MAX_CELLS||new Set(header).size!==header.length
   ||header.some(h=>!ALLOWED.has(h))||!header.includes('sku')||!header.includes('name'))
   fail('HEADERS_INVALID');
 /** @type {{row:number,sku:string,name:string,description:string}[]} */ const valid=[];
 /** @type {{row:number,code:string}[]} */ const errors=[];
 const seen=new Set();
 for(let i=1;i<rows.length;i++){
  const cells=rows[i];
  const rowNo=i+1;
  if(cells.length!==header.length){errors.push(Object.freeze({row:rowNo,code:'COLUMN_COUNT'}));continue;}
  const values=Object.fromEntries(header.map((h,k)=>[h,cells[k].trim()]));
  const sku=values.sku||'',name=values.name||'',description=values.description||'';
  if(!SKU.test(sku)){errors.push(Object.freeze({row:rowNo,code:'INVALID_SKU'}));continue;}
  if(name.length<2||name.length>160||description.length>1000
     ||/[\x00-\x1f\x7f]/.test(name+description)||/^[\s]*[=+@-]/.test(name)
     ||/^[\s]*[=+@-]/.test(description)){
   errors.push(Object.freeze({row:rowNo,code:'UNSAFE_TEXT'}));continue;
  }
  const identity=sku.toUpperCase();
  if(seen.has(identity)){errors.push(Object.freeze({row:rowNo,code:'DUPLICATE_SKU'}));continue;}
  seen.add(identity);
  valid.push(Object.freeze({row:rowNo,sku,name,description}));
 }
 return Object.freeze({entity:'products',rowCount:rows.length-1,validCount:valid.length,errorCount:errors.length,
   rows:Object.freeze(valid),errors:Object.freeze(errors),readOnly:true,committable:false,
   requiresTenantCatalogDedupe:true,persisted:false});
}
